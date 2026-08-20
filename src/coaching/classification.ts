import type { MoveQuality } from '@/types';
import { QUALITY_LABEL } from './phrases';

/** Seuils de perte, en centipions, utilises pour classer un coup. */
export const CP_LOSS_THRESHOLDS = {
  excellent: 20,
  good: 50,
  playable: 100,
  inaccuracy: 150,
  mistake: 300,
} as const;

export interface ClassificationInput {
  /** Perte en centipions par rapport au meilleur coup (>= 0). */
  cpLoss: number;
  /** true si le coup joue est exactement le meilleur coup du moteur. */
  isBestMove: boolean;
  /** true si un mat force etait disponible et n'a pas ete joue. */
  missedMate: boolean;
  /** true si le coup joue donne mat. */
  deliversMate: boolean;
}

/**
 * Classe un coup a partir de la perte d'evaluation.
 * Le mat manque est prioritaire : c'est la faute la plus couteuse.
 */
export function classifyMove(input: ClassificationInput): MoveQuality {
  if (input.deliversMate) return 'best';
  if (input.missedMate) return 'missed_mate';
  if (input.isBestMove) return 'best';

  const loss = Math.max(0, input.cpLoss);
  if (loss < CP_LOSS_THRESHOLDS.excellent) return 'excellent';
  if (loss < CP_LOSS_THRESHOLDS.good) return 'good';
  if (loss < CP_LOSS_THRESHOLDS.playable) return 'playable';
  if (loss < CP_LOSS_THRESHOLDS.inaccuracy) return 'inaccuracy';
  if (loss < CP_LOSS_THRESHOLDS.mistake) return 'mistake';
  return 'blunder';
}

/** Libelle francais d'une qualite de coup. */
export function qualityLabel(quality: MoveQuality): string {
  return QUALITY_LABEL[quality];
}

/** true si la qualite correspond a une faute a comptabiliser. */
export function isMistakeLike(quality: MoveQuality): boolean {
  return quality === 'mistake' || quality === 'blunder' || quality === 'missed_mate';
}

/** true si la qualite correspond a un bon coup. */
export function isGoodQuality(quality: MoveQuality): boolean {
  return quality === 'best' || quality === 'excellent' || quality === 'good';
}
