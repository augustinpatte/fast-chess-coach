import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import type { AnalysisResult, EngineScore } from '@/types';
import {
  alternativesSentence,
  equivalenceThreshold,
  explainBestMove,
  explainTheoryMove,
  nearlyEqualMoves,
  pvConsequence,
} from './bestMoveExplanation';
import { respectsExplanationLimits } from './format';
import { POSITIONS } from '@/tests/positions';

/** Construit une analyse factice : le moteur n'est jamais sollicite ici. */
function analysis(
  fen: string,
  lines: Array<{ pv: string[]; score?: EngineScore }>,
): AnalysisResult {
  return {
    fen,
    bestMove: lines[0]?.pv[0] ?? null,
    depth: 14,
    elapsedMs: 120,
    lines: lines.map((line, index) => ({
      multipv: index + 1,
      depth: 14,
      score: line.score ?? { cp: 30 - index * 10, mate: null },
      pv: line.pv,
    })),
  };
}

const explain = (fen: string, lines: Array<{ pv: string[]; score?: EngineScore }>) =>
  explainBestMove({ fen, analysis: analysis(fen, lines) });

describe('meilleur coup', () => {
  it('renvoie un coup legal et une SAN correcte', () => {
    const fen = POSITIONS.start;
    const result = explain(fen, [{ pv: ['e2e4', 'e7e5'] }]);
    expect(result).not.toBeNull();
    expect(result?.uci).toBe('e2e4');
    expect(result?.from).toBe('e2');
    expect(result?.to).toBe('e4');
    expect(result?.san).toBe('e4');
    // Le coup annonce doit etre rejouable dans la position.
    expect(() => new Chess(fen).move({ from: result!.from, to: result!.to })).not.toThrow();
  });

  it('traduit la notation en francais', () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('e5');
    expect(explain(chess.fen(), [{ pv: ['g1f3'] }])?.san).toBe('Cf3');
  });

  it('rejette un coup illegal renvoye par le moteur', () => {
    expect(explain(POSITIONS.start, [{ pv: ['e2e5'] }])).toBeNull();
  });

  it('renvoie null sans analyse exploitable', () => {
    expect(explainBestMove({ fen: POSITIONS.start, analysis: null })).toBeNull();
    expect(explainBestMove({ fen: 'pas-un-fen', analysis: null })).toBeNull();
  });
});

