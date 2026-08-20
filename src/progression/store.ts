import type { GameSummary, OpeningStat, OpeningStyle, ProgressionState } from '@/types';
import { STORAGE_KEYS, readJson, writeJson } from '@/storage/localStore';

/** Nombre de parties conservees ; borne le stockage local. */
export const MAX_STORED_GAMES = 100;

export const EMPTY_PROGRESSION: ProgressionState = {
  games: [],
  openings: {},
  currentPriority: null,
};

/** Charge la progression locale, en tolerant un stockage vide ou corrompu. */
export function loadProgression(): ProgressionState {
  const raw = readJson<Partial<ProgressionState> | null>(STORAGE_KEYS.progression, null);
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PROGRESSION };
  return {
    games: Array.isArray(raw.games) ? raw.games.slice(-MAX_STORED_GAMES) : [],
    openings: raw.openings && typeof raw.openings === 'object' ? raw.openings : {},
    currentPriority: typeof raw.currentPriority === 'string' ? raw.currentPriority : null,
  };
}

export function saveProgression(state: ProgressionState): boolean {
  return writeJson(STORAGE_KEYS.progression, {
    ...state,
    games: state.games.slice(-MAX_STORED_GAMES),
  });
}

/** Ajoute une partie et met a jour les statistiques d'ouverture. */
export function addGame(state: ProgressionState, game: GameSummary): ProgressionState {
  const games = [...state.games, game].slice(-MAX_STORED_GAMES);
  const openings = { ...state.openings };

  if (game.openingId) {
    const previous: OpeningStat = openings[game.openingId] ?? {
      openingId: game.openingId,
      openingName: game.openingName ?? game.openingId,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      totalOpeningMistakes: 0,
      totalEvalAfterTen: 0,
      evalSamples: 0,
      preference: null,
      style: null,
    };
    openings[game.openingId] = {
      ...previous,
      openingName: game.openingName ?? previous.openingName,
      games: previous.games + 1,
      wins: previous.wins + (game.result === 'win' ? 1 : 0),
      draws: previous.draws + (game.result === 'draw' ? 1 : 0),
      losses: previous.losses + (game.result === 'loss' ? 1 : 0),
      totalOpeningMistakes: previous.totalOpeningMistakes + game.openingMistakes,
      totalEvalAfterTen: previous.totalEvalAfterTen + (game.evalAfterTenMoves ?? 0),
      evalSamples: previous.evalSamples + (game.evalAfterTenMoves === null ? 0 : 1),
    };
  }

  return { ...state, games, openings };
}

/** Met a jour l'appreciation personnelle d'une ouverture. */
export function setOpeningPreference(
  state: ProgressionState,
  openingId: string,
  preference: OpeningStat['preference'],
): ProgressionState {
  const stat = state.openings[openingId];
  if (!stat) return state;
  return {
    ...state,
    openings: { ...state.openings, [openingId]: { ...stat, preference } },
  };
}

/** Enregistre le style ressenti d'une ouverture. */
export function setOpeningStyle(
  state: ProgressionState,
  openingId: string,
  style: OpeningStyle,
): ProgressionState {
  const stat = state.openings[openingId];
  if (!stat) return state;
  return { ...state, openings: { ...state.openings, [openingId]: { ...stat, style } } };
}

/** Nombre minimal de parties avant de formuler une recommandation forte. */
export const MIN_GAMES_FOR_RECOMMENDATION = 5;

/**
 * Recommandation courte pour une ouverture.
 * En dessous de 5 parties, on refuse explicitement de conclure.
 */
export function openingRecommendation(stat: OpeningStat): string {
  const { games, wins, draws } = stat;
  if (games < MIN_GAMES_FOR_RECOMMENDATION) {
    return `${games} partie${games > 1 ? 's' : ''} : trop peu pour conclure, continue à l'essayer.`;
  }
  const score = (wins + draws * 0.5) / games;
  const avgMistakes = stat.totalOpeningMistakes / games;
  if (score >= 0.6 && avgMistakes <= 1) {
    return 'Bons résultats et peu d’erreurs : cette ouverture semble adaptée à ton style.';
  }
  if (score >= 0.6) {
    return 'Bons résultats, mais des erreurs dans les premiers coups : revois la théorie.';
  }
  if (avgMistakes >= 2) {
    return 'Beaucoup d’erreurs d’ouverture : entraîne-la ou essaie une ouverture plus simple.';
  }
  if (score <= 0.35) {
    return 'Résultats faibles pour l’instant : essaie une autre ouverture pour comparer.';
  }
  return 'Résultats équilibrés : garde-la encore quelques parties pour te décider.';
}

/** Score moyen (0-1) obtenu avec une ouverture. */
export function openingScore(stat: OpeningStat): number {
  if (stat.games === 0) return 0;
  return (stat.wins + stat.draws * 0.5) / stat.games;
}

/** Evaluation moyenne apres 10 coups, en centipions (point de vue du joueur). */
export function openingAverageEval(stat: OpeningStat): number | null {
  if (stat.evalSamples === 0) return null;
  return Math.round(stat.totalEvalAfterTen / stat.evalSamples);
}
