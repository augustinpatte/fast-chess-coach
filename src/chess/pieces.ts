import type { PieceType, Square } from '@/types';

/** Valeur materielle classique, en centipions. */
export const PIECE_VALUE: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

/** Nom francais singulier d'une piece. */
export const PIECE_NAME_FR: Record<PieceType, string> = {
  p: 'pion',
  n: 'cavalier',
  b: 'fou',
  r: 'tour',
  q: 'dame',
  k: 'roi',
};

/**
 * Genre grammatical de chaque piece : la tour et la dame sont feminines.
 * Sert a accorder articles, possessifs et participes dans les phrases.
 */
export const PIECE_GENDER: Record<PieceType, 'm' | 'f'> = {
  p: 'm',
  n: 'm',
  b: 'm',
  r: 'f',
  q: 'f',
  k: 'm',
};

/** Nom francais avec article defini contracte ("ton cavalier"). */
export const PIECE_NAME_FR_PLURAL: Record<PieceType, string> = {
  p: 'pions',
  n: 'cavaliers',
  b: 'fous',
  r: 'tours',
  q: 'dames',
  k: 'rois',
};

/** Lettre de piece utilisee en notation algebrique francaise. */
export const PIECE_LETTER_FR: Record<PieceType, string> = {
  p: '',
  n: 'C',
  b: 'F',
  r: 'T',
  q: 'D',
  k: 'R',
};

/**
 * Convertit un SAN anglais (Nf3, Bxc4, Qd1) en SAN francais (Cf3, Fxc4, Dd1).
 * Les cases, prises, roques et symboles restent identiques.
 */
export function sanToFrench(san: string): string {
  if (san === 'O-O' || san === '0-0') return 'O-O';
  if (san === 'O-O-O' || san === '0-0-0') return 'O-O-O';
  const map: Record<string, string> = { N: 'C', B: 'F', R: 'T', Q: 'D', K: 'R' };
  // La promotion "=Q" doit aussi etre traduite.
  return san.replace(/[NBRQK]/g, (letter) => map[letter] ?? letter);
}

/** Retourne la description courte d'une case ("le cavalier f3"). */
export function describePieceOn(type: PieceType, square: Square): string {
  return `${PIECE_NAME_FR[type]} ${square}`;
}
