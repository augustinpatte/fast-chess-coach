import type { GameSummary, TrainingPriority } from '@/types';

/** Nombre de parties recentes prises en compte pour la priorite. */
export const RECENT_WINDOW = 6;

const PRIORITIES: Record<string, string> = {
  hanging: 'Vérifier les pièces non défendues avant chaque coup.',
  blunders: 'Prendre trois secondes avant chaque coup pour chercher les prises adverses.',
  castle: 'Roquer avant le 10e coup pour mettre ton roi à l’abri.',
  development: 'Terminer ton développement avant de lancer une attaque.',
  opening: 'Revoir les premiers coups de ton ouverture préférée.',
  tactics: 'Chercher les échecs, les prises et les menaces à chaque coup.',
  endgame: 'Travailler les finales simples : roi actif et pion passé.',
  steady: 'Continuer sur cette voie : joue régulièrement et garde ton plan.',
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Determine LA priorite d'entrainement du moment.
 * Une seule priorite est renvoyee : c'est une regle produit explicite.
 */
export function computePriority(games: readonly GameSummary[]): TrainingPriority {
  const recent = games.slice(-RECENT_WINDOW);
  if (recent.length === 0) {
    return { id: 'development', text: PRIORITIES.development };
  }

  const avgHanging = average(recent.map((g) => g.hangingPieces));
  const avgBlunders = average(recent.map((g) => g.blunders));
  const avgOpening = average(recent.map((g) => g.openingMistakes));
  const avgMissed = average(recent.map((g) => g.missedTactics));
  const lateCastle = recent.filter((g) => g.castledOnMove === null || g.castledOnMove > 10).length;

  if (avgHanging >= 1.2) return { id: 'hanging', text: PRIORITIES.hanging };
  if (avgBlunders >= 1.5) return { id: 'blunders', text: PRIORITIES.blunders };
  if (lateCastle / recent.length >= 0.5) return { id: 'castle', text: PRIORITIES.castle };
  if (avgOpening >= 1.5) return { id: 'opening', text: PRIORITIES.opening };
  if (avgMissed >= 1.5) return { id: 'tactics', text: PRIORITIES.tactics };
  if (average(recent.map((g) => g.averageCpLoss)) >= 90) {
    return { id: 'development', text: PRIORITIES.development };
  }
  return { id: 'steady', text: PRIORITIES.steady };
}

/** Serie recente sous forme lisible : « V V N D V ». */
export function recentStreak(games: readonly GameSummary[], count = 8): string[] {
  return games
    .slice(-count)
    .map((g) => (g.result === 'win' ? 'V' : g.result === 'draw' ? 'N' : 'D'));
}
