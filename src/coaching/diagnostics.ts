import type { Color, Diagnostic, DiagnosticKind, MoveQuality, PieceType } from '@/types';
import type { Move } from '@/chess/rules';
import { fullmoveNumber, safeFen } from '@/chess/fen';
import {
  detectFork,
  developmentInfo,
  doubledPawnFiles,
  findPins,
  freeCaptures,
  hangingPieces,
  isEndgame,
  passedPawns,
  piecesOf,
  rooksOnOpenFiles,
} from '@/chess/positionFeatures';
import { PIECE_VALUE, sanToFrench } from '@/chess/pieces';
import { PHRASES } from './phrases';

export interface DiagnosticInput {
  fenBefore: string;
  fenAfter: string;
  move: Move;
  playerColor: Color;
  /** Perte en centipions du coup joue. */
  cpLoss: number;
  quality: MoveQuality;
  /** Meilleur coup en SAN (anglais), s'il differe du coup joue. */
  bestMoveSan: string | null;
  /** Vrai si un mat force a ete manque. */
  missedMate: boolean;
  /** Coups deja joues par le joueur (SAN + cases), pour detecter les repetitions. */
  playerMoveHistory: ReadonlyArray<{ from: string; to: string; piece: PieceType }>;
  /** Contexte d'ouverture, si le mode « tester une ouverture » est actif. */
  opening: {
    active: boolean;
    inBookBefore: boolean;
    inBookAfter: boolean;
    variationName: string | null;
    suggestion: string | null;
  } | null;
}

const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

/** Priorites conformes a l'ordre defini par le cahier des charges. */
const PRIORITY: Record<DiagnosticKind, number> = {
  mate_delivered: 100,
  mate_missed: 96,
  piece_lost: 92,
  piece_hanging: 88,
  free_capture_available: 84,
  check_or_threat: 80,
  fork: 76,
  pin: 72,
  double_attack: 68,
  king_exposed: 64,
  development_lag: 60,
  no_castle: 56,
  center_control: 52,
  misplaced_piece: 48,
  bad_trade: 44,
  pawn_structure: 40,
  rook_activity: 36,
  passed_pawn: 32,
  endgame_plan: 28,
  opening_deviation: 62,
  opening_ok: 24,
  neutral: 1,
};

function make(kind: DiagnosticKind, text: string, squares?: string[], bonus = 0): Diagnostic {
  return { kind, priority: PRIORITY[kind] + bonus, text, squares };
}

/**
 * Produit la liste des diagnostics pertinents pour un coup, triee par priorite.
 * Aucune limite n'est appliquee ici : c'est `coach.ts` qui n'en retient que 1 ou 2.
 */
