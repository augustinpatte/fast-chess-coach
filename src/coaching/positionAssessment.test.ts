import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import type { CriticalFeature } from '@/types';
import {
  activityScore,
  assessPosition,
  buildFactors,
  centerScore,
  criticalFeatures,
  detectPhase,
  isTacticalKind,
  leastActivePiece,
  selectCritical,
  swingFactors,
  usefulOpenFile,
} from './positionAssessment';
import { buildPlan } from './positionPlan';
import { buildWatchFocus, watchFocusCandidates, MAX_WATCH_SQUARES } from './watchFocus';
import { POSITIONS } from '@/tests/positions';

const assess = (fen: string, perspective: 'w' | 'b' = 'w') =>
  assessPosition({ fen, perspective, analysis: null });

const kinds = (features: readonly CriticalFeature[]): string[] => features.map((f) => f.kind);
const texts = (features: readonly CriticalFeature[]): string =>
  features.map((f) => f.text).join(' ');

describe('phase de jeu', () => {
  it('reconnait une ouverture, un milieu de jeu et une finale', () => {
    expect(detectPhase(new Chess(POSITIONS.start))).toBe('opening');
    expect(detectPhase(new Chess(POSITIONS.italian))).toBe('opening');
    expect(detectPhase(new Chess(POSITIONS.simpleEndgame))).toBe('endgame');
    expect(detectPhase(new Chess(POSITIONS.pawnEndgame))).toBe('endgame');
  });

  it('met en avant des jauges differentes selon la phase', () => {
    const opening = assess(POSITIONS.start);
    const endgame = assess(POSITIONS.pawnEndgame);
    const focused = (fen: ReturnType<typeof assess>): string[] =>
      (fen?.factors ?? []).filter((f) => f.highlighted).map((f) => f.id);

    expect(focused(opening)).toContain('center');
    expect(focused(endgame)).toContain('material');
    expect(focused(endgame)).not.toContain('center');
  });
});

