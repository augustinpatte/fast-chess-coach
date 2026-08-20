import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  createGame,
  endReason,
  isLegalMove,
  isPromotionMove,
  kingSquare,
  legalMoves,
  moveToUci,
  movesFromSquare,
  uciLineToSan,
  uciToMove,
  uciToSan,
} from './rules';
import { fenWithTurn, fullmoveNumber, isValidFen, safeFen, sideToMove } from './fen';
import { POSITIONS } from '@/tests/positions';

describe('coups legaux', () => {
  it('donne 20 coups legaux dans la position initiale', () => {
    expect(legalMoves(createGame())).toHaveLength(20);
  });

  it('liste les coups d’une case donnee', () => {
    const moves = movesFromSquare(createGame(), 'e2');
    expect(moves.map((m) => m.san).sort()).toEqual(['e3', 'e4']);
  });

  it('accepte un coup legal', () => {
    expect(isLegalMove(createGame(), 'e2', 'e4')).toBe(true);
  });
});

describe('coups illegaux', () => {
  it('refuse un deplacement de pion de trois cases', () => {
    expect(isLegalMove(createGame(), 'e2', 'e5')).toBe(false);
  });

  it('refuse de bouger une piece adverse', () => {
    expect(isLegalMove(createGame(), 'e7', 'e5')).toBe(false);
  });

  it('refuse un coup qui laisse son roi en echec', () => {
    // Le cavalier f6 est cloue par le fou g5 sur la dame d8 : Cxe4 reste legal,
    // mais deplacer le pion d7 ne libere pas la dame de la pression.
    const chess = new Chess('rnbqkbnr/ppp2ppp/8/3pp1B1/4P3/8/PPPP1PPP/RN1QKBNR b KQkq - 1 3');
    expect(isLegalMove(chess, 'd8', 'd7')).toBe(true);
    expect(isLegalMove(chess, 'e8', 'e7')).toBe(false);
  });

  it('renvoie null pour un coup UCI impossible', () => {
    expect(uciToMove(POSITIONS.start, 'e2e5')).toBeNull();
    expect(uciToSan(POSITIONS.start, 'a1a8')).toBeNull();
  });
});

describe('promotion', () => {
  it('detecte un coup de promotion', () => {
    const chess = createGame(POSITIONS.promotion);
    expect(isPromotionMove(chess, 'e7', 'e8')).toBe(true);
  });

  it('applique la promotion demandee', () => {
    const move = uciToMove(POSITIONS.promotion, 'e7e8q');
    expect(move?.promotion).toBe('q');
    expect(move?.san).toBe('e8=Q+');
  });

  it('permet aussi une sous-promotion', () => {
    expect(uciToSan(POSITIONS.promotion, 'e7e8n')).toBe('e8=N');
  });
});

describe('roque', () => {
  it('autorise le petit roque quand les cases sont libres', () => {
    const chess = createGame(POSITIONS.needsCastle);
    expect(legalMoves(chess).some((m) => m.san === 'O-O')).toBe(true);
    expect(moveToUci(uciToMove(POSITIONS.needsCastle, 'e1g1')!)).toBe('e1g1');
  });

  it('interdit le roque si le roi a deja bouge', () => {
    const chess = createGame(POSITIONS.needsCastle);
    chess.move('Ke2');
    chess.move('O-O');
    chess.move('Ke1');
    chess.move('d6');
    expect(legalMoves(chess).some((m) => m.san === 'O-O')).toBe(false);
  });
});

describe('prise en passant', () => {
  it('propose la prise en passant quand elle est disponible', () => {
    const chess = createGame(POSITIONS.enPassant);
    const ep = legalMoves(chess).find((m) => m.san === 'exd6');
    expect(ep).toBeDefined();
    expect(ep?.flags).toContain('e');
  });

  it('retire le pion capture en passant', () => {
    const chess = createGame(POSITIONS.enPassant);
    chess.move('exd6');
    expect(chess.get('d5')).toBeUndefined();
    expect(chess.get('d6')?.type).toBe('p');
  });
});

describe('echec, mat et pat', () => {
  it('detecte l’echec', () => {
    const chess = createGame(POSITIONS.knightFork);
    chess.move('Nc7+');
    expect(chess.isCheck()).toBe(true);
    expect(chess.isCheckmate()).toBe(false);
  });

  it('detecte le mat', () => {
    const chess = createGame(POSITIONS.checkmate);
    expect(chess.isCheckmate()).toBe(true);
    expect(endReason(chess)).toBe('checkmate');
  });

  it('detecte le pat', () => {
    const chess = createGame(POSITIONS.stalemate);
    expect(chess.isStalemate()).toBe(true);
    expect(endReason(chess)).toBe('stalemate');
  });

  it('trouve la case du roi', () => {
    expect(kingSquare(createGame(), 'w')).toBe('e1');
    expect(kingSquare(createGame(), 'b')).toBe('e8');
  });
});

describe('utilitaires FEN', () => {
  it('valide un FEN correct et rejette un FEN casse', () => {
    expect(isValidFen(POSITIONS.start)).toBe(true);
    expect(isValidFen('nimportequoi')).toBe(false);
    expect(safeFen('nimportequoi')).toBeNull();
  });

  it('lit le trait et le numero de coup', () => {
    expect(sideToMove(POSITIONS.start)).toBe('w');
    expect(sideToMove(POSITIONS.pin)).toBe('b');
    expect(fullmoveNumber(POSITIONS.needsCastle)).toBe(5);
  });

  it('inverse le trait sans casser la position', () => {
    const flipped = fenWithTurn(POSITIONS.start, 'b');
    expect(sideToMove(flipped)).toBe('b');
    expect(isValidFen(flipped)).toBe(true);
  });
});

describe('conversion de variantes', () => {
  it('traduit une suite UCI en SAN', () => {
    expect(uciLineToSan(POSITIONS.start, ['e2e4', 'e7e5', 'g1f3', 'b8c6'])).toEqual([
      'e4',
      'e5',
      'Nf3',
      'Nc6',
    ]);
  });

  it('s’arrete au premier coup illegal', () => {
    expect(uciLineToSan(POSITIONS.start, ['e2e4', 'e7e5', 'a1a8'])).toEqual(['e4', 'e5']);
  });
});
