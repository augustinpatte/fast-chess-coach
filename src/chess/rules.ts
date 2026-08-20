import { Chess, type Move } from 'chess.js';
import type { Color, GameEndReason, PieceType, Square } from '@/types';

export type { Move };

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Cree une instance chess.js a partir d'un FEN (ou de la position initiale). */
export function createGame(fen?: string): Chess {
  return fen ? new Chess(fen) : new Chess();
}

/** Tous les coups legaux de la position (objets detailles). */
export function legalMoves(chess: Chess): Move[] {
  return chess.moves({ verbose: true });
}

/** Coups legaux partant d'une case donnee. */
export function movesFromSquare(chess: Chess, square: Square): Move[] {
  return legalMoves(chess).filter((m) => m.from === square);
}

/** true si le coup (from -> to) est legal, promotion comprise. */
export function isLegalMove(
  chess: Chess,
  from: Square,
  to: Square,
  promotion?: PieceType,
): boolean {
  return legalMoves(chess).some(
    (m) => m.from === from && m.to === to && (!promotion || m.promotion === promotion),
  );
}

/** true si un coup from -> to implique une promotion. */
export function isPromotionMove(chess: Chess, from: Square, to: Square): boolean {
  return legalMoves(chess).some((m) => m.from === from && m.to === to && Boolean(m.promotion));
}

/** Convertit un coup UCI ('e2e4', 'e7e8q') en objet Move sans modifier la partie. */
export function uciToMove(fen: string, uci: string): Move | null {
  if (uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? (uci[4] as PieceType) : undefined;
  const probe = new Chess(fen);
  try {
    return probe.move({ from, to, promotion }) as Move;
  } catch {
    return null;
  }
}

/** Convertit un coup UCI en SAN, ou null si le coup est illegal. */
export function uciToSan(fen: string, uci: string): string | null {
  return uciToMove(fen, uci)?.san ?? null;
}

/** Convertit un coup SAN ('Nf3', 'O-O') en notation UCI, ou null s'il est illegal. */
export function sanToUci(fen: string, san: string): string | null {
  try {
    return moveToUci(new Chess(fen).move(san) as Move);
  } catch {
    return null;
  }
}

/** Convertit un objet Move en notation UCI. */
export function moveToUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

/**
 * Traduit une suite de coups UCI en SAN, en s'arretant au premier coup illegal.
 * Utilise pour afficher une variante courte lisible.
 */
export function uciLineToSan(fen: string, line: string[], maxPlies = 4): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of line.slice(0, maxPlies)) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? (uci[4] as PieceType) : undefined;
    try {
      const move = chess.move({ from, to, promotion });
      out.push(move.san);
    } catch {
      break;
    }
  }
  return out;
}

/** Case du roi de la couleur donnee. */
export function kingSquare(chess: Chess, color: Color): Square | null {
  const found = chess.findPiece({ type: 'k', color });
  return found.length > 0 ? found[0] : null;
}

/** Determine la raison de fin de partie, ou null si la partie continue. */
export function endReason(chess: Chess): GameEndReason | null {
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isInsufficientMaterial()) return 'insufficient_material';
  if (chess.isThreefoldRepetition()) return 'threefold';
  if (chess.isDrawByFiftyMoves()) return 'fifty_moves';
  return null;
}

/** Compte le materiel d'une couleur, en centipions (roi exclu). */
export function materialCount(
  chess: Chess,
  color: Color,
  values: Record<PieceType, number>,
): number {
  let total = 0;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === color && cell.type !== 'k') total += values[cell.type];
    }
  }
  return total;
}
