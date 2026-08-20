import type { Color, GamePhase, PositionPlan, Square } from '@/types';
import { PIECE_VALUE } from '@/chess/pieces';
import { safeFen } from '@/chess/fen';
import {
  developmentInfo,
  findKing,
  kingSafetyScore,
  kingZoneAttackers,
  mateInOneMoves,
  notablePassedPawns,
  soundCaptures,
  worstHangingPiece,
} from '@/chess/positionFeatures';
import { POSITION_PHRASES } from './positionPhrases';
import { detectPhase, leastActivePiece, usefulOpenFile } from './positionAssessment';

const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

export interface PlanInput {
  fen: string;
  perspective: Color;
  /** Phase deja detectee ; recalculee si elle n'est pas fournie. */
  phase?: GamePhase;
  /** Camp disposant d'un mat force, quand le moteur l'a confirme. */
  forcedMate?: Color | null;
}

/**
 * Une seule priorite, formulee comme un objectif et non comme un coup.
 *
 * L'ordre des regles suit la logique d'un joueur qui progresse : d'abord ne
 * rien perdre, puis mettre le roi a l'abri, puis ameliorer ses pieces.
 * Chaque regle s'appuie uniquement sur des faits calcules dans la position.
 */
export function buildPlan(input: PlanInput): PositionPlan | null {
  const chess = safeFen(input.fen);
  if (!chess) return null;

  const me = input.perspective;
  const foe = other(me);
  const phase = input.phase ?? detectPhase(chess);
  const endgame = phase === 'endgame';

  const plan = (text: string, confidence: PositionPlan['confidence'], squares: Square[] = []) => ({
    text,
    confidence,
    squares,
  });

  const myTurn = chess.turn() === me;

  /* --- 0. Parer l'echec et le mat avant toute autre consideration ------ */
  // Sans ces deux regles, le plan conseillait d'activer son roi ou d'occuper
  // une colonne pendant que l'adversaire annoncait mat.
  if (myTurn && chess.isCheck()) {
    const king = findKing(chess, me);
    return plan(POSITION_PHRASES.planAnswerCheck(), 'high', king ? [king] : []);
  }
  if (myTurn && mateInOneMoves(chess, me).length > 0) {
    return plan(POSITION_PHRASES.planFinishMate(), 'high');
  }
  const mateThreat = mateInOneMoves(chess, other(me))[0];
  if (mateThreat) {
    return plan(POSITION_PHRASES.planStopMate(), 'high', [mateThreat.to]);
  }
  // Un mat plus long n'est visible qu'avec le moteur : sans cette regle, le
  // plan conseillait d'activer son roi pendant qu'un mat force etait en cours.
  if (input.forcedMate === me) return plan(POSITION_PHRASES.planFinishMate(), 'high');
  if (input.forcedMate === foe) return plan(POSITION_PHRASES.planStopMate(), 'high');

  /* --- 1. Ne rien laisser en prise ------------------------------------ */
  const hanging = worstHangingPiece(chess, me);
  if (hanging && PIECE_VALUE[hanging.type] >= 300) {
    return plan(POSITION_PHRASES.planSaveHanging(hanging.type, hanging.square), 'high', [
      hanging.square,
    ]);
  }

  /* --- 2. Encaisser le materiel disponible ----------------------------- */
  const capture = soundCaptures(chess, me)[0];
  if (capture && capture.gain >= 200) {
    return plan(POSITION_PHRASES.planTakeMaterial(capture.captured), 'high', [capture.to]);
  }

  /* --- 2 bis. Un pion vraiment gratuit merite aussi le detour ---------- */
  if (hanging && hanging.type === 'p') {
    return plan(POSITION_PHRASES.planDefendPawn(hanging.square), 'high', [hanging.square]);
  }

  /* --- 3. Mettre son roi a l'abri -------------------------------------- */
  const dev = developmentInfo(chess, me);
  if (!endgame && !dev.hasCastled && dev.kingOnStart) {
    const rights = chess.getCastlingRights(me);
    if (rights.k || rights.q || kingZoneAttackers(chess, me) >= 2) {
      const king = findKing(chess, me);
      return plan(POSITION_PHRASES.planCastle(), 'high', king ? [king] : []);
    }
  }

  /* --- 4. Attaquer un roi reellement expose ---------------------------- */
  const foeKing = findKing(chess, foe);
  if (
    !endgame &&
    foeKing &&
    kingSafetyScore(chess, foe, { endgame: false }) <= -1.2 &&
    kingZoneAttackers(chess, foe) >= 2
  ) {
    return plan(POSITION_PHRASES.planAttackKing(foe), 'medium', [foeKing]);
  }

  /* --- 5. Neutraliser un pion passe adverse ---------------------------- */
  const foePassed = notablePassedPawns(chess, foe);
  if (foePassed.length > 0) {
    const mostAdvanced = foePassed.sort((a, b) =>
      foe === 'w' ? Number(b[1]) - Number(a[1]) : Number(a[1]) - Number(b[1]),
    )[0];
    return plan(POSITION_PHRASES.planBlockPassed(mostAdvanced), 'high', [mostAdvanced]);
  }

  /* --- 6. Finir son developpement -------------------------------------- */
  if (!endgame && dev.undeveloped.length >= 2) {
    return plan(
      POSITION_PHRASES.planDevelop(),
      'high',
      dev.undeveloped.slice(0, 2).map((p) => p.square),
    );
  }

  /* --- 7. Occuper une colonne ouverte ----------------------------------- */
  const freeFile = usefulOpenFile(chess, me);
  if (freeFile) {
    return plan(POSITION_PHRASES.planRookOpenFile(freeFile), 'medium');
  }

  /* --- 8. Pousser son pion passe ---------------------------------------- */
  const myPassed = notablePassedPawns(chess, me);
  if (myPassed.length > 0) {
    return plan(POSITION_PHRASES.planPushPassed(myPassed[0]), 'high', [myPassed[0]]);
  }

  /* --- 9. Debloquer une piece totalement immobile -------------------------- */
  const worst = leastActivePiece(chess, me);
  if (worst && worst.moves === 0) {
    return plan(POSITION_PHRASES.planImprovePiece(worst.piece.type, worst.piece.square), 'high', [
      worst.piece.square,
    ]);
  }

  /* --- 10. Activer le roi en finale ---------------------------------------- */
  if (endgame) {
    const king = findKing(chess, me);
    return plan(POSITION_PHRASES.planActivateKing(), 'medium', king ? [king] : []);
  }

  /* --- 11. Ameliorer sa pire piece ------------------------------------------ */
  if (worst && worst.moves <= 4) {
    return plan(POSITION_PHRASES.planImprovePiece(worst.piece.type, worst.piece.square), 'high', [
      worst.piece.square,
    ]);
  }

  /* --- 12. Reprendre le centre ----------------------------------------------- */
  if (dev.centerPawns === 0) {
    return plan(POSITION_PHRASES.planTakeCenter(), 'medium');
  }

  return plan(POSITION_PHRASES.planDefault(), 'medium');
}