export function diagnose(input: DiagnosticInput): Diagnostic[] {
  const before = safeFen(input.fenBefore);
  const after = safeFen(input.fenAfter);
  if (!before || !after) return [];

  const me = input.playerColor;
  const foe = other(me);
  const out: Diagnostic[] = [];
  const moveNumber = fullmoveNumber(input.fenBefore);
  // Quand le moteur valide le coup, on ne l'accuse pas de perdre du materiel :
  // le sacrifice est alors justifie tactiquement.
  const engineApproves = input.cpLoss < 50;

  /* --- 1. Mat --------------------------------------------------------- */
  if (after.isCheckmate()) {
    out.push(make('mate_delivered', PHRASES.mateDelivered(), [input.move.to]));
    return out;
  }
  if (input.missedMate && input.bestMoveSan) {
    out.push(make('mate_missed', PHRASES.mateMissed(sanToFrench(input.bestMoveSan))));
  }

  /* --- 2 et 3. Materiel perdu / en prise ------------------------------ */
  const opponentCaptures = freeCaptures(after, foe);
  const myHanging = hangingPieces(after, me);

  if (!engineApproves && opponentCaptures.length > 0 && opponentCaptures[0].gain >= 200) {
    const threat = opponentCaptures[0];
    const victim = after.get(threat.to as never);
    if (victim) {
      out.push(
        make('piece_lost', PHRASES.pieceLost(victim.type, threat.to, sanToFrench(threat.san)), [
          threat.to,
          threat.from,
        ]),
      );
    }
  } else if (!engineApproves && myHanging.length > 0) {
    const worst = [...myHanging].sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type])[0];
    out.push(
      myHanging.length >= 2
        ? make(
            'piece_hanging',
            PHRASES.pieceHangingMultiple(myHanging.length),
            myHanging.map((p) => p.square),
          )
        : make('piece_hanging', PHRASES.pieceHanging(worst.type, worst.square), [worst.square]),
    );
  }

  /* --- 4. Prise gratuite disponible ----------------------------------- */
  const myCapturesBefore = freeCaptures(before, me);
  const missedCapture = myCapturesBefore.find(
    (c) => c.gain >= 200 && !(c.from === input.move.from && c.to === input.move.to),
  );
  if (missedCapture && input.cpLoss >= 80) {
    out.push(
      make(
        'free_capture_available',
        PHRASES.freeCaptureMissed(sanToFrench(missedCapture.san), missedCapture.captured),
        [missedCapture.to],
      ),
    );
  }
  const myCapturesAfter = freeCaptures(after, me);
  if (!missedCapture && myCapturesAfter.length > 0 && myCapturesAfter[0].gain >= 200) {
    const gift = myCapturesAfter[0];
    out.push(
      make('free_capture_available', PHRASES.freeCaptureNow(sanToFrench(gift.san), gift.captured), [
        gift.to,
      ]),
    );
  }

  /* --- 5. Echec / menace directe -------------------------------------- */
  if (after.isCheck() && !after.isCheckmate()) {
    out.push(make('check_or_threat', PHRASES.checkThreat(sanToFrench(input.move.san))));
  }

  /* --- 6. Fourchette --------------------------------------------------- */
  const fork = detectFork(after, input.move.to);
  if (fork) {
    const piece = after.get(input.move.to as never);
    if (piece) {
      out.push(
        make('fork', PHRASES.forkCreated(piece.type, input.move.to, fork.targets.length), [
          input.move.to,
          ...fork.targets,
        ]),
      );
    }
  }

  /* --- 7. Clouage ------------------------------------------------------ */
  const myPins = findPins(after, me);
  const newPin = myPins.find((p) => p.pinner === input.move.to);
  if (newPin) {
    const pinned = after.get(newPin.pinned as never);
    if (pinned) {
      out.push(
        make('pin', PHRASES.pinCreated(pinned.type, newPin.pinned), [
          newPin.pinner,
          newPin.pinned,
          newPin.target,
        ]),
      );
    }
  }
  if (!engineApproves) {
    const foePins = findPins(after, foe);
    const suffered = foePins.find((p) => p.pinned === input.move.to);
    if (suffered) {
      const pinned = after.get(suffered.pinned as never);
      if (pinned) {
        out.push(
          make('pin', PHRASES.pinSuffered(pinned.type, suffered.pinned), [
            suffered.pinned,
            suffered.pinner,
          ]),
        );
      }
    }
  }

  /* --- 8. Attaque double (sans fourchette formelle) -------------------- */
  if (!fork) {
    const attacked = piecesOf(after, foe).filter((p) =>
      after.attackers(p.square as never, me).includes(input.move.to as never),
    );
    if (attacked.length >= 2) {
      out.push(
        make('double_attack', PHRASES.doubleAttack(input.move.to), [
          input.move.to,
          ...attacked.map((p) => p.square),
        ]),
      );
    }
  }

  /* --- 9 a 11. Roi, developpement, roque ------------------------------- */
  const dev = developmentInfo(after, me);
  const isCastlingMove = input.move.flags.includes('k') || input.move.flags.includes('q');

  if (isCastlingMove) {
    out.push(make('no_castle', PHRASES.castleGood(), [input.move.to], 6));
  } else if (!dev.hasCastled && moveNumber >= 8 && dev.kingOnStart) {
    if (moveNumber >= 12) {
      out.push(make('king_exposed', PHRASES.kingExposed()));
    } else {
      out.push(make('no_castle', PHRASES.noCastle()));
    }
  }

  if (moveNumber <= 12 && dev.undeveloped.length >= 2) {
    const repeated = input.playerMoveHistory.some((m) => m.to === input.move.from);
    if (repeated && input.move.piece !== 'p') {
      const sleeping = dev.undeveloped[0];
      out.push(
        make('development_lag', PHRASES.developmentLag(input.move.piece, sleeping.square), [
          sleeping.square,
        ]),
      );
    }
  }

  /* --- 12. Controle du centre ------------------------------------------ */
  const centerSquares = ['d4', 'e4', 'd5', 'e5'];
  if (input.move.piece === 'p' && centerSquares.includes(input.move.to)) {
    out.push(make('center_control', PHRASES.centerGood(input.move.to), [input.move.to]));
  }

  /* --- 13. Piece mal placee -------------------------------------------- */
  if (
    input.move.piece === 'n' &&
    moveNumber <= 12 &&
    (input.move.to[0] === 'a' || input.move.to[0] === 'h')
  ) {
    out.push(make('misplaced_piece', PHRASES.misplacedPiece('n', input.move.to), [input.move.to]));
  }

  /* --- 14. Echange defavorable ----------------------------------------- */
  if (input.move.captured) {
    const gained = PIECE_VALUE[input.move.captured];
    const risked = PIECE_VALUE[input.move.piece];
    const recaptured = hangingPieces(after, me).some((p) => p.square === input.move.to);
    if (recaptured && risked > gained + 60) {
      out.push(
        make('bad_trade', PHRASES.badTrade(input.move.piece, input.move.captured), [input.move.to]),
      );
    } else if (!recaptured && gained >= 300) {
      out.push(make('bad_trade', PHRASES.goodTrade(input.move.captured), [input.move.to], 4));
    }
  }

  /* --- 15. Structure de pions ------------------------------------------ */
  const doubledBefore = doubledPawnFiles(before, me);
  const doubledAfter = doubledPawnFiles(after, me);
  const newDoubled = doubledAfter.find((f) => !doubledBefore.includes(f));
  if (newDoubled) {
    out.push(make('pawn_structure', PHRASES.pawnStructure(newDoubled)));
  }

  /* --- 16. Activite des tours ------------------------------------------ */
  if (input.move.piece === 'r' && rooksOnOpenFiles(after, me).includes(input.move.to)) {
    out.push(make('rook_activity', PHRASES.rookActivity(input.move.to), [input.move.to]));
  }

  /* --- 17. Pion passe --------------------------------------------------- */
  const passedBefore = passedPawns(before, me);
  const passedAfter = passedPawns(after, me);
  const newPassed = passedAfter.find((sq) => !passedBefore.includes(sq));
  if (newPassed) {
    out.push(make('passed_pawn', PHRASES.passedPawn(newPassed), [newPassed]));
  }

  /* --- 18. Plan de finale ----------------------------------------------- */
  if (isEndgame(after)) {
    out.push(make('endgame_plan', PHRASES.endgamePlan()));
  }

  /* --- Developpement reussi (message positif) ---------------------------- */
  if (!isCastlingMove && (input.move.piece === 'n' || input.move.piece === 'b')) {
    const startSquares = me === 'w' ? ['b1', 'g1', 'c1', 'f1'] : ['b8', 'g8', 'c8', 'f8'];
    if (startSquares.includes(input.move.from) && input.cpLoss < 100) {
      out.push(
        make('center_control', PHRASES.developmentGood(input.move.piece), [input.move.to], 8),
      );
    }
  }

  /* --- Ouverture --------------------------------------------------------- */
  if (input.opening?.active) {
    if (input.opening.inBookBefore && !input.opening.inBookAfter) {
      const suggestion = input.opening.suggestion ? sanToFrench(input.opening.suggestion) : null;
      out.push(
        input.cpLoss >= 100
          ? make('opening_deviation', PHRASES.openingBadDeviation(suggestion))
          : make('opening_deviation', PHRASES.openingLeftBook(suggestion), undefined, -25),
      );
    } else if (input.opening.inBookAfter && input.opening.variationName) {
      out.push(make('opening_ok', PHRASES.openingInBook(input.opening.variationName)));
    }
  }

  return out.sort((a, b) => b.priority - a.priority);
}