describe('jauges', () => {
  it('reste a l’equilibre dans une ouverture symetrique', () => {
    for (const factor of buildFactors(new Chess(POSITIONS.start), 'opening')) {
      expect(Math.abs(factor.value)).toBeLessThan(0.25);
      expect(factor.value).toBeGreaterThanOrEqual(-2);
      expect(factor.value).toBeLessThanOrEqual(2);
    }
  });

  it('signale un avantage materiel du bon cote, avec un detail lisible', () => {
    const white = buildFactors(new Chess(POSITIONS.simpleEndgame), 'endgame');
    const material = white.find((f) => f.id === 'material');
    expect(material?.value).toBeGreaterThan(0.5);
    expect(material?.detail).toBe('+5 Blancs');

    const black = buildFactors(new Chess('4r3/4k3/8/8/8/8/8/4K3 w - - 0 1'), 'endgame');
    expect(black.find((f) => f.id === 'material')?.value).toBeLessThan(-0.5);
    expect(black.find((f) => f.id === 'material')?.detail).toBe('−5 Noirs');
  });

  it('n’affiche aucun detail materiel quand la balance est nulle', () => {
    const factors = buildFactors(new Chess(POSITIONS.start), 'opening');
    expect(factors.find((f) => f.id === 'material')?.detail).toBeNull();
  });

  it('mesure un centre dominant', () => {
    const chess = new Chess(POSITIONS.dominantCenter);
    expect(centerScore(chess, 'w') - centerScore(chess, 'b')).toBeGreaterThan(1);
    expect(buildFactors(chess, 'opening').find((f) => f.id === 'center')?.value).toBeGreaterThan(
      0.5,
    );
  });

  it('penalise un roi reste au centre face a un roi roque', () => {
    const chess = new Chess(POSITIONS.needsCastle);
    chess.move('O-O');
    const safety = buildFactors(chess, 'opening').find((f) => f.id === 'king_safety');
    expect(safety?.value).toBeGreaterThan(0.2);
  });

  it('penalise des pions doubles et isoles', () => {
    const chess = new Chess('4k3/pppppppp/8/8/8/5P2/PPPPPP1P/4K3 w - - 0 1');
    expect(buildFactors(chess, 'middlegame').find((f) => f.id === 'pawns')?.value).toBeLessThan(0);
  });

  it('reste modere quand un camp a plus de materiel mais un roi tres faible', () => {
    // Blancs : deux tours contre une dame ; le roi blanc est sous pression.
    const factors = buildFactors(
      new Chess('6k1/5pp1/7p/8/6q1/8/5PPP/R4RK1 w - - 0 1'),
      'middlegame',
    );
    const material = factors.find((f) => f.id === 'material')?.value ?? 0;
    const safety = factors.find((f) => f.id === 'king_safety')?.value ?? 0;
    // Le materiel penche du bon cote sans exploser, et la securite du roi le nuance.
    expect(material).toBeGreaterThan(0);
    expect(material).toBeLessThan(1);
    expect(safety).toBeLessThan(material);
  });

  it('ne laisse pas l’espace masquer une piece en prise', () => {
    const fen = 'r1bq1rk1/pp1nbppp/2n1p3/2ppP3/3PN3/2P5/PP3PPP/RNBQKB1R w KQkq - 0 8';
    const factors = buildFactors(new Chess(fen), 'middlegame');
    // Les jauges restent proches de l'equilibre...
    expect(Math.abs(factors.find((f) => f.id === 'center')?.value ?? 9)).toBeLessThan(1);
    // ...mais la piece en prise, elle, est bien annoncee.
    expect(assess(fen, 'w')?.critical[0].kind).toBe('piece_hanging');
  });

  it('reste a zero dans une position theoriquement egale', () => {
    const fen = 'r1bq1rk1/ppp2ppp/2n2n2/3pp3/3PP3/2N2N2/PPP2PPP/R1BQ1RK1 w - - 0 8';
    for (const factor of buildFactors(new Chess(fen), 'middlegame')) {
      expect(Math.abs(factor.value), factor.id).toBeLessThan(0.25);
    }
  });

  it('n’applique plus la notion de developpement en finale', () => {
    // Deux rois nus et un pion : l'activite ne doit pas dependre du « developpement ».
    const white = activityScore(new Chess('8/8/4k3/8/4P3/4K3/8/8 w - - 0 1'), 'w', 'endgame');
    const black = activityScore(new Chess('8/8/4k3/8/4P3/4K3/8/8 w - - 0 1'), 'b', 'endgame');
    expect(Number.isFinite(white)).toBe(true);
    expect(Math.abs(white - black)).toBeLessThan(2);
  });

  it('ignore roque et bouclier de pions pour juger un roi de finale', () => {
    // Roi central actif contre roi passif dans un coin : la jauge ne doit pas
    // punir le roi central, qui est au contraire bien place.
    const chess = new Chess('7k/8/8/8/8/8/4K3/4R3 w - - 0 1');
    const safety = buildFactors(chess, 'endgame').find((f) => f.id === 'king_safety');
    expect(safety?.value).toBeGreaterThanOrEqual(0);
  });

  it('ne penalise personne quand les deux rois ont perdu le roque', () => {
    const chess = new Chess('r6r/ppp1kppp/2n2n2/3pp3/3PP3/2N2N2/PPP1KPPP/R6R w - - 0 10');
    const safety = buildFactors(chess, 'middlegame').find((f) => f.id === 'king_safety');
    expect(Math.abs(safety?.value ?? 9)).toBeLessThan(0.5);
  });

  it('borne toujours les valeurs a l’intervalle interne', () => {
    const chess = new Chess('4k3/8/8/8/8/8/8/QQQQK3 w - - 0 1');
    for (const factor of buildFactors(chess, 'endgame')) {
      expect(factor.value).toBeGreaterThanOrEqual(-2);
      expect(factor.value).toBeLessThanOrEqual(2);
    }
  });
});