describe('explication', () => {
  it('ne depasse jamais deux phrases', () => {
    const cases: Array<[string, string]> = [
      [POSITIONS.start, 'e2e4'],
      [POSITIONS.mateInOne, 'f3f7'],
      [POSITIONS.needsCastle, 'e1g1'],
      [POSITIONS.knightFork, 'd5c7'],
      [POSITIONS.passedPawn, 'b6b7'],
      [POSITIONS.hangingQueen, 'c6d5'],
      [POSITIONS.rookOpenFile, 'f1e1'],
      [POSITIONS.simpleEndgame, 'e1d1'],
    ];
    for (const [fen, uci] of cases) {
      const result = explain(fen, [{ pv: [uci] }]);
      expect(result, fen).not.toBeNull();
      expect(respectsExplanationLimits(result!.text), `${fen} → ${result?.text}`).toBe(true);
    }
  });

  it('n’invoque jamais le moteur comme argument', () => {
    for (const [fen, uci] of [
      [POSITIONS.start, 'd2d4'],
      [POSITIONS.italian, 'e1g1'],
      [POSITIONS.rookOpenFile, 'f1e1'],
    ] as const) {
      const text = explain(fen, [{ pv: [uci] }])?.text ?? '';
      expect(text.toLowerCase()).not.toContain('stockfish');
      expect(text.toLowerCase()).not.toContain('moteur');
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('explique un coup tactique par la tactique', () => {
    const result = explain(POSITIONS.knightFork, [{ pv: ['d5c7', 'e8d8'] }]);
    expect(result?.san).toBe('Cc7+');
    expect(result?.text).toContain('2 pièces');
    expect(result?.confidence).toBe('high');
  });

  it('explique un mat par le mat', () => {
    const result = explain(POSITIONS.mateInOne, [{ pv: ['f3f7'], score: { cp: null, mate: 1 } }]);
    expect(result?.san).toBe('Dxf7#');
    expect(result?.text).toContain('mat');
  });

  it('explique une prise gagnante', () => {
    const result = explain(POSITIONS.hangingQueen, [{ pv: ['c6d5'] }]);
    expect(result?.san).toBe('cxd5');
    expect(result?.text).toContain('dame');
  });

  it('explique un coup de developpement', () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('e5');
    const result = explain(chess.fen(), [{ pv: ['g1f3'] }]);
    expect(result?.text).toContain('Développe ton cavalier');
    expect(result?.text).toContain('contrôle');
  });

  it('explique un coup defensif : sauver une piece attaquee', () => {
    // La dame blanche d5 est attaquee par le pion c6 ; Df3 la met a l'abri.
    const fen = 'rnb1kbnr/pp1ppppp/2p5/3Q4/8/8/PPP1PPPP/RNB1KBNR w KQkq - 0 3';
    const result = explain(fen, [{ pv: ['d5f3'] }]);
    expect(result?.san).toBe('Df3');
    expect(result?.text).toContain('à l’abri');
  });

  it('explique le roque par la securite du roi', () => {
    const result = explain(POSITIONS.needsCastle, [{ pv: ['e1g1'] }]);
    expect(result?.san).toBe('O-O');
    expect(result?.text).toContain('roi à l’abri');
  });

  it('explique la poussee d’un pion deja passe sans pretendre le creer', () => {
    const result = explain(POSITIONS.passedPawn, [{ pv: ['b6b7'] }]);
    expect(result?.text).toContain('pion passé');
    expect(result?.text).not.toContain('crée');
  });

  it('reste factuel quand aucune raison forte n’est detectee', () => {
    const result = explain(POSITIONS.simpleEndgame, [{ pv: ['e1d1'] }]);
    expect(result?.text.length).toBeGreaterThan(0);
    expect(respectsExplanationLimits(result!.text)).toBe(true);
  });

  it('decrit le coup reellement joue, pas un autre', () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('e5');
    const knight = explain(chess.fen(), [{ pv: ['g1f3'] }]);
    const bishop = explain(chess.fen(), [{ pv: ['f1c4'] }]);
    expect(knight?.text).toContain('cavalier');
    expect(bishop?.text).toContain('fou');
    expect(knight?.text).not.toBe(bishop?.text);
  });
});

describe('consequence tiree de la variante principale', () => {
  it('confirme un gain materiel rejoue sur l’echiquier', () => {
    // 1.e4 Rd8 2.Txb4 : le cavalier tombe et la tour n'est pas reprise.
    const fen = '4k3/8/8/8/1n6/8/4P3/1R2K3 w - - 0 1';
    const text = pvConsequence(fen, analysis(fen, [{ pv: ['e2e4', 'e8d8', 'b1b4'] }]), 'w');
    expect(text).toContain('Après');
    expect(text).toContain('gagne');
  });

  it('n’invente rien quand la variante est trop courte', () => {
    expect(
      pvConsequence(POSITIONS.start, analysis(POSITIONS.start, [{ pv: ['e2e4'] }]), 'w'),
    ).toBeNull();
  });

  it('n’affirme rien quand la piece est reprise', () => {
    // Dxd5 est repris par le pion c6 : aucune consequence ne doit etre annoncee.
    const fen = POSITIONS.beforeHangingQueen;
    expect(pvConsequence(fen, analysis(fen, [{ pv: ['d1d5', 'c6d5', 'b1c3'] }]), 'w')).toBeNull();
  });
});

describe('coups presque equivalents', () => {
  it('elargit le seuil dans les positions desequilibrees', () => {
    expect(equivalenceThreshold(20)).toBe(25);
    expect(equivalenceThreshold(-400)).toBe(35);
  });

  it('cite les coups a portee du seuil', () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('e5');
    const fen = chess.fen();
    const result = explain(fen, [
      { pv: ['g1f3'], score: { cp: 30, mate: null } },
      { pv: ['f1c4'], score: { cp: 20, mate: null } },
      { pv: ['b1c3'], score: { cp: 15, mate: null } },
    ]);
    expect(result?.alternatives).toEqual(['Fc4', 'Cc3']);
    expect(alternativesSentence(result!)).toBe(
      'Cf3 est le premier choix, mais Fc4 et Cc3 sont également très bons.',
    );
  });

  it('ne cite rien quand le meilleur coup est nettement devant', () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('e5');
    const fen = chess.fen();
    const result = explain(fen, [
      { pv: ['g1f3'], score: { cp: 300, mate: null } },
      { pv: ['f1c4'], score: { cp: 10, mate: null } },
    ]);
    expect(result?.alternatives).toEqual([]);
    expect(alternativesSentence(result!)).toBeNull();
  });

  it('accorde la phrase au singulier avec un seul autre coup', () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('e5');
    const fen = chess.fen();
    const result = explain(fen, [
      { pv: ['g1f3'], score: { cp: 30, mate: null } },
      { pv: ['f1c4'], score: { cp: 25, mate: null } },
    ]);
    expect(alternativesSentence(result!)).toContain('est également très bon.');
  });

  it('ignore les lignes vides ou identiques au meilleur coup', () => {
    expect(nearlyEqualMoves(POSITIONS.start, null, 'e2e4')).toEqual([]);
    const result = nearlyEqualMoves(
      POSITIONS.start,
      analysis(POSITIONS.start, [{ pv: ['e2e4'] }, { pv: ['e2e4'] }, { pv: [] }]),
      'e2e4',
    );
    expect(result).toEqual([]);
  });
});

