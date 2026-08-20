import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  detectFork,
  developmentInfo,
  doubledPawnFiles,
  findPins,
  freeCaptures,
  hangingPieces,
  isEndgame,
  isEnPrise,
  materialBalance,
  passedPawns,
  piecesOf,
  rooksOnOpenFiles,
} from './positionFeatures';
import { POSITIONS } from '@/tests/positions';

describe('pieces en prise', () => {
  it('detecte une dame laissee en prise', () => {
    const chess = new Chess(POSITIONS.hangingQueen);
    expect(isEnPrise(chess, 'd5')).toBe(true);
    expect(hangingPieces(chess, 'w').map((p) => p.square)).toContain('d5');
  });

  it('ne signale pas une piece defendue et non attaquee', () => {
    const chess = new Chess();
    expect(isEnPrise(chess, 'd1')).toBe(false);
    expect(hangingPieces(chess, 'w')).toHaveLength(0);
  });

  it('signale une prise gratuite disponible pour l’adversaire', () => {
    const chess = new Chess(POSITIONS.hangingQueen);
    const captures = freeCaptures(chess, 'b');
    expect(captures.length).toBeGreaterThan(0);
    expect(captures[0].to).toBe('d5');
    expect(captures[0].gain).toBeGreaterThanOrEqual(800);
  });
});

describe('fourchette', () => {
  it('detecte une fourchette de cavalier sur le roi et la tour', () => {
    const chess = new Chess(POSITIONS.knightFork);
    chess.move('Nc7+');
    const fork = detectFork(chess, 'c7');
    expect(fork).not.toBeNull();
    expect(fork?.targets.sort()).toEqual(['a8', 'e8']);
  });

  it('ne voit pas de fourchette la ou il n’y en a pas', () => {
    const chess = new Chess();
    chess.move('Nf3');
    expect(detectFork(chess, 'f3')).toBeNull();
  });
});

describe('clouage', () => {
  it('detecte le clouage du cavalier f6 par le fou g5', () => {
    const chess = new Chess(POSITIONS.pin);
    const pins = findPins(chess, 'w');
    expect(pins.some((p) => p.pinned === 'f6' && p.target === 'd8')).toBe(true);
  });

  it('ne signale pas de clouage dans la position initiale', () => {
    expect(findPins(new Chess(), 'w')).toHaveLength(0);
  });
});

describe('developpement', () => {
  it('compte les pieces mineures non developpees', () => {
    const info = developmentInfo(new Chess(), 'w');
    expect(info.undeveloped).toHaveLength(4);
    expect(info.developedCount).toBe(0);
    expect(info.hasCastled).toBe(false);
    expect(info.kingOnStart).toBe(true);
  });

  it('detecte le roque', () => {
    const chess = new Chess(POSITIONS.needsCastle);
    chess.move('O-O');
    expect(developmentInfo(chess, 'w').hasCastled).toBe(true);
    expect(developmentInfo(chess, 'w').kingOnStart).toBe(false);
  });

  it('compte les pions au centre', () => {
    const chess = new Chess();
    chess.move('e4');
    expect(developmentInfo(chess, 'w').centerPawns).toBe(1);
  });
});

describe('structure et finale', () => {
  it('detecte un pion passe', () => {
    expect(passedPawns(new Chess(POSITIONS.passedPawn), 'w')).toEqual(['b6']);
  });

  it('detecte une finale simple', () => {
    expect(isEndgame(new Chess(POSITIONS.simpleEndgame))).toBe(true);
    expect(isEndgame(new Chess())).toBe(false);
  });

  it('detecte des pions doubles', () => {
    expect(doubledPawnFiles(new Chess(POSITIONS.doubledPawns), 'w')).toEqual(['f']);
  });

  it('detecte une tour sur colonne ouverte', () => {
    const chess = new Chess('4k3/8/8/8/8/8/PPP2PPP/3RK3 w - - 0 1');
    expect(rooksOnOpenFiles(chess, 'w')).toEqual(['d1']);
  });

  it('calcule la balance materielle', () => {
    expect(materialBalance(new Chess(), 'w')).toBe(0);
    expect(materialBalance(new Chess(POSITIONS.simpleEndgame), 'w')).toBe(500);
  });

  it('liste les pieces d’une couleur', () => {
    expect(piecesOf(new Chess(), 'w')).toHaveLength(16);
  });
});
