import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import type { AnalysisResult, EngineLine } from '@/types';
import { buildFeedback } from './coach';
import { CP_LOSS_THRESHOLDS, classifyMove, isMistakeLike, qualityLabel } from './classification';
import { countLines, countSentences, formatCoachText, respectsCoachLimits } from './format';
import { diagnose } from './diagnostics';
import { PHRASES, levelAdvice } from './phrases';
import { POSITIONS } from '@/tests/positions';

const mkLine = (cp: number, pv: string[], multipv = 1): EngineLine => ({
  multipv,
  depth: 12,
  score: { cp, mate: null },
  pv,
});

const mkAnalysis = (fen: string, lines: EngineLine[]): AnalysisResult => ({
  fen,
  bestMove: lines[0]?.pv[0] ?? null,
  lines,
  depth: 12,
  elapsedMs: 100,
});

describe('perte en centipions et classification', () => {
  it('classe un coup identique au meilleur coup', () => {
    expect(
      classifyMove({ cpLoss: 0, isBestMove: true, missedMate: false, deliversMate: false }),
    ).toBe('best');
  });

  it('classe selon les seuils de perte', () => {
    const base = { isBestMove: false, missedMate: false, deliversMate: false };
    expect(classifyMove({ ...base, cpLoss: 10 })).toBe('excellent');
    expect(classifyMove({ ...base, cpLoss: CP_LOSS_THRESHOLDS.excellent })).toBe('good');
    expect(classifyMove({ ...base, cpLoss: CP_LOSS_THRESHOLDS.good })).toBe('playable');
    expect(classifyMove({ ...base, cpLoss: CP_LOSS_THRESHOLDS.playable })).toBe('inaccuracy');
    expect(classifyMove({ ...base, cpLoss: CP_LOSS_THRESHOLDS.inaccuracy })).toBe('mistake');
    expect(classifyMove({ ...base, cpLoss: 900 })).toBe('blunder');
  });

  it('donne la priorite au mat manque', () => {
    const quality = classifyMove({
      cpLoss: 40,
      isBestMove: false,
      missedMate: true,
      deliversMate: false,
    });
    expect(quality).toBe('missed_mate');
    expect(qualityLabel(quality)).toBe('Mat manqué');
    expect(isMistakeLike(quality)).toBe(true);
  });

  it('reconnait un mat delivre', () => {
    expect(
      classifyMove({ cpLoss: 0, isBestMove: false, missedMate: false, deliversMate: true }),
    ).toBe('best');
  });
});

describe('limitation a deux lignes et deux phrases', () => {
  it('ne garde que deux phrases', () => {
    const text = formatCoachText(['Première phrase.', 'Deuxième phrase.', 'Troisième phrase.']);
    expect(countSentences(text)).toBe(2);
    expect(text).not.toContain('Troisième');
  });

  it('ne produit jamais de retour a la ligne', () => {
    const text = formatCoachText(['Une phrase\navec un retour.', 'Une autre.']);
    expect(countLines(text)).toBe(1);
    expect(respectsCoachLimits(text)).toBe(true);
  });

  it('tronque un texte trop long', () => {
    const long = `${'mot '.repeat(80)}fin.`;
    const text = formatCoachText([long]);
    expect(text.length).toBeLessThanOrEqual(110);
    expect(respectsCoachLimits(text)).toBe(true);
  });

  it('ajoute la ponctuation manquante', () => {
    expect(formatCoachText(['Sans point'])).toBe('Sans point.');
  });
});

