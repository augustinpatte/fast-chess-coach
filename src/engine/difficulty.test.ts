import { describe, expect, it } from 'vitest';
import type { EngineLine } from '@/types';
import {
  DIFFICULTY_PROFILES,
  LEVEL_ORDER,
  SPEED_PROFILES,
  chooseEngineMove,
  customProfile,
  resolveProfile,
  toEngineStrength,
} from './difficulty';
import { AnalysisCache } from './analysisCache';

const line = (multipv: number, cp: number, first: string): EngineLine => ({
  multipv,
  depth: 10,
  score: { cp, mate: null },
  pv: [first, 'e7e5'],
});

const capabilities = {
  supportsLimitStrength: true,
  supportsSkillLevel: true,
  eloMin: 1320,
  eloMax: 3190,
};

describe('selection du niveau', () => {
  it('expose les neuf niveaux annonces', () => {
    expect(LEVEL_ORDER).toEqual([600, 800, 1000, 1200, 1400, 1500, 1700, 1900, 3000]);
  });

  it('durcit les reglages quand le niveau augmente', () => {
    for (let i = 1; i < LEVEL_ORDER.length; i += 1) {
      const previous = DIFFICULTY_PROFILES[LEVEL_ORDER[i - 1]];
      const current = DIFFICULTY_PROFILES[LEVEL_ORDER[i]];
      expect(current.depth).toBeGreaterThanOrEqual(previous.depth);
      expect(current.skillLevel).toBeGreaterThanOrEqual(previous.skillLevel);
      expect(current.mistakeChance).toBeLessThanOrEqual(previous.mistakeChance);
      expect(current.maxLossCp).toBeLessThanOrEqual(previous.maxLossCp);
    }
  });

  it('n’utilise UCI_LimitStrength que si le moteur le permet', () => {
    expect(toEngineStrength(DIFFICULTY_PROFILES[800], capabilities).limitStrength).toBe(false);
    expect(toEngineStrength(DIFFICULTY_PROFILES[1500], capabilities).limitStrength).toBe(true);
    expect(
      toEngineStrength(DIFFICULTY_PROFILES[1500], { ...capabilities, supportsLimitStrength: false })
        .limitStrength,
    ).toBe(false);
  });

  it('borne l’Elo transmis au moteur', () => {
    const strength = toEngineStrength(DIFFICULTY_PROFILES[600], capabilities);
    expect(strength.elo).toBeGreaterThanOrEqual(capabilities.eloMin);
    expect(strength.skillLevel).toBe(0);
  });

  it('interpole un profil personnalise', () => {
    const profile = customProfile(1300);
    expect(profile.elo).toBe(1300);
    expect(profile.skillLevel).toBeGreaterThan(DIFFICULTY_PROFILES[1200].skillLevel - 1);
    expect(profile.skillLevel).toBeLessThan(DIFFICULTY_PROFILES[1400].skillLevel + 1);
    expect(customProfile(50).elo).toBe(400);
    expect(customProfile(9000).elo).toBe(3000);
  });

  it('resout le profil depuis les reglages', () => {
    expect(resolveProfile(1000, 1500).elo).toBe(1000);
    expect(resolveProfile('custom', 1450).elo).toBe(1450);
  });
});

