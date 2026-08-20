import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  REPERTOIRE,
  getOpeningById,
  isInBook,
  lookupBook,
  openingsForSide,
  pickAiOpening,
  pickBookMove,
  positionKey,
  trainingPositions,
} from './book';

describe('repertoire d’ouvertures', () => {
  it('contient toutes les ouvertures demandees', () => {
    expect(
      openingsForSide('white')
        .map((o) => o.id)
        .sort(),
    ).toEqual(['english', 'italian', 'london', 'queens-gambit', 'ruy-lopez', 'scotch'].sort());
    expect(
      openingsForSide('black-e4')
        .map((o) => o.id)
        .sort(),
    ).toEqual(['caro-kann', 'french', 'open-e5', 'sicilian'].sort());
    expect(
      openingsForSide('black-d4')
        .map((o) => o.id)
        .sort(),
    ).toEqual(['kings-indian', 'nimzo-indian', 'qgd-black', 'slav'].sort());
  });

  it('ne contient que des lignes legales', () => {
    for (const opening of REPERTOIRE) {
      for (const variation of opening.variations) {
        const chess = new Chess();
        for (const san of variation.moves) {
          expect(() => chess.move(san), `${opening.id} / ${variation.name} / ${san}`).not.toThrow();
        }
      }
    }
  });

  it('reste volontairement petit', () => {
    for (const opening of REPERTOIRE) {
      expect(opening.variations.length).toBeGreaterThanOrEqual(3);
      expect(opening.variations.length).toBeLessThanOrEqual(5);
      for (const variation of opening.variations) {
        expect(variation.moves.length).toBeLessThanOrEqual(12);
      }
      expect(opening.commonMistakes.length).toBeGreaterThan(0);
      expect(opening.goal.length).toBeGreaterThan(10);
    }
  });
});

describe('consultation du livre', () => {
  it('propose les coups theoriques de la position initiale', () => {
    const italian = getOpeningById('italian');
    const chess = new Chess();
    const result = lookupBook(italian, chess.fen());
    expect(result.inBook).toBe(true);
    expect(result.moves).toContain('e4');
  });

  it('accepte plusieurs coups corrects dans une meme position', () => {
    const italian = getOpeningById('italian');
    const chess = new Chess();
    for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']) chess.move(san);
    const result = lookupBook(italian, chess.fen());
    expect(result.moves.length).toBeGreaterThanOrEqual(2);
    expect(result.moves).toContain('c3');
    expect(result.moves).toContain('b4');
  });

  it('detecte une sortie de theorie', () => {
    const italian = getOpeningById('italian');
    const chess = new Chess();
    chess.move('e4');
    chess.move('e5');
    expect(isInBook(italian, chess.fen())).toBe(true);
    chess.move('Na3');
    expect(isInBook(italian, chess.fen())).toBe(false);
    expect(lookupBook(italian, chess.fen()).moves).toEqual([]);
  });

  it('ignore les compteurs de coups dans la cle de position', () => {
    expect(positionKey('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(
      positionKey('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 5 9'),
    );
  });

  it('choisit un coup du livre de maniere reproductible', () => {
    const italian = getOpeningById('italian');
    expect(pickBookMove(italian, new Chess().fen(), () => 0)).toBe('e4');
    expect(pickBookMove(null, new Chess().fen())).toBeNull();
  });

  it('choisit une ouverture credible pour l’IA', () => {
    const white = pickAiOpening('b', () => 0);
    expect(white.side).toBe('white');
    const black = pickAiOpening('w', () => 0);
    expect(black.side).not.toBe('white');
  });
});

describe('mode entrainement', () => {
  it('genere des exercices pour le camp entraine', () => {
    const italian = getOpeningById('italian');
    expect(italian).not.toBeNull();
    const positions = trainingPositions(italian!);
    expect(positions.length).toBeGreaterThan(3);
    for (const position of positions) {
      expect(new Chess(position.fen).turn()).toBe('w');
      expect(position.answers.length).toBeGreaterThan(0);
      for (const answer of position.answers) {
        expect(() => new Chess(position.fen).move(answer)).not.toThrow();
      }
    }
  });

  it('entraine les noirs pour une defense', () => {
    const caro = getOpeningById('caro-kann');
    const positions = trainingPositions(caro!);
    expect(positions.length).toBeGreaterThan(3);
    expect(new Chess(positions[0].fen).turn()).toBe('b');
  });
});