describe('ce qui compte maintenant', () => {
  it('affiche au plus trois elements', () => {
    for (const fen of Object.values(POSITIONS)) {
      const result = assess(fen, new Chess(fen).turn());
      expect(result?.critical.length ?? 0).toBeLessThanOrEqual(3);
    }
  });

  it('signale une dame en prise avec son compte d’attaquants et de defenseurs', () => {
    const result = assess(POSITIONS.hangingQueen, 'w');
    expect(kinds(result?.critical ?? [])).toContain('piece_hanging');
    expect(texts(result?.critical ?? [])).toContain('dame d5');
    expect(texts(result?.critical ?? [])).toContain('n’est pas défendue');
  });

  it('signale une piece adverse non defendue comme gain materiel', () => {
    const result = assess(POSITIONS.looseKnight, 'w');
    expect(kinds(result?.critical ?? [])).toContain('material_gain');
    expect(texts(result?.critical ?? [])).toContain('cavalier');
  });

  it('annonce un mat en un et rien d’autre', () => {
    const result = assess(POSITIONS.mateInOne, 'w');
    expect(result?.critical).toHaveLength(1);
    expect(result?.critical[0].kind).toBe('mate');
    expect(result?.critical[0].text).toContain('Dxf7#');
  });

  it('annonce une menace de mat adverse et rien d’autre', () => {
    const result = assess(POSITIONS.mateThreat, 'w');
    expect(result?.critical).toHaveLength(1);
    expect(result?.critical[0].kind).toBe('mate_threat');
    expect(result?.critical[0].text).toContain('Ta1#');
  });

  it('donne la priorite a l’echec subi, sans inventer de mat adverse', () => {
    // Les blancs sont en echec par la tour e8, sans etre mats.
    const result = assess('4r2k/8/8/8/8/8/8/4K2R w K - 0 1', 'w');
    expect(result?.critical).toHaveLength(1);
    expect(result?.critical[0].text).toContain('échec');
    expect(result?.critical[0].text).not.toContain('menacent mat');
  });

  it('signale un roi encore au centre', () => {
    const result = assess(POSITIONS.needsCastle, 'w');
    expect(kinds(result?.critical ?? [])).toContain('king_safety');
    expect(texts(result?.critical ?? [])).toContain('roi');
  });

  it('signale un developpement incomplet des le premier coup', () => {
    const result = assess(POSITIONS.start, 'w');
    expect(result?.critical[0].kind).toBe('development');
    expect(result?.critical[0].text).toContain('4 pièces mineures');
  });

  it('signale un pion passe', () => {
    const result = assess(POSITIONS.passedPawn, 'w');
    expect(kinds(result?.critical ?? [])).toContain('pawn_structure');
    expect(texts(result?.critical ?? [])).toContain('b6');
  });

  it('signale une colonne ouverte inoccupee', () => {
    const result = assess(POSITIONS.rookOpenFile, 'w');
    expect(texts(result?.critical ?? [])).toContain('colonne e');
  });

  it('ne parle pas de colonne ouverte sur un echiquier sans pions', () => {
    expect(usefulOpenFile(new Chess(POSITIONS.simpleEndgame), 'w')).toBeNull();
  });

  it('ne parle jamais du centre en finale', () => {
    const result = assess(POSITIONS.simpleEndgame, 'w');
    expect(kinds(result?.critical ?? [])).not.toContain('center');
  });

  it('donne toujours des cases exploitables pour la surbrillance', () => {
    const result = assess(POSITIONS.hangingQueen, 'w');
    for (const feature of result?.critical ?? []) {
      for (const square of feature.squares) {
        expect(square).toMatch(/^[a-h][1-8]$/);
      }
    }
  });
});

describe('priorite tactique sur strategique', () => {
  it('place la tactique avant le conseil strategique', () => {
    const chess = new Chess(POSITIONS.hangingQueen);
    const all = criticalFeatures(chess, 'w', 'opening', null);
    const strategic = all.findIndex((f) => !isTacticalKind(f.kind));
    const tactical = all.findIndex((f) => isTacticalKind(f.kind));
    expect(tactical).toBeLessThan(strategic);
  });

  it('masque les conseils strategiques quand une menace tactique existe', () => {
    const selected = selectCritical([
      {
        kind: 'piece_hanging',
        priority: 92,
        text: 'Ta dame d5 est attaquée.',
        squares: ['d5'],
        confidence: 'high',
        fromEngine: false,
      },
      {
        kind: 'development',
        priority: 64,
        text: 'Il te reste 3 pièces mineures à développer.',
        squares: [],
        confidence: 'high',
        fromEngine: false,
      },
    ]);
    expect(selected).toHaveLength(1);
    expect(selected[0].kind).toBe('piece_hanging');
  });

  it('n’affiche jamais un diagnostic peu sur en deuxieme position', () => {
    const selected = selectCritical([
      {
        kind: 'development',
        priority: 64,
        text: 'A',
        squares: [],
        confidence: 'high',
        fromEngine: false,
      },
      { kind: 'plan', priority: 20, text: 'B', squares: [], confidence: 'low', fromEngine: false },
    ]);
    expect(selected).toHaveLength(1);
  });
});

describe('points de bascule', () => {
  it('signale qu’une piece attaquee ferait basculer le materiel', () => {
    const chess = new Chess('4k3/8/8/3q4/8/3R4/8/4K3 b - - 0 1');
    const swings = swingFactors(chess, 'b', null);
    expect(swings.some((s) => s.text.includes('ferait passer l’avantage'))).toBe(true);
  });

  it('signale un pion passe devenu dangereux', () => {
    const swings = swingFactors(new Chess(POSITIONS.passedPawn), 'w', null);
    expect(swings.some((s) => s.text.includes('b7'))).toBe(true);
  });

  it('utilise la MultiPV pour reperer un coup unique', () => {
    const fen = POSITIONS.needsCastle;
    const swings = swingFactors(new Chess(fen), 'w', {
      fen,
      bestMove: 'e1g1',
      depth: 12,
      elapsedMs: 100,
      lines: [
        { multipv: 1, depth: 12, score: { cp: 40, mate: null }, pv: ['e1g1'] },
        { multipv: 2, depth: 12, score: { cp: -300, mate: null }, pv: ['d2d3'] },
      ],
    });
    expect(swings.some((s) => s.fromEngine)).toBe(true);
  });

  it('n’affiche jamais plus de deux points de bascule', () => {
    for (const fen of Object.values(POSITIONS)) {
      const chess = new Chess(fen);
      expect(swingFactors(chess, chess.turn(), null).length).toBeLessThanOrEqual(2);
    }
  });

  it('ne montre rien dans une position d’ouverture calme', () => {
    expect(assess(POSITIONS.start, 'w')?.swings).toHaveLength(0);
  });
});

