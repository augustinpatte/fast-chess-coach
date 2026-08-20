import { Chess } from 'chess.js';
import type { Color } from '@/types';

/** Charge un FEN sans lever d'exception ; renvoie null s'il est invalide. */
export function safeFen(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

/** true si le FEN est syntaxiquement valide. */
export function isValidFen(fen: string): boolean {
  return safeFen(fen) !== null;
}

/** Couleur au trait dans un FEN. */
export function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

/**
 * Renvoie le meme FEN mais avec le trait a la couleur demandee.
 * Le champ « en passant » est neutralise pour eviter une position incoherente.
 * Sert a calculer les menaces adverses quand ce n'est pas leur tour.
 */
export function fenWithTurn(fen: string, color: Color): string {
  const parts = fen.split(' ');
  if (parts.length < 6) return fen;
  parts[1] = color;
  parts[3] = '-';
  return parts.join(' ');
}

/** Numero de coup complet (1, 2, 3...) extrait d'un FEN. */
export function fullmoveNumber(fen: string): number {
  const n = Number(fen.split(' ')[5]);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