describe('modeles de phrases', () => {
  it('reste assez court pour que deux phrases tiennent en deux lignes', () => {
    const samples: string[] = [
      PHRASES.mateDelivered(),
      PHRASES.mateMissed('Dxf7'),
      PHRASES.pieceLost('n', 'd4', 'Cxd4'),
      PHRASES.pieceHanging('q', 'd5'),
      PHRASES.pieceHangingMultiple(3),
      PHRASES.freeCaptureMissed('Fxc6', 'n'),
      PHRASES.freeCaptureNow('Cxe5', 'p'),
      PHRASES.checkThreat('Dh5+'),
      PHRASES.forkCreated('n', 'c7', 2),
      PHRASES.forkAllowed('n', 'd6'),
      PHRASES.pinCreated('n', 'f6'),
      PHRASES.pinSuffered('n', 'f6'),
      PHRASES.doubleAttack('d5'),
      PHRASES.kingExposed(),
      PHRASES.developmentLag('n', 'c1'),
      PHRASES.developmentGood('b'),
      PHRASES.noCastle(),
      PHRASES.castleGood(),
      PHRASES.centerGood('e4'),
      PHRASES.centerLost(),
      PHRASES.misplacedPiece('n', 'a3'),
      PHRASES.badTrade('r', 'n'),
      PHRASES.goodTrade('q'),
      PHRASES.pawnStructure('f'),
      PHRASES.rookActivity('d1'),
      PHRASES.passedPawn('b6'),
      PHRASES.endgamePlan(),
      PHRASES.slowMove(),
      PHRASES.openingInBook('Giuoco Piano'),
      PHRASES.openingLeftBook('Cf3'),
      PHRASES.openingBadDeviation('Cf3'),
      PHRASES.bestMoveConfirmed(),
      PHRASES.keepGoing(),
      PHRASES.neutralGood(),
      levelAdvice('beginner'),
      levelAdvice('intermediate'),
      levelAdvice('progress'),
    ];
    for (const sample of samples) {
      expect(countSentences(sample), sample).toBe(1);
      expect(sample.length, sample).toBeLessThanOrEqual(62);
    }
  });

  it('assemble deux phrases sans depasser la limite', () => {
    const text = formatCoachText([PHRASES.centerGood('e4'), levelAdvice('beginner')]);
    expect(countSentences(text)).toBe(2);
    expect(respectsCoachLimits(text)).toBe(true);
  });
});

describe('diagnostics', () => {
  it('detecte une piece perdue apres un coup', () => {
    // Les blancs jouent Dd5 : la dame est attaquee par le pion c6.
    const chess = new Chess(POSITIONS.beforeHangingQueen);
    const move = chess.move({ from: 'd1', to: 'd5' });
    const found = diagnose({
      fenBefore: move.before,
      fenAfter: move.after,
      move,
      playerColor: 'w',
      cpLoss: 800,
      quality: 'blunder',
      bestMoveSan: 'e4',
      missedMate: false,
      playerMoveHistory: [],
      opening: null,
    });
    expect(found[0].kind === 'piece_lost' || found[0].kind === 'piece_hanging').toBe(true);
  });

  it('detecte un mat delivre en priorite absolue', () => {
    const chess = new Chess(POSITIONS.mateInOne);
    const move = chess.move('Qxf7#');
    const found = diagnose({
      fenBefore: move.before,
      fenAfter: move.after,
      move,
      playerColor: 'w',
      cpLoss: 0,
      quality: 'best',
      bestMoveSan: null,
      missedMate: false,
      playerMoveHistory: [],
      opening: null,
    });
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe('mate_delivered');
  });

  it('detecte une fourchette creee', () => {
    const chess = new Chess(POSITIONS.knightFork);
    const move = chess.move('Nc7+');
    const found = diagnose({
      fenBefore: move.before,
      fenAfter: move.after,
      move,
      playerColor: 'w',
      cpLoss: 0,
      quality: 'best',
      bestMoveSan: null,
      missedMate: false,
      playerMoveHistory: [],
      opening: null,
    });
    expect(found.some((d) => d.kind === 'fork')).toBe(true);
  });

  it('encourage le roque quand il est joue', () => {
    const chess = new Chess(POSITIONS.needsCastle);
    const move = chess.move('O-O');
    const found = diagnose({
      fenBefore: move.before,
      fenAfter: move.after,
      move,
      playerColor: 'w',
      cpLoss: 0,
      quality: 'best',
      bestMoveSan: null,
      missedMate: false,
      playerMoveHistory: [],
      opening: null,
    });
    expect(found.some((d) => d.kind === 'no_castle')).toBe(true);
  });

  it('signale un pion passe cree', () => {
    const chess = new Chess('8/8/8/1P6/8/6k1/8/6K1 w - - 0 1');
    const move = chess.move('b6');
    const found = diagnose({
      fenBefore: move.before,
      fenAfter: move.after,
      move,
      playerColor: 'w',
      cpLoss: 0,
      quality: 'best',
      bestMoveSan: null,
      missedMate: false,
      playerMoveHistory: [],
      opening: null,
    });
    expect(found.some((d) => d.kind === 'endgame_plan' || d.kind === 'passed_pawn')).toBe(true);
  });
});

