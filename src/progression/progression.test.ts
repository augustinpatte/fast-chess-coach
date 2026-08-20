import { beforeEach, describe, expect, it } from 'vitest';
import type { GameSummary, Settings } from '@/types';
import {
  EMPTY_PROGRESSION,
  MAX_STORED_GAMES,
  addGame,
  loadProgression,
  openingAverageEval,
  openingRecommendation,
  openingScore,
  saveProgression,
  setOpeningPreference,
} from './store';
import { computePriority, recentStreak } from './priority';
import { ESTIMATE_DISCLAIMER, estimateLevel, summarize } from './estimate';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  normalizeSettings,
  saveSettings,
} from '@/settings/defaults';
import {
  STORAGE_KEYS,
  approximateUsage,
  clearAll,
  readJson,
  writeJson,
} from '@/storage/localStore';

function mkGame(over: Partial<GameSummary> = {}): GameSummary {
  return {
    id: Math.random().toString(36).slice(2),
    date: Date.now(),
    playerColor: 'w',
    opponentElo: 800,
    result: 'win',
    reason: 'checkmate',
    openingId: 'italian',
    openingName: 'Partie italienne',
    moveCount: 40,
    averageCpLoss: 50,
    inaccuracies: 1,
    mistakes: 0,
    blunders: 0,
    hangingPieces: 0,
    missedTactics: 0,
    castledOnMove: 5,
    openingMistakes: 0,
    evalAfterTenMoves: 30,
    ...over,
  };
}

beforeEach(() => {
  clearAll();
});

