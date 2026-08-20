import type { EstimatedLevel, GameSummary } from '@/types';

/** Fenetre de parties utilisee pour l'estimation. */
export const ESTIMATE_WINDOW = 20;

export const ESTIMATE_DISCLAIMER = 'Cette estimation n’est pas un classement officiel.';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Estimation locale et volontairement prudente du niveau.
 *
 * Elle combine :
 *  - une performance simplifiee contre les niveaux affrontes ;
 *  - la qualite moyenne des coups (perte en centipions) ;
 *  - la frequence des grosses erreurs.
 *
 * Ce n'est PAS un Elo officiel : la valeur est bornee et la confiance
 * augmente seulement avec le nombre de parties.
 */
export function estimateLevel(games: readonly GameSummary[]): EstimatedLevel | null {
  const recent = games.slice(-ESTIMATE_WINDOW);
  if (recent.length === 0) return null;

  const n = recent.length;
  const avgOpponent = recent.reduce((s, g) => s + g.opponentElo, 0) / n;
  const score =
    recent.reduce((s, g) => s + (g.result === 'win' ? 1 : g.result === 'draw' ? 0.5 : 0), 0) / n;
  // Performance simplifiee, bornee a +/-400 points autour du niveau affronte.
  const performance = avgOpponent + clamp((score - 0.5) * 800, -400, 400);

  const avgCpLoss = recent.reduce((s, g) => s + g.averageCpLoss, 0) / n;
  const blunderRate = recent.reduce((s, g) => s + g.blunders, 0) / n;
  // Qualite des coups : 1600 pour 40 cp de perte moyenne, -8 points par cp au dela.
  const quality = clamp(1600 - (avgCpLoss - 40) * 8 - blunderRate * 60, 500, 2200);

  const blended = 0.55 * performance + 0.45 * quality;
  const confidence = clamp(n / 10, 0.1, 1);
  // Tant qu'on a peu de parties, on tire l'estimation vers 800 (niveau de depart).
  const value = Math.round(800 + (blended - 800) * confidence);

  return {
    value: clamp(value, 400, 2400),
    confidence: Number(confidence.toFixed(2)),
    sample: n,
  };
}

/** Agrege les indicateurs affiches sur la page de progression. */
export interface ProgressionSummary {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  averageOpponent: number;
  averageCpLoss: number;
  hangingPieces: number;
  missedTactics: number;
  developmentIssues: number;
  lateCastles: number;
  openingMistakes: number;
  endgameLosses: number;
}

export function summarize(games: readonly GameSummary[]): ProgressionSummary {
  const n = games.length || 1;
  return {
    games: games.length,
    wins: games.filter((g) => g.result === 'win').length,
    draws: games.filter((g) => g.result === 'draw').length,
    losses: games.filter((g) => g.result === 'loss').length,
    averageOpponent: Math.round(games.reduce((s, g) => s + g.opponentElo, 0) / n),
    averageCpLoss: Math.round(games.reduce((s, g) => s + g.averageCpLoss, 0) / n),
    hangingPieces: games.reduce((s, g) => s + g.hangingPieces, 0),
    missedTactics: games.reduce((s, g) => s + g.missedTactics, 0),
    developmentIssues: games.reduce((s, g) => s + g.openingMistakes, 0),
    lateCastles: games.filter((g) => g.castledOnMove === null || g.castledOnMove > 10).length,
    openingMistakes: games.reduce((s, g) => s + g.openingMistakes, 0),
    endgameLosses: games.filter((g) => g.result === 'loss' && g.moveCount >= 40).length,
  };
}
