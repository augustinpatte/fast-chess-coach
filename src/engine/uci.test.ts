import { describe, expect, it } from 'vitest';
import {
  MATE_CP,
  formatScore,
  isReadyOk,
  isUciOk,
  parseBestMove,
  parseInfoLine,
  scoreToBarPercent,
  scoreToCp,
  scoreToWhitePov,
} from './uci';

describe('parsing des reponses UCI', () => {
  it('lit une ligne info complete', () => {
    const line = parseInfoLine(
      'info depth 14 seldepth 20 multipv 1 score cp 34 nodes 12345 nps 90000 pv e2e4 e7e5 g1f3',
    );
    expect(line).not.toBeNull();
    expect(line?.depth).toBe(14);
    expect(line?.multipv).toBe(1);
    expect(line?.score).toEqual({ cp: 34, mate: null });
    expect(line?.pv).toEqual(['e2e4', 'e7e5', 'g1f3']);
  });

  it('lit une evaluation negative', () => {
    const line = parseInfoLine('info depth 8 multipv 2 score cp -215 pv d7d5');
    expect(line?.score.cp).toBe(-215);
    expect(line?.multipv).toBe(2);
  });

  it('lit un score de mat', () => {
    const line = parseInfoLine('info depth 6 multipv 1 score mate 3 pv d1h5 e8e7 h5f7');
    expect(line?.score).toEqual({ cp: null, mate: 3 });
    const against = parseInfoLine('info depth 6 score mate -2 pv a1a2');
    expect(against?.score.mate).toBe(-2);
  });

  it('ignore les lignes sans score exploitable', () => {
    expect(parseInfoLine('info depth 1 currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfoLine('info string NNUE evaluation using nn-xxxx.nnue')).toBeNull();
    expect(parseInfoLine('bestmove e2e4')).toBeNull();
  });

  it('lit le meilleur coup', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
    expect(parseBestMove('bestmove e7e8q')).toBe('e7e8q');
    expect(parseBestMove('bestmove (none)')).toBeNull();
    expect(parseBestMove('info depth 3')).toBeNull();
  });

  it('reconnait les accuses de reception', () => {
    expect(isUciOk('uciok')).toBe(true);
    expect(isReadyOk('readyok')).toBe(true);
    expect(isReadyOk('uciok')).toBe(false);
  });
});

describe('conversion des scores', () => {
  it('convertit vers le point de vue des blancs', () => {
    expect(scoreToWhitePov({ cp: 50, mate: null }, 'w')).toEqual({ cp: 50, mate: null });
    expect(scoreToWhitePov({ cp: 50, mate: null }, 'b')).toEqual({ cp: -50, mate: null });
    expect(scoreToWhitePov({ cp: null, mate: 3 }, 'b')).toEqual({ cp: null, mate: -3 });
  });

  it('transforme un mat en centipions comparables', () => {
    expect(scoreToCp({ cp: null, mate: 1 })).toBeGreaterThan(MATE_CP - 200);
    expect(scoreToCp({ cp: null, mate: 5 })).toBeLessThan(scoreToCp({ cp: null, mate: 1 }));
    expect(scoreToCp({ cp: null, mate: -2 })).toBeLessThan(-MATE_CP + 500);
    expect(scoreToCp({ cp: 120, mate: null })).toBe(120);
  });

  it('formate le score pour l’affichage', () => {
    expect(formatScore({ cp: 120, mate: null })).toBe('+1.2');
    expect(formatScore({ cp: -45, mate: null })).toBe('-0.5');
    expect(formatScore({ cp: null, mate: 3 })).toBe('M3');
    expect(formatScore({ cp: null, mate: -2 })).toBe('-M2');
  });

  it('convertit en pourcentage de barre', () => {
    expect(scoreToBarPercent({ cp: 0, mate: null })).toBeCloseTo(50, 1);
    expect(scoreToBarPercent({ cp: 800, mate: null })).toBeGreaterThan(85);
    expect(scoreToBarPercent({ cp: -800, mate: null })).toBeLessThan(15);
    expect(scoreToBarPercent({ cp: null, mate: 2 })).toBe(100);
    expect(scoreToBarPercent({ cp: null, mate: -2 })).toBe(0);
  });
});
