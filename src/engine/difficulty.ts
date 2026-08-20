import type { AnalysisSpeed, DifficultyProfile, EngineLine, LevelId, SpeedProfile } from '@/types';
import { MATE_CP, scoreToCp } from './uci';
import type { EngineCapabilities } from './StockfishEngine';

/**
 * Table des niveaux.
 *
 * Sous ~1320 Elo, Stockfish refuse UCI_LimitStrength : la faiblesse est alors
 * simulee par Skill Level + profondeur reduite + tirage pondere parmi les
 * meilleures lignes, avec une perte maximale bornee (`maxLossCp`) pour que le
 * moteur reste coherent et ne donne jamais une piece sans raison.
 */
export const DIFFICULTY_PROFILES: Record<LevelId, DifficultyProfile> = {
  600: {
    id: 600,
    label: '600 - Très débutant',
    elo: 600,
    useLimitStrength: false,
    skillLevel: 0,
    depth: 2,
    movetime: 120,
    multiPV: 5,
    mistakeChance: 0.45,
    maxLossCp: 330,
    temperature: 220,
  },
  800: {
    id: 800,
    label: '800 - Débutant',
    elo: 800,
    useLimitStrength: false,
    skillLevel: 1,
    depth: 3,
    movetime: 150,
    multiPV: 5,
    mistakeChance: 0.33,
    maxLossCp: 280,
    temperature: 170,
  },
  1000: {
    id: 1000,
    label: '1000 - Débutant confirmé',
    elo: 1000,
    useLimitStrength: false,
    skillLevel: 3,
    depth: 4,
    movetime: 180,
    multiPV: 4,
    mistakeChance: 0.26,
    maxLossCp: 240,
    temperature: 140,
  },
  1200: {
    id: 1200,
    label: '1200 - Club débutant',
    elo: 1200,
    useLimitStrength: false,
    skillLevel: 5,
    depth: 5,
    movetime: 220,
    multiPV: 4,
    mistakeChance: 0.19,
    maxLossCp: 190,
    temperature: 110,
  },
  1400: {
    id: 1400,
    label: '1400 - Club',
    elo: 1400,
    useLimitStrength: true,
    skillLevel: 8,
    depth: 8,
    movetime: 280,
    multiPV: 3,
    mistakeChance: 0.12,
    maxLossCp: 150,
    temperature: 90,
  },
  1500: {
    id: 1500,
    label: '1500 - Objectif',
    elo: 1500,
    useLimitStrength: true,
    skillLevel: 10,
    depth: 9,
    movetime: 300,
    multiPV: 3,
    mistakeChance: 0.09,
    maxLossCp: 130,
    temperature: 75,
  },
  1700: {
    id: 1700,
    label: '1700 - Solide',
    elo: 1700,
    useLimitStrength: true,
    skillLevel: 13,
    depth: 10,
    movetime: 350,
    multiPV: 2,
    mistakeChance: 0.05,
    maxLossCp: 100,
    temperature: 55,
  },
  1900: {
    id: 1900,
    label: '1900 - Fort',
    elo: 1900,
    useLimitStrength: true,
    skillLevel: 16,
    depth: 12,
    movetime: 420,
    multiPV: 2,
    mistakeChance: 0.02,
    maxLossCp: 70,
    temperature: 40,
  },
  3000: {
    id: 3000,
    label: 'Maximum',
    elo: 3000,
    useLimitStrength: false,
    skillLevel: 20,
    depth: 18,
    movetime: 900,
    multiPV: 1,
    mistakeChance: 0,
    maxLossCp: 0,
    temperature: 1,
  },
};

export const LEVEL_ORDER: LevelId[] = [600, 800, 1000, 1200, 1400, 1500, 1700, 1900, 3000];

/**
 * Construit un profil pour un Elo libre (mode personnalise) par interpolation
 * entre les deux niveaux predefinis encadrants.
 */
export function customProfile(elo: number): DifficultyProfile {
  const clamped = Math.max(400, Math.min(3000, Math.round(elo)));
  const sorted = LEVEL_ORDER.map((id) => DIFFICULTY_PROFILES[id]);
  let lower = sorted[0];
  let upper = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (clamped >= sorted[i].elo && clamped <= sorted[i + 1].elo) {
      lower = sorted[i];
      upper = sorted[i + 1];
      break;
    }
  }
  const span = upper.elo - lower.elo;
  const t = span === 0 ? 0 : (clamped - lower.elo) / span;
  const mix = (a: number, b: number): number => a + (b - a) * t;

  return {
    id: 'custom',
    label: `Personnalisé - ${clamped}`,
    elo: clamped,
    useLimitStrength: clamped >= 1320,
    skillLevel: Math.round(mix(lower.skillLevel, upper.skillLevel)),
    depth: Math.max(2, Math.round(mix(lower.depth, upper.depth))),
    movetime: Math.round(mix(lower.movetime, upper.movetime)),
    multiPV: Math.max(1, Math.round(mix(lower.multiPV, upper.multiPV))),
    mistakeChance: Number(mix(lower.mistakeChance, upper.mistakeChance).toFixed(3)),
    maxLossCp: Math.round(mix(lower.maxLossCp, upper.maxLossCp)),
    temperature: Math.max(1, Math.round(mix(lower.temperature, upper.temperature))),
  };
}

/** Selectionne le profil correspondant aux reglages. */
export function resolveProfile(level: LevelId | 'custom', customElo: number): DifficultyProfile {
  return level === 'custom' ? customProfile(customElo) : DIFFICULTY_PROFILES[level];
}