describe('ton plan', () => {
  it('donne une seule phrase', () => {
    for (const fen of Object.values(POSITIONS)) {
      const chess = new Chess(fen);
      const plan = buildPlan({ fen, perspective: chess.turn() });
      expect(plan).not.toBeNull();
      expect(plan?.text.split(/(?<=[.!?])\s+/).filter(Boolean)).toHaveLength(1);
    }
  });

  it('demande de sauver une piece en prise avant tout, sans exclure mieux', () => {
    const text = buildPlan({ fen: POSITIONS.hangingQueen, perspective: 'w' })?.text ?? '';
    expect(text).toContain('dame d5');
    // Le plan ne doit pas detourner d'un coup qui sauve la piece en gagnant plus.
    expect(text).toContain('gagne davantage');
  });

  it('demande de securiser le roi avant d’attaquer', () => {
    expect(buildPlan({ fen: POSITIONS.needsCastle, perspective: 'w' })?.text).toContain(
      'Sécurise ton roi',
    );
  });

  it('demande d’occuper la colonne ouverte', () => {
    expect(buildPlan({ fen: POSITIONS.rookOpenFile, perspective: 'w' })?.text).toContain(
      'colonne ouverte e',
    );
  });

  it('active le roi en finale', () => {
    expect(buildPlan({ fen: POSITIONS.simpleEndgame, perspective: 'w' })?.text).toContain(
      'Active ton roi',
    );
  });

  it('bloque un pion passe adverse', () => {
    expect(buildPlan({ fen: POSITIONS.passedPawn, perspective: 'b' })?.text).toContain('Bloque');
  });
});

describe('que regarder', () => {
  it('ne donne jamais de coup a jouer', () => {
    for (const fen of Object.values(POSITIONS)) {
      const chess = new Chess(fen);
      for (const focus of watchFocusCandidates({ fen, perspective: chess.turn() })) {
        expect(focus.text).toMatch(/\?$/);
        expect(focus.squares.length).toBeLessThanOrEqual(MAX_WATCH_SQUARES);
      }
    }
  });

  it('regarde d’abord la piece attaquee', () => {
    const focus = buildWatchFocus({ fen: POSITIONS.hangingQueen, perspective: 'w' });
    expect(focus?.text).toContain('ta dame d5');
    expect(focus?.squares).toContain('d5');
  });

  it('fait defiler les pistes a chaque appui', () => {
    const input = { fen: POSITIONS.hangingQueen, perspective: 'w' as const };
    const first = buildWatchFocus(input, 0);
    const second = buildWatchFocus(input, 1);
    expect(first?.text).not.toBe(second?.text);
  });

  it('propose le centre quand la position est calme', () => {
    expect(buildWatchFocus({ fen: POSITIONS.start, perspective: 'w' })?.text).toContain('centre');
  });
});

describe('piece la moins active', () => {
  it('trouve le fou enferme', () => {
    const worst = leastActivePiece(new Chess(POSITIONS.needsCastle), 'w');
    expect(worst?.piece.square).toBe('c1');
    expect(worst?.moves).toBe(0);
  });
});

describe('assemblage', () => {
  it('produit un tableau complet sans le moteur', () => {
    const result = assess(POSITIONS.italian, 'w');
    expect(result?.factors).toHaveLength(5);
    expect(result?.engineBacked).toBe(false);
    expect(result?.critical.length).toBeGreaterThan(0);
  });

  it('ignore une analyse qui ne correspond pas a la position', () => {
    const result = assessPosition({
      fen: POSITIONS.start,
      perspective: 'w',
      analysis: {
        fen: POSITIONS.mateInOne,
        bestMove: 'f3f7',
        depth: 10,
        elapsedMs: 10,
        lines: [{ multipv: 1, depth: 10, score: { cp: null, mate: 1 }, pv: ['f3f7'] }],
      },
    });
    expect(result?.engineBacked).toBe(false);
    expect(texts(result?.critical ?? [])).not.toContain('mat');
  });

  it('renvoie null sur un FEN invalide', () => {
    expect(assess('pas-un-fen')).toBeNull();
  });
});
