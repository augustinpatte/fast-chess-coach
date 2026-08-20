import { Chess } from 'chess.js';
import type { Color, PieceType, Square } from '@/types';
import { PIECE_VALUE } from './pieces';
import { fenWithTurn, safeFen } from './fen';
import { legalMoves, materialCount, type Move } from './rules';

export interface PieceOnBoard {
  square: Square;
  type: PieceType;
  color: Color;
}

/** Liste toutes les pieces d'une couleur (roi inclus). */
export function piecesOf(chess: Chess, color: Color): PieceOnBoard[] {
  const out: PieceOnBoard[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === color) {
        out.push({ square: cell.square, type: cell.type, color: cell.color });
      }
    }
  }
  return out;
}

const opposite = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/**
 * Test d'echange statique simplifie : une piece est "en prise" si elle est
 * attaquee et que soit elle n'est pas defendue, soit le plus faible attaquant
 * vaut nettement moins qu'elle (echange perdant).
 *
 * Ce n'est pas un SEE complet, mais c'est suffisant et fiable pour un joueur
 * de 800 a 1500 Elo, et cela evite les faux positifs les plus courants.
 */
export function isEnPrise(chess: Chess, square: Square): boolean {
  const piece = chess.get(square as Parameters<Chess['get']>[0]);
  if (!piece || piece.type === 'k') return false;
  const attackers = chess.attackers(square as never, opposite(piece.color));
  if (attackers.length === 0) return false;
  const defenders = chess.attackers(square as never, piece.color);
  if (defenders.length === 0) return true;

  const value = PIECE_VALUE[piece.type];
  const cheapestAttacker = Math.min(
    ...attackers.map((sq) => {
      const p = chess.get(sq);
      return p ? PIECE_VALUE[p.type] : PIECE_VALUE.k;
    }),
  );
  // Un attaquant nettement moins cher gagne l'echange meme si la piece est defendue.
  if (cheapestAttacker + 60 < value) return true;
  // Plus d'attaquants que de defenseurs : l'echange finit mal.
  return attackers.length > defenders.length && cheapestAttacker <= value;
}

/** Toutes les pieces d'une couleur actuellement en prise (hors roi). */
export function hangingPieces(chess: Chess, color: Color): PieceOnBoard[] {
  return piecesOf(chess, color).filter((p) => p.type !== 'k' && isEnPrise(chess, p.square));
}

/**
 * Piece la plus precieuse reellement en danger, ou null.
 *
 * Un pion n'est retenu que s'il n'a aucun defenseur : la tension normale au
 * centre (« attaque deux fois, defendu une fois ») n'est pas une piece en
 * prise, et la signaler a chaque coup noierait les vraies alertes.
 */
export function worstHangingPiece(chess: Chess, color: Color): PieceOnBoard | null {
  const real = hangingPieces(chess, color).filter(
    (p) => p.type !== 'p' || chess.attackers(p.square as never, color).length === 0,
  );
  if (real.length === 0) return null;
  return [...real].sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type])[0];
}

export interface CaptureOpportunity {
  from: Square;
  to: Square;
  san: string;
  captured: PieceType;
  /** Gain materiel estime, en centipions. */
  gain: number;
  /** FEN obtenu apres la prise : sert a verifier la riposte adverse. */
  after: string;
}

/**
 * Prises gratuites (ou tres favorables) disponibles pour `color`.
 * On force le trait a `color` afin de detecter aussi les menaces adverses.
 */
export function freeCaptures(chess: Chess, color: Color): CaptureOpportunity[] {
  const probe = safeFen(fenWithTurn(chess.fen(), color));
  if (!probe) return [];
  const out: CaptureOpportunity[] = [];
  for (const move of legalMoves(probe)) {
    if (!move.captured) continue;
    const targetValue = PIECE_VALUE[move.captured];
    const attackerValue = PIECE_VALUE[move.piece];
    const after = safeFen(move.after);
    if (!after) continue;
    // Apres la prise, notre piece est-elle reprise ?
    const recaptured = isEnPrise(after, move.to);
    const gain = recaptured ? targetValue - attackerValue : targetValue;
    if (gain >= 100) {
      out.push({
        from: move.from,
        to: move.to,
        san: move.san,
        captured: move.captured,
        gain,
        after: move.after,
      });
    }
  }
  return out.sort((a, b) => b.gain - a.gain);
}

