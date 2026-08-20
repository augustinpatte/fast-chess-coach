/**
 * Positions de test partagees par plusieurs fichiers de tests.
 * Chaque FEN a ete verifie avec chess.js.
 */
export const POSITIONS = {
  /** La dame blanche d5 est en prise : le pion c6 peut la prendre. */
  hangingQueen: 'rnb1kbnr/pp1ppppp/2p5/3Q4/8/8/PPP1PPPP/RNB1KBNR b KQkq - 0 3',
  /** Position d'ou les blancs peuvent jouer la bevue Dd5. */
  beforeHangingQueen: 'rnb1kbnr/pp1ppppp/2p5/8/8/8/PPP1PPPP/RNBQKBNR w KQkq - 0 3',
  /** Cavalier blanc pret a fourcher roi e8 et tour a8 en c7. */
  knightFork: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1',
  /** Mat en un : Dh5xf7 est mat (mat du berger). */
  mateInOne: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
  /** Roque necessaire : le roi blanc doit se mettre a l'abri. */
  needsCastle: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5',
  /** Pions doubles blancs sur la colonne f. */
  doubledPawns: '4k3/8/8/8/8/5P2/PPPPPP1P/4K3 w - - 0 1',
  /** Pion blanc passe en b6, finale simple. */
  passedPawn: '8/8/1P6/8/8/6k1/8/6K1 w - - 0 1',
  /** Finale roi + tour contre roi. */
  simpleEndgame: '8/8/8/4k3/8/8/4K3/4R3 w - - 0 1',
  /** Pat : les noirs au trait n'ont aucun coup legal. */
  stalemate: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',
  /** Mat : les noirs sont mats. */
  checkmate: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
  /** Promotion imminente pour les blancs. */
  promotion: '8/4P3/8/8/8/4k3/8/4K3 w - - 0 1',
  /** Prise en passant disponible : les blancs peuvent jouer exd6. */
  enPassant: 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3',
  /** Le fou blanc cloue le cavalier f6 sur la dame d8. */
  pin: 'rnbqkb1r/pppp1ppp/5n2/4p1B1/4P3/8/PPPP1PPP/RN1QKBNR b KQkq - 3 3',
  /** Position de depart. */
  start: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',

  /* --- Positions de lecture de position ----------------------------- */

  /** Les noirs menacent Ta1 mat sur la derniere rangee ; les blancs jouent. */
  mateThreat: 'r5k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1',
  /** Les blancs tiennent le centre avec d4 et e4, les noirs n'ont plus de pion central. */
  dominantCenter: 'rnbqkbnr/pppp1ppp/8/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 3',
  /** Finale de pions pure : plus aucune piece. */
  pawnEndgame: '8/5ppp/8/8/8/8/PPP5/4K2k w - - 0 1',
  /** Ouverture italienne, position equilibree et symetrique. */
  italian: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  /** Le fou e4 attaque un cavalier c6 sans defenseur. */
  looseKnight: '4k3/8/2n5/8/4B3/8/8/4K3 w - - 0 1',
  /** Colonne e ouverte, les deux camps ont roque, aucune tour ne l'occupe. */
  rookOpenFile: 'r1bq1rk1/ppp2ppp/2n2n2/3p4/3P4/2NB1N2/PPP2PPP/R1BQ1RK1 w - - 0 9',
} as const;