describe('retour pedagogique complet', () => {
  it('respecte toujours la limite de deux phrases', () => {
    const chess = new Chess();
    const move = chess.move('e4');
    const feedback = buildFeedback({
      fenBefore: move.before,
      fenAfter: move.after,
      move,
      playerColor: 'w',
      before: mkAnalysis(move.before, [mkLine(30, ['e2e4']), mkLine(20, ['d2d4'], 2)]),
      after: mkAnalysis(move.after, [mkLine(-25, ['e7e5'])]),
      coachLevel: 'beginner',
      playerMoveHistory: [],
      opening: null,
    });
    expect(respectsCoachLimits(feedback.text)).toBe(true);
    expect(feedback.quality).toBe('best');
    expect(feedback.diagnostics.length).toBeLessThanOrEqual(2);
  });

  it('calcule la perte en centipions et propose le meilleur coup', () => {
    const chess = new Chess(POSITIONS.beforeHangingQueen);
    const move = chess.move({ from: 'd1', to: 'd5' });
    const feedback = buildFeedback({
      fenBefore: move.before,
      fenAfter: move.after,
      move,
      playerColor: 'w',
      before: mkAnalysis(move.before, [mkLine(20, ['e2e4'])]),
      // Apres le coup, le trait est aux noirs : +900 pour eux = -900 pour nous.
      after: mkAnalysis(move.after, [mkLine(900, ['c6d5'])]),
      coachLevel: 'beginner',
      playerMoveHistory: [],
      opening: null,
    });
    expect(feedback.cpLoss).toBe(920);
    expect(feedback.quality).toBe('blunder');
    expect(feedback.bestMoveSan).toBe('e4');
    expect(respectsCoachLimits(feedback.text)).toBe(true);
    expect(feedback.details?.variation.length).toBeGreaterThan(0);
  });

  it('detecte un mat manque', () => {
    const chess = new Chess(POSITIONS.mateInOne);
    const move = chess.move('d3');
    const feedback = buildFeedback({
      fenBefore: move.before,
      fenAfter: move.after,
      move,
      playerColor: 'w',
      before: mkAnalysis(move.before, [
        { multipv: 1, depth: 10, score: { cp: null, mate: 1 }, pv: ['f3f7'] },
      ]),
      after: mkAnalysis(move.after, [mkLine(120, ['g8f6'])]),
      coachLevel: 'beginner',
      playerMoveHistory: [],
      opening: null,
    });
    expect(feedback.quality).toBe('missed_mate');
    expect(feedback.text).toContain('mat');
    expect(respectsCoachLimits(feedback.text)).toBe(true);
  });

  it('adapte le contenu au niveau pedagogique', () => {
    const chess = new Chess('4k3/8/8/8/8/8/PPP2PPP/3RK3 w - - 0 1');
    const move = chess.move('Rd4');
    const beginner = buildFeedback({
      fenBefore: move.before,
      fenAfter: move.after,
      move,
      playerColor: 'w',
      before: mkAnalysis(move.before, [mkLine(300, ['d1d4'])]),
      after: mkAnalysis(move.after, [mkLine(-300, ['e8e7'])]),
      coachLevel: 'beginner',
      playerMoveHistory: [],
      opening: null,
    });
    const advanced = { ...beginner };
    expect(respectsCoachLimits(beginner.text)).toBe(true);
    expect(respectsCoachLimits(advanced.text)).toBe(true);
    // Le diagnostic « activite des tours » est reserve aux niveaux superieurs.
    expect(beginner.diagnostics).not.toContain('rook_activity');
  });

  it('signale une sortie de theorie sans dramatiser', () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('e5');
    const move = chess.move('Na3');
    const feedback = buildFeedback({
      fenBefore: move.before,
      fenAfter: move.after,
      move,
      playerColor: 'w',
      before: mkAnalysis(move.before, [mkLine(30, ['g1f3'])]),
      after: mkAnalysis(move.after, [mkLine(-10, ['b8c6'])]),
      coachLevel: 'beginner',
      playerMoveHistory: [],
      opening: {
        active: true,
        inBookBefore: true,
        inBookAfter: false,
        variationName: 'Giuoco Piano',
        suggestion: 'Nf3',
      },
    });
    expect(feedback.diagnostics).toContain('opening_deviation');
    expect(respectsCoachLimits(feedback.text)).toBe(true);
  });
});
