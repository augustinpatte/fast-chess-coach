import type { Color } from '@/types';

/**
 * Banc d'essai du coach de position.
 *
 * Chaque entree decrit une situation que le tableau de lecture doit savoir
 * traiter. Les analyses Stockfish correspondantes sont enregistrees une fois
 * pour toutes dans `benchmarkAnalyses.json` (script `scripts/benchmark.mjs`),
 * afin que la suite de tests reste rapide et deterministe sans jamais
 * dependre du moteur a l'execution.
 */
export interface BenchmarkPosition {
  id: string;
  /** Ce que la position illustre, en une ligne. */
  label: string;
  fen: string;
  /** Camp du joueur coache. */
  perspective: Color;
}

export const BENCHMARK: readonly BenchmarkPosition[] = [
  /* --- Ouvertures et positions equilibrees --------------------------- */
  {
    id: 'opening-start',
    label: 'Position initiale',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    perspective: 'w',
  },
  {
    id: 'opening-italian',
    label: 'Italienne, position symetrique',
    fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    perspective: 'w',
  },
  {
    id: 'opening-queens-gambit',
    label: 'Gambit dame accepte, developpement en cours',
    fen: 'rnbqkb1r/ppp2ppp/4pn2/8/2pP4/5NP1/PP2PP1P/RNBQKB1R w KQkq - 0 5',
    perspective: 'w',
  },
  {
    id: 'balanced-middlegame',
    label: 'Milieu de jeu equilibre, les deux camps ont roque',
    fen: 'r1bq1rk1/ppp2ppp/2n2n2/3pp3/3PP3/2N2N2/PPP2PPP/R1BQ1RK1 w - - 0 8',
    perspective: 'w',
  },

  /* --- Tactique immediate --------------------------------------------- */
  {
    id: 'hanging-knight',
    label: 'Mon cavalier est en prise',
    fen: '4k3/8/8/3n4/8/8/3R4/4K3 b - - 0 1',
    perspective: 'b',
  },
  {
    id: 'hanging-queen',
    label: 'Ma dame est en prise',
    fen: 'rnb1kbnr/pp1ppppp/2p5/3Q4/8/8/PPP1PPPP/RNB1KBNR b KQkq - 0 3',
    perspective: 'w',
  },
  {
    id: 'fork-available',
    label: 'Fourchette gagnante Cxf7 (attaque Fried Liver)',
    fen: 'r1bqkb1r/ppp2ppp/2n5/3np1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 6',
    perspective: 'w',
  },
  {
    id: 'pinned-knight',
    label: 'Mon cavalier f6 est cloue sur la dame',
    fen: 'rnbqkb1r/pppp1ppp/5n2/4p1B1/4P3/8/PPPP1PPP/RN1QKBNR b KQkq - 3 3',
    perspective: 'b',
  },
  {
    id: 'double-attack',
    label: 'Attaque double disponible',
    fen: '4k3/8/2n3n1/8/8/8/PPP5/3QK3 w - - 0 1',
    perspective: 'w',
  },
  {
    id: 'mate-in-one',
    label: 'Mat en un disponible',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    perspective: 'w',
  },
  {
    id: 'mate-in-two',
    label: 'Mat force en deux avec la dame',
    fen: '7k/8/6K1/8/8/8/8/6Q1 w - - 0 1',
    perspective: 'w',
  },
  {
    id: 'mate-threat',
    label: 'L’adversaire menace mat sur la derniere rangee',
    fen: 'r5k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1',
    perspective: 'w',
  },
  {
    id: 'in-check',
    label: 'Je suis en echec, sans etre mat',
    fen: '4r2k/7p/8/8/8/8/7P/4K2R w K - 0 1',
    perspective: 'w',
  },

  /* --- Sacrifices ------------------------------------------------------ */
  {
    id: 'sacrifice-sound',
    label: 'Sacrifice grec Fxh7+ reellement correct',
    fen: 'r1bq1rk1/ppp1nppp/4p3/3pP3/2PP4/2PB1N2/P4PPP/R2Q1RK1 w - - 0 12',
    perspective: 'w',
  },
  {
    id: 'sacrifice-unsound',
    label: 'Sacrifice de fou incorrect',
    fen: 'rnbqk2r/ppp2ppp/3b1n2/3pp3/8/2NPPN2/PPP2PPP/R1BQKB1R w KQkq - 2 6',
    perspective: 'w',
  },

  /* --- Roi ------------------------------------------------------------- */
  {
    id: 'king-in-center',
    label: 'Roi au centre avec la colonne e ouverte',
    fen: 'r1b1kb1r/ppp2ppp/2n2n2/8/3q4/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 8',
    perspective: 'w',
  },
  {
    id: 'castle-urgent',
    label: 'Developpement fini, il faut roquer',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5',
    perspective: 'w',
  },
  {
    id: 'no-castling-rights',
    label: 'Les deux camps ont perdu le droit de roquer',
    fen: 'r6r/ppp1kppp/2n2n2/3pp3/3PP3/2N2N2/PPP2PPP/R3K2R b KQ - 0 8',
    perspective: 'b',
  },
  {
    id: 'material-up-weak-king',
    label: 'Legerement plus de materiel mais roi expose a la dame',
    fen: '6k1/5pp1/7p/8/6q1/8/5PPP/R4RK1 w - - 0 1',
    perspective: 'w',
  },

  /* --- Echange des dames ------------------------------------------------ */
  {
    id: 'king-under-queen-pressure',
    label: 'Dame adverse collee a mon roi : l’echange des dames me soulagerait',
    fen: 'r4rk1/5pp1/7p/8/6q1/3Q4/5PPP/R4RK1 w - - 0 1',
    perspective: 'w',
  },
  {
    id: 'attacking-with-queen',
    label: 'C’est moi qui attaque : aucun echange de dames a conseiller',
    fen: 'r2q1rk1/5pp1/7p/6Q1/8/8/5PPP/R4RK1 w - - 0 1',
    perspective: 'w',
  },

  /* --- Pions ------------------------------------------------------------ */
  {
    id: 'passed-pawn-mine',
    label: 'J’ai un pion passe a pousser',
    fen: '8/8/1P6/8/8/6k1/8/6K1 w - - 0 1',
    perspective: 'w',
  },
  {
    id: 'passed-pawn-to-block',
    label: 'L’adversaire a un pion passe dangereux',
    fen: '8/8/8/8/8/1p4k1/8/6K1 w - - 0 1',
    perspective: 'w',
  },
  {
    id: 'weak-structure',
    label: 'Pions doubles et isoles',
    fen: 'r3k2r/pp3ppp/8/8/8/2P5/P1P2PPP/R3K2R w KQkq - 0 15',
    perspective: 'w',
  },
  {
    id: 'promotion-soon',
    label: 'Promotion imminente',
    fen: '8/4P3/8/8/8/4k3/8/4K3 w - - 0 1',
    perspective: 'w',
  },
  {
    id: 'en-passant',
    label: 'Prise en passant disponible',
    fen: 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3',
    perspective: 'w',
  },

  /* --- Pieces ----------------------------------------------------------- */
  {
    id: 'open-file',
    label: 'Colonne e ouverte, aucune tour ne l’occupe',
    fen: 'r1bq1rk1/ppp1bppp/2n2n2/3p4/3P4/2NB1N2/PPP2PPP/R1BQ1RK1 w - - 0 9',
    perspective: 'w',
  },
  {
    id: 'trapped-piece',
    label: 'Fou enferme derriere son propre pion, aucun coup legal',
    fen: '4k3/pp2n1pp/8/8/8/8/1P4PP/B3K3 w - - 0 20',
    perspective: 'w',
  },
  {
    id: 'bad-bishop',
    label: 'Mauvais fou bloque par ses propres pions',
    fen: '4k3/pp3ppp/2p1n3/2Pp4/3P4/8/PP2BPPP/4K3 w - - 0 20',
    perspective: 'w',
  },
  {
    id: 'space-advantage',
    label: 'Avantage d’espace clair (chaine de pions e5-d4-c3)',
    fen: 'r1bqkb1r/pp2nppp/2n1p3/2ppP3/3P4/2P2N2/PP3PPP/RNBQKB1R w KQkq - 1 7',
    perspective: 'w',
  },
  {
    id: 'space-but-losing-piece',
    label: 'Avantage d’espace mais mon cavalier e4 est en prise',
    fen: 'r1bq1rk1/pp1nbppp/2n1p3/2ppP3/3PN3/2P5/PP3PPP/RNBQKB1R w KQkq - 0 8',
    perspective: 'w',
  },

  /* --- Finales ----------------------------------------------------------- */
  {
    id: 'rook-endgame',
    label: 'Finale de tours avec un pion',
    fen: '8/8/4k3/8/8/4K3/4P3/4R3 w - - 0 1',
    perspective: 'w',
  },
  {
    id: 'pawn-endgame',
    label: 'Finale de pions, opposition',
    fen: '8/8/4k3/8/4P3/4K3/8/8 w - - 0 1',
    perspective: 'w',
  },
  {
    id: 'queenless-middlegame',
    label: 'Milieu de jeu sans dames',
    fen: 'r3k2r/ppp2ppp/2n2n2/3pp3/3PP3/2N2N2/PPP2PPP/R3K2R w KQkq - 0 9',
    perspective: 'w',
  },
  {
    id: 'winning-no-tactic',
    label: 'Une tour de plus, mais aucune tactique immediate',
    fen: 'r5k1/5ppp/p7/8/8/P7/5PPP/R3R1K1 w - - 0 20',
    perspective: 'w',
  },
  {
    id: 'losing-defensive',
    label: 'Une dame contre une tour de moins : la priorite est defensive',
    fen: '6k1/5pp1/7p/8/6q1/8/5PPP/R5K1 w - - 0 25',
    perspective: 'w',
  },
];