describe('coup impose', () => {
  it('n’emprunte pas la suite calculee pour un autre coup', () => {
    // Le moteur annonce 1.e4 et sa suite ; on demande l'explication de 1.d4.
    // La consequence « Après …, … gagne » ne concerne pas d4 et doit tomber.
    const fen = '4k3/8/8/8/1n6/8/3PP3/1R2K3 w - - 0 1';
    const engine = explainBestMove({
      fen,
      analysis: analysis(fen, [{ pv: ['e2e4', 'e8d8', 'b1b4'] }]),
    });
    const other = explainBestMove({
      fen,
      analysis: analysis(fen, [{ pv: ['e2e4', 'e8d8', 'b1b4'] }]),
      uci: 'd2d4',
    });
    expect(engine?.text).toContain('Après');
    expect(other?.san).toBe('d4');
    expect(other?.text).not.toContain('Après');
  });

  it('ne presente pas les autres lignes du moteur comme ses equivalents', () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('e5');
    const fen = chess.fen();
    const result = explainBestMove({
      fen,
      analysis: analysis(fen, [
        { pv: ['g1f3'], score: { cp: 30, mate: null } },
        { pv: ['f1c4'], score: { cp: 20, mate: null } },
      ]),
      uci: 'b1c3',
    });
    expect(result?.san).toBe('Cc3');
    expect(result?.alternatives).toEqual([]);
  });
});

describe('coup theorique', () => {
  it('explique le coup du repertoire sans aucune analyse', () => {
    const result = explainTheoryMove(POSITIONS.start, ['e4']);
    expect(result?.san).toBe('e4');
    expect(result?.uci).toBe('e2e4');
    expect(result?.text).toContain('centre');
    expect(respectsExplanationLimits(result!.text)).toBe(true);
  });

  it('cite les autres coups acceptes comme alternatives', () => {
    const result = explainTheoryMove(POSITIONS.start, ['e4', 'd4', 'Nf3']);
    expect(result?.alternatives).toEqual(['d4', 'Cf3']);
    expect(alternativesSentence(result!)).toContain('d4 et Cf3');
  });

  it('renvoie null sans reponse exploitable', () => {
    expect(explainTheoryMove(POSITIONS.start, [])).toBeNull();
    expect(explainTheoryMove(POSITIONS.start, ['Cf6'])).toBeNull();
  });
});