describe('choix du coup de l’IA', () => {
  const lines = [line(1, 40, 'e2e4'), line(2, -10, 'd2d4'), line(3, -500, 'b1a3')];

  it('joue le meilleur coup au niveau maximal', () => {
    const choice = chooseEngineMove(
      lines,
      DIFFICULTY_PROFILES[3000],
      { ply: 4, previousWasMistake: false },
      () => 0,
    );
    expect(choice?.uci).toBe('e2e4');
    expect(choice?.deliberateMistake).toBe(false);
  });

  it('peut jouer un coup imparfait a bas niveau', () => {
    // 200 cp de perte : une vraie imprecision, mais pas un coup absurde.
    const withMistake = [line(1, 40, 'e2e4'), line(2, -160, 'd2d4'), line(3, -500, 'b1a3')];
    const choice = chooseEngineMove(
      withMistake,
      DIFFICULTY_PROFILES[600],
      { ply: 20, previousWasMistake: false },
      // 1er tirage : declenche l'erreur ; 2e tirage : selectionne la 2e ligne.
      sequence([0, 0.99]),
    );
    expect(choice?.uci).toBe('d2d4');
    expect(choice?.deliberateMistake).toBe(true);
  });

  it('varie ses premiers coups sans jouer de mauvais coup', () => {
    // Trois coups tres proches : l'IA doit pouvoir alterner entre eux.
    const close = [line(1, 40, 'e2e4'), line(2, 20, 'd2d4'), line(3, 10, 'c2c4')];
    const picked = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      const choice = chooseEngineMove(close, DIFFICULTY_PROFILES[1500], {
        ply: 2,
        previousWasMistake: false,
      });
      if (choice) picked.add(choice.uci);
    }
    expect(picked.size).toBeGreaterThan(1);
  });

  it('n’elargit pas la fourchette d’erreur pendant l’ouverture', () => {
    // 500 cp de perte : jamais retenu, meme avec la variete d'ouverture.
    for (let i = 0; i < 300; i += 1) {
      const choice = chooseEngineMove(lines, DIFFICULTY_PROFILES[1500], {
        ply: 2,
        previousWasMistake: false,
      });
      expect(choice?.uci).not.toBe('b1a3');
    }
  });

  it('reste parfait au niveau maximal, meme en ouverture', () => {
    for (let i = 0; i < 50; i += 1) {
      const choice = chooseEngineMove(lines, DIFFICULTY_PROFILES[3000], {
        ply: 1,
        previousWasMistake: false,
      });
      expect(choice?.uci).toBe('e2e4');
    }
  });

  it('ne choisit jamais un coup absurde', () => {
    for (let i = 0; i < 200; i += 1) {
      const choice = chooseEngineMove(lines, DIFFICULTY_PROFILES[600], {
        ply: 10,
        previousWasMistake: false,
      });
      expect(choice?.uci).not.toBe('b1a3');
    }
  });

  it('n’enchaine pas deux erreurs volontaires', () => {
    const choice = chooseEngineMove(
      lines,
      DIFFICULTY_PROFILES[600],
      { ply: 10, previousWasMistake: true },
      () => 0,
    );
    expect(choice?.uci).toBe('e2e4');
    expect(choice?.deliberateMistake).toBe(false);
  });

  it('joue toujours un mat force disponible', () => {
    const mating = [
      { multipv: 1, depth: 8, score: { cp: null, mate: 2 }, pv: ['d1h5'] },
      { multipv: 2, depth: 8, score: { cp: 50, mate: null }, pv: ['e2e4'] },
    ];
    const choice = chooseEngineMove(
      mating,
      DIFFICULTY_PROFILES[600],
      { ply: 10, previousWasMistake: false },
      () => 0,
    );
    expect(choice?.uci).toBe('d1h5');
  });

  it('renvoie null sans ligne exploitable', () => {
    expect(
      chooseEngineMove([], DIFFICULTY_PROFILES[800], { ply: 0, previousWasMistake: false }),
    ).toBeNull();
  });
});

describe('vitesses d’analyse', () => {
  it('propose trois vitesses croissantes', () => {
    expect(SPEED_PROFILES.fast.coachMovetime).toBeLessThan(SPEED_PROFILES.normal.coachMovetime);
    expect(SPEED_PROFILES.normal.coachMovetime).toBeLessThan(SPEED_PROFILES.accurate.coachMovetime);
    expect(SPEED_PROFILES.fast.coachMovetime).toBeLessThanOrEqual(300);
  });
});

describe('cache d’analyses', () => {
  it('retourne une valeur mise en cache', () => {
    const cache = new AnalysisCache(2);
    const result = { fen: 'a', bestMove: 'e2e4', lines: [], depth: 5, elapsedMs: 10 };
    const key = AnalysisCache.key('a', 1, 5, 100);
    cache.set(key, result);
    expect(cache.get(key)).toBe(result);
  });

  it('supprime les entrees les plus anciennes', () => {
    const cache = new AnalysisCache(2);
    const make = (fen: string) => ({ fen, bestMove: null, lines: [], depth: 1, elapsedMs: 1 });
    cache.set('a', make('a'));
    cache.set('b', make('b'));
    cache.set('c', make('c'));
    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('se vide completement', () => {
    const cache = new AnalysisCache(5);
    cache.set('a', { fen: 'a', bestMove: null, lines: [], depth: 1, elapsedMs: 1 });
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

/** Generateur pseudo-aleatoire deterministe pour les tests. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}
