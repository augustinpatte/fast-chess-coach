import type { Color, WatchFocus } from '@/types';
import { PIECE_VALUE } from '@/chess/pieces';
import { safeFen } from '@/chess/fen';
import {
  findKing,
  isDefended,
  kingSafetyScore,
  kingZoneAttackers,
  notablePassedPawns,
  piecesOf,
  worstHangingPiece,
} from '@/chess/positionFeatures';
import { POSITION_PHRASES } from './positionPhrases';
import {
  detectPhase,
  leastActivePiece,
  outpostSquares,
  usefulOpenFile,
} from './positionAssessment';

const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

/** Nombre maximal de cases mises en evidence : le plateau doit rester lisible. */
export const MAX_WATCH_SQUARES = 3;

export interface WatchInput {
  fen: string;
  perspective: Color;
}

/**
 * Pistes de lecture, de la plus urgente a la plus calme.
 *
 * Aucune de ces phrases ne donne le meilleur coup : elles posent une question
 * dont la reponse se lit directement sur l'echiquier.
 */
export function watchFocusCandidates(input: WatchInput): WatchFocus[] {
  const chess = safeFen(input.fen);
  if (!chess) return [];

  const me = input.perspective;
  const foe = other(me);
  const phase = detectPhase(chess);
  const out: WatchFocus[] = [];

  /* --- Une de mes pieces est attaquee --------------------------------- */
  const hanging = worstHangingPiece(chess, me);
  if (hanging) {
    out.push({
      text: POSITION_PHRASES.watchOwnPiece(hanging.type, hanging.square),
      squares: [hanging.square, ...chess.attackers(hanging.square as never, foe).slice(0, 2)],
      confidence: 'high',
    });
  }

  /* --- Une piece adverse non defendue --------------------------------- */
  // Une piece adverse non defendue n'est instructive que si elle est deja sous
  // le feu : sinon on signalerait les tours de depart a chaque coup.
  const loose = piecesOf(chess, foe)
    .filter(
      (p) =>
        p.type !== 'k' &&
        p.type !== 'p' &&
        !isDefended(chess, p.square, foe) &&
        chess.attackers(p.square as never, me).length > 0,
    )
    .sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type])[0];
  if (loose) {
    out.push({
      text: POSITION_PHRASES.watchEnemyPiece(loose.type, loose.square),
      squares: [loose.square],
      confidence: 'high',
    });
  }

  /* --- Mon roi sous pression ------------------------------------------ */
  const myKing = findKing(chess, me);
  const pressure = kingZoneAttackers(chess, me);
  if (myKing && pressure >= 2 && phase !== 'endgame') {
    out.push({
      text: POSITION_PHRASES.watchOwnKing(myKing),
      squares: [myKing],
      confidence: 'high',
    });
  }

  /* --- Le roi adverse expose ------------------------------------------ */
  const foeKing = findKing(chess, foe);
  if (foeKing && phase !== 'endgame' && kingSafetyScore(chess, foe, { endgame: false }) <= -1) {
    out.push({
      text: POSITION_PHRASES.watchEnemyKing(foe, foeKing),
      squares: [foeKing],
      confidence: 'medium',
    });
  }

  /* --- Un pion passe --------------------------------------------------- */
  const passed = [...notablePassedPawns(chess, foe), ...notablePassedPawns(chess, me)][0];
  if (passed) {
    out.push({
      text: POSITION_PHRASES.watchPassedPawn(passed),
      squares: [passed],
      confidence: 'high',
    });
  }

  /* --- Une colonne ouverte inoccupee ----------------------------------- */
  const freeFile = usefulOpenFile(chess, me);
  if (freeFile) {
    out.push({
      text: POSITION_PHRASES.watchOpenFile(freeFile),
      squares: [`${freeFile}${me === 'w' ? 4 : 5}`],
      confidence: 'high',
    });
  }

  /* --- Une case faible dans le camp adverse ---------------------------- */
  const outpost = outpostSquares(chess, me)[0];
  if (outpost) {
    out.push({
      text: POSITION_PHRASES.watchWeakSquare(outpost),
      squares: [outpost],
      confidence: 'medium',
    });
  }

  /* --- Ma piece la moins active ----------------------------------------- */
  // En ouverture, une piece encore sur sa case de depart n'apprend rien :
  // c'est le developpement qui est en cause, pas son activite.
  const homeSquares =
    me === 'w'
      ? ['a1', 'b1', 'c1', 'd1', 'f1', 'g1', 'h1']
      : ['a8', 'b8', 'c8', 'd8', 'f8', 'g8', 'h8'];
  const worst = leastActivePiece(chess, me);
  if (worst && !(phase === 'opening' && homeSquares.includes(worst.piece.square))) {
    out.push({
      text: POSITION_PHRASES.watchInactivePiece(worst.piece.type, worst.piece.square),
      squares: [worst.piece.square],
      confidence: 'high',
    });
  }

  /* --- Repli : le centre ------------------------------------------------- */
  out.push({
    text: POSITION_PHRASES.watchCenter(),
    squares: ['e4', 'd4', 'd5'],
    confidence: 'high',
  });

  return out.map((focus) => ({ ...focus, squares: focus.squares.slice(0, MAX_WATCH_SQUARES) }));
}

/**
 * Piste courante. `index` permet de faire defiler les pistes lorsque le joueur
 * appuie plusieurs fois sur « Que regarder ? » dans la meme position.
 */
export function buildWatchFocus(input: WatchInput, index = 0): WatchFocus | null {
  const candidates = watchFocusCandidates(input);
  if (candidates.length === 0) return null;
  return candidates[index % candidates.length];
}