/**
 * Prises reellement profitables.
 *
 * `freeCaptures` compte le materiel, mais ignore la riposte : une piece clouee
 * peut « gagner » un pion et perdre la dame au coup suivant. On rejoue donc
 * chaque prise et on ecarte celles auxquelles l'adversaire repond par une prise
 * au moins aussi rentable.
 */
export function soundCaptures(chess: Chess, color: Color, limit = 4): CaptureOpportunity[] {
  const out: CaptureOpportunity[] = [];
  for (const capture of freeCaptures(chess, color).slice(0, limit)) {
    const after = safeFen(capture.after);
    if (!after) continue;
    const counter = freeCaptures(after, opposite(color))[0];
    // Seule une riposte STRICTEMENT plus rentable annule la prise : une reprise
    // de valeur egale laisse le gain intact apres notre propre reprise.
    if (counter && counter.gain > capture.gain) continue;
    out.push(capture);
  }
  return out;
}

export interface ForkInfo {
  from: Square;
  targets: Square[];
  targetTypes: PieceType[];
}

/**
 * Detecte une fourchette : la piece sur `square` attaque au moins deux cibles
 * de valeur superieure (ou le roi) qui ne sont pas toutes defendues.
 */
export function detectFork(chess: Chess, square: Square): ForkInfo | null {
  const piece = chess.get(square as never);
  if (!piece) return null;
  const enemy = opposite(piece.color);
  const value = PIECE_VALUE[piece.type];
  const targets: Square[] = [];
  const targetTypes: PieceType[] = [];

  for (const target of piecesOf(chess, enemy)) {
    const attackers = chess.attackers(target.square as never, piece.color);
    if (!attackers.includes(square as never)) continue;
    const targetValue = PIECE_VALUE[target.type];
    const worthIt =
      target.type === 'k' || targetValue > value || !isDefended(chess, target.square, enemy);
    if (worthIt) {
      targets.push(target.square);
      targetTypes.push(target.type);
    }
  }
  return targets.length >= 2 ? { from: square, targets, targetTypes } : null;
}

/** true si la case est defendue par au moins une piece de sa couleur. */
export function isDefended(chess: Chess, square: Square, color: Color): boolean {
  return chess.attackers(square as never, color).length > 0;
}

export interface PinInfo {
  pinner: Square;
  pinned: Square;
  target: Square;
  /** true si la piece derriere est le roi (clouage absolu). */
  absolute: boolean;
}

const RAYS: Record<'b' | 'r', ReadonlyArray<readonly [number, number]>> = {
  b: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
  r: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
};

const FILES = 'abcdefgh';

function toCoords(square: Square): [number, number] | null {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  if (file < 0 || rank < 0 || rank > 7) return null;
  return [file, rank];
}

function toSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${rank + 1}`;
}

/**
 * Detecte les clouages realises par `color` : une piece adverse bloque la ligne
 * d'un fou / d'une tour / d'une dame vers une piece adverse plus precieuse.
 */
export function findPins(chess: Chess, color: Color): PinInfo[] {
  const pins: PinInfo[] = [];
  const enemy = opposite(color);

  for (const slider of piecesOf(chess, color)) {
    const directions: ReadonlyArray<readonly [number, number]> =
      slider.type === 'b'
        ? RAYS.b
        : slider.type === 'r'
          ? RAYS.r
          : slider.type === 'q'
            ? [...RAYS.b, ...RAYS.r]
            : [];
    if (directions.length === 0) continue;
    const origin = toCoords(slider.square);
    if (!origin) continue;

    for (const [df, dr] of directions) {
      let file = origin[0] + df;
      let rank = origin[1] + dr;
      let first: PieceOnBoard | null = null;

      while (true) {
        const sq = toSquare(file, rank);
        if (!sq) break;
        const cell = chess.get(sq as never);
        if (cell) {
          const found: PieceOnBoard = { square: sq, type: cell.type, color: cell.color };
          if (!first) {
            // Le premier blocage doit etre une piece adverse pour qu'il y ait clouage.
            if (found.color !== enemy) break;
            first = found;
          } else {
            if (found.color === enemy) {
              const absolute = found.type === 'k';
              if (absolute || PIECE_VALUE[found.type] > PIECE_VALUE[first.type]) {
                pins.push({
                  pinner: slider.square,
                  pinned: first.square,
                  target: found.square,
                  absolute,
                });
              }
            }
            break;
          }
        }
        file += df;
        rank += dr;
      }
    }
  }
  return pins;
}

export interface DevelopmentInfo {
  /** Cavaliers et fous encore sur leur case initiale. */
  undeveloped: PieceOnBoard[];
  developedCount: number;
  hasCastled: boolean;
  /** Roi encore sur sa case initiale, sans avoir roque. */
  kingOnStart: boolean;
  /** Nombre de pions au centre (d4/e4/d5/e5). */
  centerPawns: number;
}

const START_MINORS: Record<Color, Square[]> = {
  w: ['b1', 'g1', 'c1', 'f1'],
  b: ['b8', 'g8', 'c8', 'f8'],
};

/**
 * Etat du developpement d'une couleur.
 * `hasCastled` est deduit de la position du roi (g1/c1/g8/c8) : c'est une
 * approximation volontaire, suffisante pour un conseil pedagogique.
 */
export function developmentInfo(chess: Chess, color: Color): DevelopmentInfo {
  const pieces = piecesOf(chess, color);
  const undeveloped = pieces.filter(
    (p) => (p.type === 'n' || p.type === 'b') && START_MINORS[color].includes(p.square),
  );
  const minors = pieces.filter((p) => p.type === 'n' || p.type === 'b');
  const kingHome = color === 'w' ? 'e1' : 'e8';
  const king = pieces.find((p) => p.type === 'k');
  const castledSquares = color === 'w' ? ['g1', 'c1', 'b1', 'h1'] : ['g8', 'c8', 'b8', 'h8'];
  const centerSquares = ['d4', 'e4', 'd5', 'e5'];
  const centerPawns = pieces.filter(
    (p) => p.type === 'p' && centerSquares.includes(p.square),
  ).length;

  return {
    undeveloped,
    developedCount: minors.length - undeveloped.length,
    hasCastled: king ? castledSquares.includes(king.square) : false,
    kingOnStart: king ? king.square === kingHome : false,
    centerPawns,
  };
}

/** Balance materielle du point de vue de `color`, en centipions. */
export function materialBalance(chess: Chess, color: Color): number {
  return (
    materialCount(chess, color, PIECE_VALUE) - materialCount(chess, opposite(color), PIECE_VALUE)
  );
}

/** Nombre total de pieces (hors rois et pions) : sert a detecter la finale. */
export function pieceCountWithoutPawns(chess: Chess): number {
  let n = 0;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type !== 'k' && cell.type !== 'p') n += 1;
    }
  }
  return n;
}

/** true si la position ressemble a une finale (peu de materiel). */
export function isEndgame(chess: Chess): boolean {
  return pieceCountWithoutPawns(chess) <= 6;
}

/** Pions passes de la couleur donnee. */
export function passedPawns(chess: Chess, color: Color): Square[] {
  const enemyPawns = piecesOf(chess, opposite(color)).filter((p) => p.type === 'p');
  const out: Square[] = [];
  for (const pawn of piecesOf(chess, color).filter((p) => p.type === 'p')) {
    const coords = toCoords(pawn.square);
    if (!coords) continue;
    const [file, rank] = coords;
    const blocked = enemyPawns.some((enemyPawn) => {
      const ec = toCoords(enemyPawn.square);
      if (!ec) return false;
      if (Math.abs(ec[0] - file) > 1) return false;
      return color === 'w' ? ec[1] > rank : ec[1] < rank;
    });
    if (!blocked) out.push(pawn.square);
  }
  return out;
}

/**
 * Pions passes qui meritent d'etre signales.
 *
 * Quand l'adversaire n'a plus aucun pion, « pion passe » ne distingue plus
 * rien : tous le sont. On ne retient alors que les pions ayant franchi la
 * moitie de l'echiquier, seuls reellement dangereux.
 */
export function notablePassedPawns(chess: Chess, color: Color): Square[] {
  const enemyHasPawns = piecesOf(chess, opposite(color)).some((p) => p.type === 'p');
  return passedPawns(chess, color).filter((square) => {
    if (enemyHasPawns) return true;
    const rank = Number(square[1]);
    return color === 'w' ? rank >= 4 : rank <= 5;
  });
}

/** Tours placees sur une colonne ouverte (sans pion allie). */
export function rooksOnOpenFiles(chess: Chess, color: Color): Square[] {
  const ownPawns = piecesOf(chess, color).filter((p) => p.type === 'p');
  return piecesOf(chess, color)
    .filter((p) => p.type === 'r')
    .filter((rook) => !ownPawns.some((pawn) => pawn.square[0] === rook.square[0]))
    .map((r) => r.square);
}

/** Pions doubles de la couleur donnee (colonnes concernees). */
export function doubledPawnFiles(chess: Chess, color: Color): string[] {
  const counts = new Map<string, number>();
  for (const pawn of piecesOf(chess, color).filter((p) => p.type === 'p')) {
    counts.set(pawn.square[0], (counts.get(pawn.square[0]) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([file]) => file);
}

/* ------------------------------------------------------------------ */
/* Primitives de lecture de position (tableau de bord)                 */
/* ------------------------------------------------------------------ */

/** Colonnes de l'echiquier, dans l'ordre. */
export const FILE_LETTERS = FILES;

/** Coordonnees [colonne, rangee] d'une case, ou null si la case est invalide. */
export function squareCoords(square: Square): [number, number] | null {
  return toCoords(square);
}

/** Case correspondant a des coordonnees [colonne, rangee], ou null. */
export function squareName(file: number, rank: number): Square | null {
  return toSquare(file, rank);
}

/** Colonnes occupees par au moins un pion de la couleur. */
function pawnFiles(chess: Chess, color: Color): string[] {
  return piecesOf(chess, color)
    .filter((p) => p.type === 'p')
    .map((p) => p.square[0]);
}

/** Colonnes sans aucun pion de la couleur (semi-ouvertes pour elle). */
export function semiOpenFiles(chess: Chess, color: Color): string[] {
  const own = new Set(pawnFiles(chess, color));
  return [...FILES].filter((f) => !own.has(f));
}

/** Colonnes sans aucun pion, des deux couleurs. */
export function openFiles(chess: Chess): string[] {
  const white = new Set(pawnFiles(chess, 'w'));
  const black = new Set(pawnFiles(chess, 'b'));
  return [...FILES].filter((f) => !white.has(f) && !black.has(f));
}

/** Pions isoles : aucun pion allie sur les colonnes adjacentes. */
export function isolatedPawns(chess: Chess, color: Color): Square[] {
  const files = new Set(pawnFiles(chess, color));
  return piecesOf(chess, color)
    .filter((p) => p.type === 'p')
    .filter((p) => {
      const index = FILES.indexOf(p.square[0]);
      const left = FILES[index - 1];
      const right = FILES[index + 1];
      return !(left && files.has(left)) && !(right && files.has(right));
    })
    .map((p) => p.square);
}

/** Nombre d'ilots de pions (groupes de colonnes contigues). */
export function pawnIslands(chess: Chess, color: Color): number {
  const used = [...new Set(pawnFiles(chess, color))]
    .map((f) => FILES.indexOf(f))
    .sort((a, b) => a - b);
  let islands = 0;
  for (let i = 0; i < used.length; i += 1) {
    if (i === 0 || used[i] !== used[i - 1] + 1) islands += 1;
  }
  return islands;
}

/**
 * Pions arrieres, avec une detection volontairement conservatrice :
 * aucun pion allie adjacent a sa hauteur ou derriere, case d'avance
 * controlee par un pion adverse, et pion non passe.
 */
export function backwardPawns(chess: Chess, color: Color): Square[] {
  const own = piecesOf(chess, color).filter((p) => p.type === 'p');
  const enemyPawns = piecesOf(chess, opposite(color)).filter((p) => p.type === 'p');
  const passed = new Set(passedPawns(chess, color));
  const forward = color === 'w' ? 1 : -1;
  const out: Square[] = [];

  for (const pawn of own) {
    if (passed.has(pawn.square)) continue;
    const coords = toCoords(pawn.square);
    if (!coords) continue;
    const [file, rank] = coords;

    const supported = own.some((other) => {
      const c = toCoords(other.square);
      if (!c || other.square === pawn.square) return false;
      if (Math.abs(c[0] - file) !== 1) return false;
      return color === 'w' ? c[1] <= rank : c[1] >= rank;
    });
    if (supported) continue;

    const ahead = toSquare(file, rank + forward);
    if (!ahead) continue;
    const aheadCoords = toCoords(ahead);
    if (!aheadCoords) continue;
    const controlledByPawn = enemyPawns.some((enemy) => {
      const c = toCoords(enemy.square);
      if (!c) return false;
      return Math.abs(c[0] - aheadCoords[0]) === 1 && c[1] - aheadCoords[1] === forward;
    });
    if (controlledByPawn) out.push(pawn.square);
  }
  return out;
}

/** Case du roi de la couleur, ou null. */
export function findKing(chess: Chess, color: Color): Square | null {
  return piecesOf(chess, color).find((p) => p.type === 'k')?.square ?? null;
}

/** Case du roi et les huit cases qui l'entourent. */
export function kingZone(chess: Chess, color: Color): Square[] {
  const king = findKing(chess, color);
  const coords = king ? toCoords(king) : null;
  if (!king || !coords) return [];
  const out: Square[] = [king];
  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (df === 0 && dr === 0) continue;
      const sq = toSquare(coords[0] + df, coords[1] + dr);
      if (sq) out.push(sq);
    }
  }
  return out;
}

/** Nombre de pieces adverses distinctes attaquant la zone du roi. */
export function kingZoneAttackers(chess: Chess, color: Color): number {
  const enemy = opposite(color);
  const attackers = new Set<string>();
  for (const square of kingZone(chess, color)) {
    for (const attacker of chess.attackers(square as never, enemy)) {
      attackers.add(attacker);
    }
  }
  return attackers.size;
}

/** Nombre de pions alliees devant le roi (bouclier), au maximum 3. */
export function pawnShield(chess: Chess, color: Color): number {
  const king = findKing(chess, color);
  const coords = king ? toCoords(king) : null;
  if (!king || !coords) return 0;
  const forward = color === 'w' ? 1 : -1;
  let count = 0;
  for (let df = -1; df <= 1; df += 1) {
    for (let step = 1; step <= 2; step += 1) {
      const sq = toSquare(coords[0] + df, coords[1] + forward * step);
      if (!sq) continue;
      const piece = chess.get(sq as never);
      if (piece && piece.type === 'p' && piece.color === color) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

/** Colonnes ouvertes ou semi-ouvertes (pour l'adversaire) autour du roi. */
export function openFilesNearKing(chess: Chess, color: Color): string[] {
  const king = findKing(chess, color);
  const coords = king ? toCoords(king) : null;
  if (!king || !coords) return [];
  const own = new Set(pawnFiles(chess, color));
  const out: string[] = [];
  for (let df = -1; df <= 1; df += 1) {
    const file = FILES[coords[0] + df];
    if (file && !own.has(file)) out.push(file);
  }
  return out;
}

/** Position identique, mais avec le trait donne a `color`. */
function withTurn(chess: Chess, color: Color): Chess | null {
  if (chess.turn() === color) return chess;
  return safeFen(fenWithTurn(chess.fen(), color));
}

/** Nombre de coups legaux dont dispose la couleur (trait force). */
export function mobility(chess: Chess, color: Color): number {
  const probe = withTurn(chess, color);
  return probe ? legalMoves(probe).length : 0;
}

/** Nombre de coups legaux de la piece placee sur `square`. */
export function pieceMobility(chess: Chess, square: Square): number {
  const piece = chess.get(square as never);
  if (!piece) return 0;
  return mobilityByPiece(chess, piece.color).get(square) ?? 0;
}

/**
 * Mobilite de chaque piece d'une couleur, en une seule generation de coups.
 * Les pieces sans coup legal apparaissent avec la valeur 0.
 */
export function mobilityByPiece(chess: Chess, color: Color): Map<Square, number> {
  const counts = new Map<Square, number>();
  for (const p of piecesOf(chess, color)) counts.set(p.square, 0);
  const probe = withTurn(chess, color);
  if (!probe) return counts;
  for (const move of legalMoves(probe)) {
    counts.set(move.from, (counts.get(move.from) ?? 0) + 1);
  }
  return counts;
}

/** Echecs immediats dont dispose `color` (trait force). */
export function immediateChecks(chess: Chess, color: Color): Move[] {
  const probe = withTurn(chess, color);
  if (!probe) return [];
  return legalMoves(probe).filter((m) => m.san.includes('+') || m.san.includes('#'));
}

/** Coups de mat en un disponibles pour `color` (trait force). */
export function mateInOneMoves(chess: Chess, color: Color): Move[] {
  const probe = withTurn(chess, color);
  if (!probe) return [];
  return legalMoves(probe).filter((m) => m.san.endsWith('#'));
}

/** true si les deux tours de la couleur se defendent mutuellement. */
export function rooksConnected(chess: Chess, color: Color): boolean {
  const rooks = piecesOf(chess, color).filter((p) => p.type === 'r');
  if (rooks.length < 2) return false;
  return chess.attackers(rooks[0].square as never, color).includes(rooks[1].square as never);
}

/** Nombre d'attaquants et de defenseurs d'une case occupee. */
export function attackDefendCount(
  chess: Chess,
  square: Square,
): { attackers: number; defenders: number; attackerSquares: Square[] } {
  const piece = chess.get(square as never);
  if (!piece) return { attackers: 0, defenders: 0, attackerSquares: [] };
  const attackerSquares = chess.attackers(square as never, opposite(piece.color)) as Square[];
  return {
    attackers: attackerSquares.length,
    defenders: chess.attackers(square as never, piece.color).length,
    attackerSquares,
  };
}

export interface KingSafetyContext {
  /** Desactive la penalite « roi au centre » : en finale, elle est fausse. */
  endgame: boolean;
}

/**
 * Heuristique de securite du roi, bornee approximativement entre -4 et +4.
 *
 * Elle ne pretend pas mesurer exactement la securite du roi : elle agrege des
 * faits verifiables (roque, bouclier de pions, colonnes ouvertes, attaquants,
 * echecs disponibles) pour produire une comparaison lisible entre les deux
 * camps.
 */
export function kingSafetyScore(chess: Chess, color: Color, context: KingSafetyContext): number {
  const king = findKing(chess, color);
  if (!king) return 0;

  let score = 0;

  // Une seule generation de coups sert aux echecs et au mat en un.
  const checks = immediateChecks(chess, opposite(color));
  score -= Math.min(3, checks.length) * 0.25;
  if (checks.some((m) => m.san.endsWith('#'))) score -= 3;
  score -= Math.min(6, kingZoneAttackers(chess, color)) * 0.35;

  // En finale, roque, bouclier de pions et colonnes ouvertes ne veulent plus
  // rien dire : un roi central y est fort, pas fragile. Seules les menaces
  // reellement calculables sont conservees.
  if (context.endgame) return score;

  const castledSquares =
    color === 'w' ? ['a1', 'b1', 'c1', 'g1', 'h1'] : ['a8', 'b8', 'c8', 'g8', 'h8'];
  const homeRank = color === 'w' ? '1' : '8';
  const hasCastled = castledSquares.includes(king) && king[1] === homeRank;

  if (hasCastled) score += 1.5;
  else {
    const rights = chess.getCastlingRights(color);
    if (rights.k || rights.q) score += 0.5;
    if (king[0] === 'd' || king[0] === 'e') score -= 1.2;
  }

  score += Math.min(3, pawnShield(chess, color)) * 0.4;
  score -= Math.min(3, openFilesNearKing(chess, color).length) * 0.6;

  return score;
}