/**
 * Traduit un profil en reglages UCI concrets, en tenant compte de ce que le
 * moteur supporte reellement (UCI_Elo a une borne minimale).
 */
export function toEngineStrength(
  profile: DifficultyProfile,
  capabilities: EngineCapabilities,
): { limitStrength: boolean; elo: number; skillLevel: number } {
  const canLimit =
    capabilities.supportsLimitStrength &&
    profile.useLimitStrength &&
    profile.elo >= capabilities.eloMin;
  return {
    limitStrength: canLimit,
    elo: Math.max(capabilities.eloMin, Math.min(capabilities.eloMax, profile.elo)),
    skillLevel: profile.skillLevel,
  };
}

/* ------------------------------------------------------------------ */
/* Choix du coup                                                       */
/* ------------------------------------------------------------------ */

/** Nombre de demi-coups pendant lesquels l'IA varie volontairement son jeu. */
export const OPENING_VARIETY_PLIES = 8;

export interface MoveChoiceContext {
  /** Demi-coup courant : les premiers coups sont plus varies. */
  ply: number;
  /** true si le coup precedent du moteur etait deja une erreur volontaire. */
  previousWasMistake: boolean;
}

export interface MoveChoice {
  uci: string;
  /** true si le moteur n'a volontairement pas joue le meilleur coup. */
  deliberateMistake: boolean;
  /** Perte, en centipions, par rapport au meilleur coup. */
  lossCp: number;
}

/**
 * Choisit le coup joue par l'IA parmi les lignes renvoyees par Stockfish.
 *
 * Regles :
 *  - on ne considere jamais un coup perdant plus de `maxLossCp` ;
 *  - on ne laisse jamais passer un mat force disponible ;
 *  - on n'enchaine jamais deux erreurs volontaires consecutives ;
 *  - un tirage pondere (softmax) donne une variete naturelle entre parties.
 *
 * `rng` est injecte pour rendre la fonction deterministe dans les tests.
 */
export function chooseEngineMove(
  lines: EngineLine[],
  profile: DifficultyProfile,
  context: MoveChoiceContext,
  rng: () => number = Math.random,
): MoveChoice | null {
  const usable = lines.filter((line) => line.pv.length > 0);
  if (usable.length === 0) return null;

  const scored = usable
    .map((line) => ({ uci: line.pv[0], cp: scoreToCp(line.score) }))
    .sort((a, b) => b.cp - a.cp);

  const best = scored[0];
  if (scored.length === 1) return { uci: best.uci, deliberateMistake: false, lossCp: 0 };

  // Un mat force disponible est toujours joue.
  if (best.cp >= MATE_CP - 5000) {
    return { uci: best.uci, deliberateMistake: false, lossCp: 0 };
  }

  const playBest = (): MoveChoice => ({ uci: best.uci, deliberateMistake: false, lossCp: 0 });

  // Le niveau maximal joue toujours le meilleur coup.
  if (profile.mistakeChance <= 0) return playBest();
  // Deux erreurs volontaires de suite sont interdites.
  if (context.previousWasMistake) return playBest();

  // Pendant l'ouverture, on tire plus souvent au sort mais dans une fourchette
  // etroite : les parties se ressemblent moins sans que le jeu s'affaiblisse.
  const inOpening = context.ply < OPENING_VARIETY_PLIES;
  const chance = inOpening ? Math.max(profile.mistakeChance, 0.4) : profile.mistakeChance;
  const maxLoss = inOpening ? Math.min(profile.maxLossCp, 60) : profile.maxLossCp;
  const temperature = Math.max(
    1,
    inOpening ? Math.max(profile.temperature, 45) : profile.temperature,
  );

  const candidates = scored.filter((entry) => {
    const loss = best.cp - entry.cp;
    // Ni coup absurde, ni coup qui offre un mat a l'adversaire.
    return loss <= maxLoss && entry.cp > -(MATE_CP - 5000);
  });

  if (candidates.length <= 1) return playBest();
  if (rng() >= chance) return playBest();

  const weights = candidates.map((entry) => Math.exp(-(best.cp - entry.cp) / temperature));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let ticket = rng() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    ticket -= weights[i];
    if (ticket <= 0) {
      const loss = best.cp - candidates[i].cp;
      // En dessous de ce seuil, le coup reste bon : ce n'est pas une erreur.
      return { uci: candidates[i].uci, deliberateMistake: loss > 80, lossCp: loss };
    }
  }
  return playBest();
}

/**
 * Nombre de demi-coups pendant lesquels l'IA peut suivre le repertoire.
 * Un adversaire faible ne doit pas jouer dix coups de theorie parfaite :
 * il sort du livre tres tot et se retrouve seul avec sa recherche bridee.
 */
export function bookPlyLimit(profile: DifficultyProfile): number {
  if (profile.elo >= 1700) return 12;
  if (profile.elo >= 1400) return 10;
  if (profile.elo >= 1000) return 6;
  return 4;
}

/* ------------------------------------------------------------------ */
/* Vitesses d'analyse                                                  */
/* ------------------------------------------------------------------ */

export const SPEED_PROFILES: Record<AnalysisSpeed, SpeedProfile> = {
  fast: {
    id: 'fast',
    label: 'Rapide',
    coachMovetime: 220,
    coachDepth: 10,
    evalMovetime: 160,
  },
  normal: {
    id: 'normal',
    label: 'Normale',
    coachMovetime: 450,
    coachDepth: 14,
    evalMovetime: 300,
  },
  accurate: {
    id: 'accurate',
    label: 'Precise',
    coachMovetime: 900,
    coachDepth: 18,
    evalMovetime: 600,
  },
};
