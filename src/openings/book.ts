import { Chess } from 'chess.js';
import type { BookLookupResult, Color, OpeningEntry, OpeningSide } from '@/types';
import rawRepertoire from './repertoire.json';

/**
 * Repertoire d'ouvertures local.
 *
 * Volontairement petit : 14 ouvertures, 3 a 4 variantes chacune, 10 a 12
 * demi-coups au maximum. L'objectif est de retenir des idees, pas de stocker
 * une base de donnees.
 */
export const REPERTOIRE: OpeningEntry[] = rawRepertoire as OpeningEntry[];

/** Cle de position : les compteurs de coups sont ignores. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

interface BookNode {
  moves: Set<string>;
  variation: string;
  idea: string;
}

const indexCache = new Map<string, Map<string, BookNode>>();

/** Construit (et memorise) l'index position -> coups theoriques d'une ouverture. */
export function buildIndex(opening: OpeningEntry): Map<string, BookNode> {
  const cached = indexCache.get(opening.id);
  if (cached) return cached;

  const index = new Map<string, BookNode>();
  for (const variation of opening.variations) {
    const chess = new Chess();
    for (const san of variation.moves) {
      const key = positionKey(chess.fen());
      const node = index.get(key);
      if (node) {
        node.moves.add(san);
      } else {
        index.set(key, { moves: new Set([san]), variation: variation.name, idea: variation.idea });
      }
      try {
        chess.move(san);
      } catch {
        // Ligne invalide : on arrete cette variante (protege des fautes de saisie).
        break;
      }
    }
  }
  indexCache.set(opening.id, index);
  return index;
}

/** Coups theoriques disponibles dans la position courante. */
export function lookupBook(opening: OpeningEntry | null, fen: string): BookLookupResult {
  if (!opening) return { moves: [], variation: null, idea: null, inBook: false };
  const node = buildIndex(opening).get(positionKey(fen));
  if (!node) return { moves: [], variation: null, idea: null, inBook: false };
  return {
    moves: [...node.moves],
    variation: node.variation,
    idea: node.idea,
    inBook: true,
  };
}

/** true si la position appartient encore au repertoire de l'ouverture. */
export function isInBook(opening: OpeningEntry | null, fen: string): boolean {
  return lookupBook(opening, fen).inBook;
}

/**
 * Choisit un coup theorique pour la position, ou null si on est sorti du livre.
 * `rng` est injecte pour rendre le choix reproductible dans les tests.
 */
export function pickBookMove(
  opening: OpeningEntry | null,
  fen: string,
  rng: () => number = Math.random,
): string | null {
  const result = lookupBook(opening, fen);
  if (!result.inBook || result.moves.length === 0) return null;
  const index = Math.min(result.moves.length - 1, Math.floor(rng() * result.moves.length));
  return result.moves[index];
}

/** Ouvertures filtrees par camp. */
export function openingsForSide(side: OpeningSide): OpeningEntry[] {
  return REPERTOIRE.filter((o) => o.side === side);
}

/** Recherche par identifiant. */
export function getOpeningById(id: string | null): OpeningEntry | null {
  if (!id) return null;
  return REPERTOIRE.find((o) => o.id === id) ?? null;
}

/**
 * Choisit une ouverture credible pour l'IA en partie libre.
 * `playerColor` est la couleur du joueur humain : l'IA prend l'autre camp.
 */
export function pickAiOpening(playerColor: Color, rng: () => number = Math.random): OpeningEntry {
  const pool =
    playerColor === 'b' ? openingsForSide('white') : REPERTOIRE.filter((o) => o.side !== 'white');
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[index];
}

export interface TrainingPosition {
  /** FEN de depart de l'exercice. */
  fen: string;
  /** Coups theoriques acceptes (SAN). */
  answers: string[];
  variation: string;
  idea: string;
  /** Coups deja joues, en SAN, pour l'affichage. */
  history: string[];
}

/**
 * Genere les exercices d'une ouverture : chaque position ou le camp entraine
 * doit trouver un coup theorique. Plusieurs reponses sont acceptees.
 */
export function trainingPositions(opening: OpeningEntry): TrainingPosition[] {
  const trainedColor: Color = opening.side === 'white' ? 'w' : 'b';
  const index = buildIndex(opening);
  const seen = new Set<string>();
  const out: TrainingPosition[] = [];

  for (const variation of opening.variations) {
    const chess = new Chess();
    const history: string[] = [];
    for (const san of variation.moves) {
      const fen = chess.fen();
      const key = positionKey(fen);
      if (chess.turn() === trainedColor && !seen.has(key)) {
        const node = index.get(key);
        if (node) {
          seen.add(key);
          out.push({
            fen,
            answers: [...node.moves],
            variation: variation.name,
            idea: variation.idea,
            history: [...history],
          });
        }
      }
      try {
        chess.move(san);
      } catch {
        break;
      }
      history.push(san);
    }
  }
  return out;
}