describe('sauvegarde des reglages', () => {
  it('renvoie les valeurs par defaut quand rien n’est stocke', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('sauvegarde et relit les reglages', () => {
    saveSettings({ ...DEFAULT_SETTINGS, level: 1400, showEvalBar: false, theme: 'dark' });
    const loaded = loadSettings();
    expect(loaded.level).toBe(1400);
    expect(loaded.showEvalBar).toBe(false);
    expect(loaded.theme).toBe('dark');
  });

  it('rejette les valeurs invalides', () => {
    const cleaned = normalizeSettings({
      level: 4242,
      theme: 'neon',
      coachLevel: 'expert',
      showEvalBar: 'oui',
      customElo: 99999,
    });
    expect(cleaned.level).toBe(DEFAULT_SETTINGS.level);
    expect(cleaned.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(cleaned.coachLevel).toBe(DEFAULT_SETTINGS.coachLevel);
    expect(cleaned.showEvalBar).toBe(DEFAULT_SETTINGS.showEvalBar);
    expect(cleaned.customElo).toBe(DEFAULT_SETTINGS.customElo);
  });

  it('conserve et valide l’aide au prochain coup', () => {
    expect(DEFAULT_SETTINGS.nextMoveHelp).toBe('on_demand');
    expect(DEFAULT_SETTINGS.showPositionDashboard).toBe(true);
    expect(normalizeSettings({ nextMoveHelp: 'always' }).nextMoveHelp).toBe('always');
    expect(normalizeSettings({ nextMoveHelp: 'triche' }).nextMoveHelp).toBe('on_demand');
    expect(normalizeSettings({ showPositionDashboard: false }).showPositionDashboard).toBe(false);

    saveSettings({ ...DEFAULT_SETTINGS, nextMoveHelp: 'plan', showPositionDashboard: false });
    expect(loadSettings().nextMoveHelp).toBe('plan');
    expect(loadSettings().showPositionDashboard).toBe(false);
  });

  it('accepte un niveau personnalise valide', () => {
    const cleaned = normalizeSettings({ level: 'custom', customElo: 1350 } as Partial<Settings>);
    expect(cleaned.level).toBe('custom');
    expect(cleaned.customElo).toBe(1350);
  });

  it('resiste a un stockage corrompu', () => {
    localStorage.setItem(STORAGE_KEYS.settings, '{ceci n’est pas du JSON');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(readJson('inconnu', 'defaut')).toBe('defaut');
    expect(writeJson('fcc.test', { a: 1 })).toBe(true);
  });
});

describe('progression locale', () => {
  it('ajoute une partie et met a jour l’ouverture', () => {
    const state = addGame(EMPTY_PROGRESSION, mkGame());
    expect(state.games).toHaveLength(1);
    expect(state.openings.italian.games).toBe(1);
    expect(state.openings.italian.wins).toBe(1);
  });

  it('cumule les statistiques par ouverture', () => {
    let state = addGame(EMPTY_PROGRESSION, mkGame());
    state = addGame(state, mkGame({ result: 'loss', openingMistakes: 2, evalAfterTenMoves: -50 }));
    const stat = state.openings.italian;
    expect(stat.games).toBe(2);
    expect(stat.wins).toBe(1);
    expect(stat.losses).toBe(1);
    expect(openingScore(stat)).toBe(0.5);
    expect(openingAverageEval(stat)).toBe(-10);
  });

  it('persiste et relit la progression', () => {
    const state = addGame(EMPTY_PROGRESSION, mkGame());
    expect(saveProgression(state)).toBe(true);
    const reloaded = loadProgression();
    expect(reloaded.games).toHaveLength(1);
    expect(reloaded.openings.italian.games).toBe(1);
    expect(approximateUsage()).toBeGreaterThan(0);
  });

  it('borne le nombre de parties conservees', () => {
    let state = EMPTY_PROGRESSION;
    for (let i = 0; i < MAX_STORED_GAMES + 10; i += 1) state = addGame(state, mkGame());
    expect(state.games).toHaveLength(MAX_STORED_GAMES);
  });

  it('enregistre une preference d’ouverture', () => {
    const state = setOpeningPreference(addGame(EMPTY_PROGRESSION, mkGame()), 'italian', 'like');
    expect(state.openings.italian.preference).toBe('like');
  });

  it('refuse de conclure avant cinq parties', () => {
    let state = EMPTY_PROGRESSION;
    for (let i = 0; i < 3; i += 1) state = addGame(state, mkGame());
    expect(openingRecommendation(state.openings.italian)).toContain('trop peu');
  });

  it('recommande une ouverture apres cinq bonnes parties', () => {
    let state = EMPTY_PROGRESSION;
    for (let i = 0; i < 6; i += 1) state = addGame(state, mkGame());
    expect(openingRecommendation(state.openings.italian)).toContain('adaptée');
  });
});

describe('priorite d’entrainement', () => {
  it('propose le developpement quand il n’y a pas d’historique', () => {
    expect(computePriority([]).id).toBe('development');
  });

  it('cible les pieces en prise en priorite', () => {
    const games = Array.from({ length: 5 }, () => mkGame({ hangingPieces: 2 }));
    expect(computePriority(games).id).toBe('hanging');
  });

  it('cible le roque quand il est trop tardif', () => {
    const games = Array.from({ length: 5 }, () => mkGame({ castledOnMove: null }));
    expect(computePriority(games).id).toBe('castle');
  });

  it('n’affiche qu’une seule priorite', () => {
    const games = Array.from({ length: 5 }, () =>
      mkGame({ hangingPieces: 3, blunders: 3, castledOnMove: null, openingMistakes: 3 }),
    );
    const priority = computePriority(games);
    expect(priority.text.split('.').filter((s) => s.trim()).length).toBe(1);
  });

  it('resume la serie recente', () => {
    const games = [mkGame(), mkGame({ result: 'loss' }), mkGame({ result: 'draw' })];
    expect(recentStreak(games)).toEqual(['V', 'D', 'N']);
  });
});

describe('niveau estime', () => {
  it('ne renvoie rien sans partie', () => {
    expect(estimateLevel([])).toBeNull();
  });

  it('reste prudent avec peu de parties', () => {
    const estimate = estimateLevel([mkGame({ opponentElo: 1900, averageCpLoss: 10 })]);
    expect(estimate).not.toBeNull();
    expect(estimate!.confidence).toBeLessThanOrEqual(0.2);
    expect(estimate!.value).toBeLessThan(1200);
  });

  it('augmente avec de bons resultats contre des niveaux eleves', () => {
    const weak = Array.from({ length: 12 }, () =>
      mkGame({ opponentElo: 800, result: 'loss', averageCpLoss: 180, blunders: 3 }),
    );
    const strong = Array.from({ length: 12 }, () =>
      mkGame({ opponentElo: 1700, result: 'win', averageCpLoss: 30, blunders: 0 }),
    );
    expect(estimateLevel(strong)!.value).toBeGreaterThan(estimateLevel(weak)!.value);
  });

  it('affiche un avertissement clair', () => {
    expect(ESTIMATE_DISCLAIMER).toContain('pas un classement officiel');
  });

  it('agrege les indicateurs', () => {
    const games = [mkGame(), mkGame({ result: 'loss', hangingPieces: 2, missedTactics: 1 })];
    const stats = summarize(games);
    expect(stats.games).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.hangingPieces).toBe(2);
    expect(stats.missedTactics).toBe(1);
  });
});
