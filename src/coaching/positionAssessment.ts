import { Chess } from 'chess.js';
import type {
  AnalysisResult,
  Color,
  Confidence,
  CriticalFeature,
  CriticalFeatureKind,
  GamePhase,
  PositionAssessment,
  PositionFactor,
  PositionFactorId,
  Square,
  SwingFactor,
} from '@/types';
import { fullmoveNumber, safeFen } from '@/chess/fen';
import { materialCount } from '@/chess/rules';
import { PIECE_VALUE, sanToFrench } from '@/chess/pieces';
import {
  attackDefendCount,
  detectFork,
  developmentInfo,
  doubledPawnFiles,
  findKing,
  findPins,
  isolatedPawns,
  kingSafetyScore,
  kingZoneAttackers,
  materialBalance,
  mateInOneMoves,
  mobility,
  mobilityByPiece,
  openFiles,
  passedPawns,
  notablePassedPawns,
  pawnIslands,
  piecesOf,
  rooksConnected,
  soundCaptures,
  squareCoords,
  squareName,
  worstHangingPiece,
  type PieceOnBoard,
} from '@/chess/positionFeatures';
import { scoreToCp } from '@/engine/uci';
import { FACTOR_LABEL, POSITION_PHRASES } from './positionPhrases';

const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/** Priorites de la section « Ce qui compte maintenant » (cahier des charges). */
export const CRITICAL_PRIORITY: Record<CriticalFeatureKind, number> = {
  mate: 100,
  mate_threat: 96,
  piece_hanging: 92,
  forced_tactic: 88,
  opponent_threat: 84,
  material_gain: 80,
  king_safety: 72,
  development: 64,
  piece_activity: 56,
  center: 48,
  pawn_structure: 40,
  plan: 20,
};

/** Categories tactiques : elles ne doivent jamais etre masquees par du strategique. */
const TACTICAL_KINDS: ReadonlySet<CriticalFeatureKind> = new Set<CriticalFeatureKind>([
  'mate',
  'mate_threat',
  'piece_hanging',
  'forced_tactic',
  'opponent_threat',
  'material_gain',
]);

/** true si la categorie decrit une donnee tactique immediate. */
export function isTacticalKind(kind: CriticalFeatureKind): boolean {
  return TACTICAL_KINDS.has(kind);
}

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

/* ------------------------------------------------------------------ */
/* Phase de jeu                                                        */
/* ------------------------------------------------------------------ */

/**
 * Detection approximative de la phase.
 * Volontairement simple : elle sert uniquement a hierarchiser l'affichage.
 */
/**
 * Materiel restant, en centipions, en dessous duquel on parle de finale.
 * Une tour et un fou de chaque cote (1660) restent un milieu de jeu ; deux
 * tours seules (1000) sont une finale.
 */
export const ENDGAME_MATERIAL_CP = 1300;

export function detectPhase(chess: Chess): GamePhase {
  // Compter les pieces suffit mal : quatre tours ne sont pas une finale, une
  // dame seule contre un roi en est une. On raisonne donc sur le materiel.
  const remaining = materialCount(chess, 'w', PIECE_VALUE) + materialCount(chess, 'b', PIECE_VALUE);
  const pawnCp =
    piecesOf(chess, 'w')
      .concat(piecesOf(chess, 'b'))
      .filter((p) => p.type === 'p').length * PIECE_VALUE.p;
  if (remaining - pawnCp <= ENDGAME_MATERIAL_CP) return 'endgame';

  const move = fullmoveNumber(chess.fen());
  const undeveloped =
    developmentInfo(chess, 'w').undeveloped.length + developmentInfo(chess, 'b').undeveloped.length;
  // Sans piece mineure a developper, parler d'ouverture n'a aucun sens, meme au
  // premier coup : le conseil « termine ton developpement » serait absurde.
  if (undeveloped === 0) return 'middlegame';
  if (move <= 12 && undeveloped >= 3) return 'opening';
  if (move <= 8) return 'opening';
  return 'middlegame';
}

/** Jauges mises en avant selon la phase. */
export const PHASE_FOCUS: Record<GamePhase, PositionFactorId[]> = {
  opening: ['activity', 'center', 'king_safety'],
  middlegame: ['activity', 'king_safety', 'pawns'],
  endgame: ['activity', 'material', 'pawns'],
};

/* ------------------------------------------------------------------ */
/* Jauges                                                              */
/* ------------------------------------------------------------------ */

/** Score d'activite / developpement d'une couleur. */
export function activityScore(chess: Chess, color: Color, phase: GamePhase): number {
  const dev = developmentInfo(chess, color);
  const moves = mobility(chess, color);
  const perPiece = mobilityByPiece(chess, color);

  let score = moves * 0.05;

  if (phase === 'endgame') {
    // En finale, le roi est une piece : sa centralisation compte.
    const king = findKing(chess, color);
    const coords = king ? squareCoords(king) : null;
    if (coords) {
      const distance = Math.max(Math.abs(coords[0] - 3.5), Math.abs(coords[1] - 3.5));
      score += (3.5 - distance) * 0.35;
    }
  } else {
    score += dev.developedCount * 0.55;
    if (rooksConnected(chess, color)) score += 0.6;

    // Dame sortie trop tot, avant le developpement des pieces mineures.
    const queen = piecesOf(chess, color).find((p) => p.type === 'q');
    const queenHome = color === 'w' ? 'd1' : 'd8';
    if (
      queen &&
      queen.square !== queenHome &&
      fullmoveNumber(chess.fen()) <= 8 &&
      dev.undeveloped.length >= 3
    ) {
      score -= 0.8;
    }
  }

  // Pieces bloquees : une piece mineure ou une tour sans aucun coup legal.
  const blocked = piecesOf(chess, color).filter(
    (p) =>
      (p.type === 'n' || p.type === 'b' || p.type === 'r') && (perPiece.get(p.square) ?? 0) === 0,
  ).length;
  score -= blocked * 0.4;

  return score;
}

const CENTER_SQUARES: Square[] = ['d4', 'e4', 'd5', 'e5'];

/** Score de controle du centre et d'espace d'une couleur. */
export function centerScore(chess: Chess, color: Color): number {
  let score = 0;
  for (const square of CENTER_SQUARES) {
    score += Math.min(3, chess.attackers(square as never, color).length) * 0.3;
    const piece = chess.get(square as never);
    if (piece && piece.color === color) score += piece.type === 'p' ? 0.5 : 0.25;
  }
  // Espace : pions ayant franchi la moitie de l'echiquier.
  const advanced = piecesOf(chess, color).filter((p) => {
    if (p.type !== 'p') return false;
    const rank = Number(p.square[1]);
    return color === 'w' ? rank >= 4 : rank <= 5;
  }).length;
  score += advanced * 0.15;
  return score;
}

/** Score de structure de pions d'une couleur (uniquement des faits fiables). */
export function pawnStructureScore(chess: Chess, color: Color): number {
  let score = 0;
  score -= doubledPawnFiles(chess, color).length * 0.5;
  score -= isolatedPawns(chess, color).length * 0.5;
  score -= Math.max(0, pawnIslands(chess, color) - 1) * 0.3;
  for (const square of passedPawns(chess, color)) {
    const rank = Number(square[1]);
    const advance = color === 'w' ? rank - 2 : 7 - rank;
    score += 0.6 + Math.max(0, advance) * 0.12;
  }
  return score;
}

/** Detail factuel affiche a cote de la jauge de materiel. */
function materialDetail(balanceCp: number): string | null {
  const pawns = Math.round(balanceCp / 100);
  if (pawns === 0) return null;
  return `${pawns > 0 ? '+' : '−'}${Math.abs(pawns)} ${pawns > 0 ? 'Blancs' : 'Noirs'}`;
}

/**
 * Construit les cinq jauges, toujours du point de vue des blancs :
 * -2 = avantage noirs, 0 = equilibre, +2 = avantage blancs.
 */
export function buildFactors(chess: Chess, phase: GamePhase): PositionFactor[] {
  const focus = PHASE_FOCUS[phase];
  const balance = materialBalance(chess, 'w');
  const endgame = phase === 'endgame';

  const kingSafety =
    kingSafetyScore(chess, 'w', { endgame }) - kingSafetyScore(chess, 'b', { endgame });
  const activity = activityScore(chess, 'w', phase) - activityScore(chess, 'b', phase);
  const center = centerScore(chess, 'w') - centerScore(chess, 'b');
  const pawns = pawnStructureScore(chess, 'w') - pawnStructureScore(chess, 'b');

  const factor = (
    id: PositionFactorId,
    value: number,
    detail: string | null = null,
  ): PositionFactor => ({
    id,
    label: FACTOR_LABEL[id],
    value: Number(clamp(value, -2, 2).toFixed(2)),
    highlighted: focus.includes(id),
    detail,
  });

  return [
    factor('material', balance / 300, materialDetail(balance)),
    factor('king_safety', kingSafety / 2),
    factor('activity', activity / 2.5),
    factor('center', center / 2),
    factor('pawns', pawns / 1.5),
  ];
}

/* ------------------------------------------------------------------ */
/* Ce qui compte maintenant                                            */
/* ------------------------------------------------------------------ */

function feature(
  kind: CriticalFeatureKind,
  text: string,
  squares: Square[],
  confidence: Confidence,
  options: { bonus?: number; fromEngine?: boolean } = {},
): CriticalFeature {
  return {
    kind,
    priority: CRITICAL_PRIORITY[kind] + (options.bonus ?? 0),
    text,
    squares,
    confidence,
    fromEngine: options.fromEngine ?? false,
  };
}

/** Piece la moins active de la couleur (hors roi et pions). */
export function leastActivePiece(
  chess: Chess,
  color: Color,
): { piece: PieceOnBoard; moves: number } | null {
  const counts = mobilityByPiece(chess, color);
  const candidates = piecesOf(chess, color).filter(
    (p) => p.type === 'n' || p.type === 'b' || p.type === 'r' || p.type === 'q',
  );
  if (candidates.length === 0) return null;
  let best: { piece: PieceOnBoard; moves: number } | null = null;
  for (const candidate of candidates) {
    const moves = counts.get(candidate.square) ?? 0;
    if (!best || moves < best.moves) best = { piece: candidate, moves };
  }
  return best;
}

/**
 * Cases fortes pour `color` dans le camp adverse : aucun pion adverse ne peut
 * plus les defendre, et la case est deja controlee par `color`.
 */
export function outpostSquares(chess: Chess, color: Color): Square[] {
  const enemy = other(color);
  const enemyPawns = piecesOf(chess, enemy).filter((p) => p.type === 'p');
  // Sans pion adverse, la notion de case forte n'a plus de sens : toutes le
  // seraient. On n'en parle donc pas.
  if (enemyPawns.length === 0) return [];
  const targetRank = color === 'w' ? 5 : 4;
  const out: Square[] = [];

  for (const file of ['c', 'd', 'e', 'f']) {
    const square = `${file}${targetRank}`;
    if (chess.get(square as never)) continue;
    if (chess.attackers(square as never, color).length === 0) continue;
    const coords = squareCoords(square);
    if (!coords) continue;
    const defendable = enemyPawns.some((pawn) => {
      const c = squareCoords(pawn.square);
      if (!c) return false;
      if (Math.abs(c[0] - coords[0]) !== 1) return false;
      // Le pion adverse doit pouvoir descendre jusqu'a la case.
      return enemy === 'w' ? c[1] < coords[1] : c[1] > coords[1];
    });
    if (!defendable) out.push(square);
  }
  return out;
}

/** Ordre de preference des colonnes : les colonnes centrales comptent davantage. */
const FILE_PREFERENCE = ['d', 'e', 'c', 'f', 'b', 'g', 'a', 'h'];

/**
 * Colonne ouverte reellement exploitable pour `color` : elle doit exister sur
 * un echiquier encore garni de pions (sinon « colonne ouverte » ne veut plus
 * rien dire), et n'etre occupee par aucune de ses tours.
 */
export function usefulOpenFile(chess: Chess, color: Color): string | null {
  const pawns = piecesOf(chess, 'w')
    .concat(piecesOf(chess, 'b'))
    .filter((p) => p.type === 'p');
  if (pawns.length < 6) return null;
  const myRooks = piecesOf(chess, color).filter((p) => p.type === 'r');
  if (myRooks.length === 0) return null;
  const open = openFiles(chess);
  return (
    FILE_PREFERENCE.find(
      (file) => open.includes(file) && !myRooks.some((r) => r.square[0] === file),
    ) ?? null
  );
}

/**
 * Camp disposant d'un mat force, deduit du mat en un local ou du score du
 * moteur. Sert au plan, qui ne doit jamais conseiller autre chose dans ce cas.
 */
export function forcedMateSide(chess: Chess, analysis: AnalysisResult | null): Color | null {
  const turn = chess.turn();
  if (mateInOneMoves(chess, turn).length > 0) return turn;
  const mate = analysis?.lines[0]?.score.mate ?? null;
  if (mate === null || mate === 0) return null;
  return mate > 0 ? turn : other(turn);
}

/** Toutes les informations candidates, triees par priorite decroissante. */
export function criticalFeatures(
  chess: Chess,
  perspective: Color,
  phase: GamePhase,
  analysis: AnalysisResult | null,
): CriticalFeature[] {
  const foe = other(perspective);
  const myTurn = chess.turn() === perspective;
  const out: CriticalFeature[] = [];
  const claimedSquares = new Set<Square>();

  /* --- 1. Mat et menaces de mat --------------------------------------- */
  const myMates = myTurn ? mateInOneMoves(chess, perspective) : [];
  if (myMates.length > 0) {
    out.push(
      feature(
        'mate',
        POSITION_PHRASES.mateAvailable(sanToFrench(myMates[0].san)),
        [myMates[0].to],
        'high',
      ),
    );
  }

  // Quand le joueur est lui-meme en echec, il repond d'abord : annoncer un mat
  // adverse a partir d'un trait inverse serait faux.
  const inCheck = myTurn && chess.isCheck();
  const foeMates = inCheck ? [] : mateInOneMoves(chess, foe);
  if (foeMates.length > 0 && myMates.length === 0) {
    out.push(
      feature(
        'mate_threat',
        POSITION_PHRASES.mateThreat(foe, sanToFrench(foeMates[0].san)),
        [foeMates[0].to],
        'high',
      ),
    );
  }

  if (inCheck) {
    const king = findKing(chess, perspective);
    out.push(
      feature('mate_threat', POSITION_PHRASES.inCheck(), king ? [king] : [], 'high', { bonus: -2 }),
    );
  }

  // Le moteur confirme un mat force plus long que le mat en un.
  const topLine = analysis?.lines[0];
  if (topLine && topLine.score.mate !== null && myMates.length === 0 && foeMates.length === 0) {
    const plies = Math.abs(topLine.score.mate);
    const winner = topLine.score.mate > 0 ? chess.turn() : other(chess.turn());
    if (plies > 0 && plies <= 6) {
      out.push(
        feature(
          winner === perspective ? 'mate' : 'mate_threat',
          POSITION_PHRASES.engineMateFor(winner, plies),
          [],
          'high',
          { bonus: -3, fromEngine: true },
        ),
      );
    }
  }

  /* --- 2. Pieces en prise --------------------------------------------- */
  const worstHanging = worstHangingPiece(chess, perspective);
  if (worstHanging) {
    const worst = worstHanging;
    const counts = attackDefendCount(chess, worst.square);
    claimedSquares.add(worst.square);
    out.push(
      feature(
        'piece_hanging',
        POSITION_PHRASES.pieceAttacked(
          worst.type,
          worst.square,
          counts.attackers,
          counts.defenders,
        ),
        [worst.square, ...counts.attackerSquares.slice(0, 2)],
        'high',
        { bonus: worst.type === 'p' ? -8 : 0 },
      ),
    );
  }

  /* --- 3. Tactiques forcees -------------------------------------------- */
  const pinnedOfMine = findPins(chess, foe)[0];
  if (pinnedOfMine) {
    const pinned = chess.get(pinnedOfMine.pinned as never);
    // Un pion cloue n'apprend rien : on ne signale que les pieces.
    if (pinned && pinned.color === perspective && PIECE_VALUE[pinned.type] >= 300) {
      out.push(
        feature(
          'forced_tactic',
          POSITION_PHRASES.tacticPinned(pinned.type, pinnedOfMine.pinned),
          [pinnedOfMine.pinned, pinnedOfMine.pinner],
          'high',
        ),
      );
    }
  }

  const myPin = findPins(chess, perspective)[0];
  if (myPin) {
    const pinned = chess.get(myPin.pinned as never);
    if (pinned && pinned.color === foe && PIECE_VALUE[pinned.type] >= 300) {
      out.push(
        feature(
          'forced_tactic',
          POSITION_PHRASES.tacticPin(pinned.type, myPin.pinned),
          [myPin.pinned, myPin.pinner],
          'high',
          { bonus: -4 },
        ),
      );
    }
  }

  for (const mine of piecesOf(chess, perspective)) {
    if (mine.type === 'k' || mine.type === 'p') continue;
    const fork = detectFork(chess, mine.square);
    if (fork) {
      out.push(
        feature(
          'forced_tactic',
          POSITION_PHRASES.tacticFork(mine.type, mine.square, fork.targets.length),
          [mine.square, ...fork.targets.slice(0, 2)],
          'high',
          { bonus: 2 },
        ),
      );
      break;
    }
  }

  /* --- 4. Menace adverse immediate ------------------------------------- */
  const foeCaptures = soundCaptures(chess, foe).filter((c) => !claimedSquares.has(c.to));
  if (foeCaptures.length > 0 && foeCaptures[0].gain >= 200) {
    const threat = foeCaptures[0];
    out.push(
      feature(
        'opponent_threat',
        POSITION_PHRASES.opponentThreat(foe, sanToFrench(threat.san)),
        [threat.to, threat.from],
        'high',
      ),
    );
  }

  /* --- 5. Gain materiel disponible ------------------------------------- */
  const myCaptures = soundCaptures(chess, perspective);
  if (myCaptures.length > 0 && myCaptures[0].gain >= 100) {
    const gain = myCaptures[0];
    out.push(
      feature(
        'material_gain',
        POSITION_PHRASES.materialGain(sanToFrench(gain.san), gain.captured),
        [gain.to],
        'high',
      ),
    );
  }

  /* --- 6. Securite du roi ----------------------------------------------- */
  if (phase !== 'endgame') {
    const myKing = findKing(chess, perspective);
    const dev = developmentInfo(chess, perspective);
    const pressure = kingZoneAttackers(chess, perspective);
    const move = fullmoveNumber(chess.fen());

    if (pressure >= 3) {
      out.push(
        feature(
          'king_safety',
          POSITION_PHRASES.kingUnderPressure(pressure),
          myKing ? [myKing] : [],
          'medium',
          { bonus: 4 },
        ),
      );
    } else if (!dev.hasCastled && dev.kingOnStart && (move >= 5 || dev.developedCount >= 3)) {
      const openNear = openFiles(chess).find((f) => f === 'd' || f === 'e') ?? null;
      out.push(
        feature(
          'king_safety',
          POSITION_PHRASES.kingInCenter(openNear),
          myKing ? [myKing] : [],
          'high',
        ),
      );
    }

    const foeKing = findKing(chess, foe);
    const foeSafety = kingSafetyScore(chess, foe, { endgame: false });
    if (foeKing && foeSafety <= -1 && kingZoneAttackers(chess, foe) >= 2) {
      out.push(
        feature(
          'king_safety',
          POSITION_PHRASES.enemyKingExposed(foe, foeKing),
          [foeKing],
          'medium',
          {
            bonus: -2,
          },
        ),
      );
    }
  }

  /* --- 7. Developpement -------------------------------------------------- */
  if (phase !== 'endgame') {
    const dev = developmentInfo(chess, perspective);
    if (dev.undeveloped.length >= 2) {
      out.push(
        feature(
          'development',
          POSITION_PHRASES.developmentLate(dev.undeveloped.length),
          dev.undeveloped.slice(0, 2).map((p) => p.square),
          'high',
        ),
      );
    }
  }

  /* --- 8. Activite d'une piece ------------------------------------------- */
  // En ouverture, une piece encore sur sa case de depart releve du developpement,
  // deja signale plus haut : inutile de la presenter comme « peu active ».
  const homeSquares =
    perspective === 'w'
      ? ['a1', 'b1', 'c1', 'd1', 'f1', 'g1', 'h1']
      : ['a8', 'b8', 'c8', 'd8', 'f8', 'g8', 'h8'];
  const worstPiece = leastActivePiece(chess, perspective);
  const worstIsAsleep =
    worstPiece !== null && phase === 'opening' && homeSquares.includes(worstPiece.piece.square);
  if (worstPiece && !worstIsAsleep && worstPiece.moves <= 2) {
    out.push(
      feature(
        'piece_activity',
        POSITION_PHRASES.inactivePiece(worstPiece.piece.type, worstPiece.piece.square),
        [worstPiece.piece.square],
        'high',
      ),
    );
  }

  /* --- 9. Centre ---------------------------------------------------------- */
  // Le controle du centre et les cases fortes n'ont plus de sens en finale.
  const centerGap = centerScore(chess, foe) - centerScore(chess, perspective);
  if (phase !== 'endgame' && centerGap >= 1) {
    out.push(
      feature('center', POSITION_PHRASES.centerLoss(foe), CENTER_SQUARES.slice(0, 3), 'medium'),
    );
  }
  const outposts = phase === 'endgame' ? [] : outpostSquares(chess, perspective);
  const knight = piecesOf(chess, perspective).find((p) => p.type === 'n');
  if (outposts.length > 0 && knight) {
    out.push(
      feature(
        'center',
        POSITION_PHRASES.weakSquare(outposts[0], 'n'),
        [outposts[0], knight.square],
        'medium',
        {
          bonus: -2,
        },
      ),
    );
  }

  const freeFile = usefulOpenFile(chess, perspective);
  if (freeFile) {
    out.push(
      feature('center', POSITION_PHRASES.openFileFree(freeFile), [], 'medium', { bonus: 2 }),
    );
  }

  /* --- 10. Structure de pions --------------------------------------------- */
  const foePassed = notablePassedPawns(chess, foe);
  if (foePassed.length > 0) {
    out.push(
      feature(
        'pawn_structure',
        POSITION_PHRASES.passedPawnTheirs(foe, foePassed[0]),
        [foePassed[0]],
        'high',
        {
          bonus: 16,
        },
      ),
    );
  }
  const myPassed = notablePassedPawns(chess, perspective);
  if (myPassed.length > 0) {
    out.push(
      feature(
        'pawn_structure',
        POSITION_PHRASES.passedPawnMine(myPassed[0]),
        [myPassed[0]],
        'high',
        {
          bonus: 12,
        },
      ),
    );
  }
  const isolated = isolatedPawns(chess, perspective);
  if (isolated.length > 0) {
    out.push(
      feature(
        'pawn_structure',
        POSITION_PHRASES.pawnWeakness(isolated[0]),
        [isolated[0]],
        'medium',
      ),
    );
  }

  /* --- 11. Plan positionnel ------------------------------------------------ */
  out.push(feature('plan', POSITION_PHRASES.quietPosition(), [], 'low'));

  return out.sort(
    (a, b) =>
      b.priority - a.priority || CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence],
  );
}

/**
 * Retient au plus trois elements : un principal, un deuxieme s'il est fiable,
 * un troisieme uniquement s'il est tactique et certain.
 *
 * Une information strategique ne peut jamais masquer une menace tactique :
 * des qu'un element tactique arrive en tete, seuls les elements tactiques
 * restent affiches.
 */
export function selectCritical(features: readonly CriticalFeature[]): CriticalFeature[] {
  if (features.length === 0) return [];
  const top = features[0];
  const pool = isTacticalKind(top.kind) ? features.filter((f) => isTacticalKind(f.kind)) : features;

  // Un mat, disponible ou subi, rend toute autre information inutile.
  if (top.kind === 'mate' || top.kind === 'mate_threat') return [top];

  const out: CriticalFeature[] = [pool[0]];
  const seenKinds = new Set<CriticalFeatureKind>([pool[0].kind]);
  const seenText = new Set<string>([pool[0].text]);

  for (const candidate of pool.slice(1)) {
    if (out.length >= 2) break;
    if (seenKinds.has(candidate.kind) || seenText.has(candidate.text)) continue;
    if (candidate.confidence === 'low') continue;
    out.push(candidate);
    seenKinds.add(candidate.kind);
    seenText.add(candidate.text);
  }

  for (const candidate of pool) {
    if (out.length >= 3) break;
    if (out.includes(candidate)) continue;
    if (candidate.confidence !== 'high' || !isTacticalKind(candidate.kind)) continue;
    if (seenKinds.has(candidate.kind) || seenText.has(candidate.text)) continue;
    out.push(candidate);
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Points de bascule                                                   */
/* ------------------------------------------------------------------ */

/**
 * Evenements pouvant faire basculer la partie.
 * Chaque element est adosse a une preuve : changement materiel calcule,
 * structure concrete, ou ecart mesure entre les lignes du moteur.
 */
export function swingFactors(
  chess: Chess,
  perspective: Color,
  analysis: AnalysisResult | null,
): SwingFactor[] {
  const foe = other(perspective);
  const myTurn = chess.turn() === perspective;
  const out: SwingFactor[] = [];
  const balance = materialBalance(chess, perspective);

  /* --- Perdre une piece deja attaquee ferait basculer le materiel ------ */
  const risky = worstHangingPiece(chess, perspective);
  if (risky && PIECE_VALUE[risky.type] >= 300) {
    const after = balance - PIECE_VALUE[risky.type];
    if (balance >= 0 && after <= -100) {
      out.push({
        text: POSITION_PHRASES.swingLosingPiece(risky.type, risky.square, foe),
        confidence: 'high',
        squares: [risky.square],
        fromEngine: false,
      });
    }
  }

  /* --- Gagner une piece disponible ferait basculer le materiel --------- */
  const prize = soundCaptures(chess, perspective)[0];
  if (prize && prize.gain >= 300 && balance <= 50 && balance + prize.gain >= 200) {
    const victim = chess.get(prize.to as never);
    if (victim) {
      out.push({
        text: POSITION_PHRASES.swingWinningPiece(victim.type, prize.to),
        confidence: 'high',
        squares: [prize.to],
        fromEngine: false,
      });
    }
  }

  /* --- Le moteur ne voit qu'un seul bon coup ---------------------------- */
  // L'ecart MultiPV ne parle que du camp au trait : l'annoncer quand c'est a
  // l'adversaire de jouer serait faux. Un mat deja annonce rend l'info inutile.
  const lines = analysis?.lines ?? [];
  const topIsMate = lines[0]?.score.mate !== null && lines[0] !== undefined;
  if (
    myTurn &&
    !topIsMate &&
    lines.length >= 2 &&
    lines[0].pv.length > 0 &&
    lines[1].pv.length > 0
  ) {
    const gap = scoreToCp(lines[0].score) - scoreToCp(lines[1].score);
    if (gap >= 200) {
      out.push({
        text: POSITION_PHRASES.swingOnlyMove(),
        confidence: 'high',
        squares: [],
        fromEngine: true,
      });
    }
  }

  /* --- Un pion passe avance ------------------------------------------- */
  const passedCandidates: Array<{ square: Square; color: Color }> = [
    ...notablePassedPawns(chess, perspective).map((square) => ({ square, color: perspective })),
    ...notablePassedPawns(chess, foe).map((square) => ({ square, color: foe })),
  ];
  const dangerous = passedCandidates.find(({ square, color }) => {
    const rank = Number(square[1]);
    return color === 'w' ? rank >= 5 : rank <= 4;
  });
  if (dangerous) {
    const coords = squareCoords(dangerous.square);
    const next = coords
      ? squareName(coords[0], coords[1] + (dangerous.color === 'w' ? 1 : -1))
      : null;
    if (next) {
      out.push({
        text: POSITION_PHRASES.swingPassedPawn(dangerous.square, next),
        confidence: 'high',
        squares: [dangerous.square, next],
        fromEngine: false,
      });
    }
  }

  return out
    .filter((s) => s.confidence !== 'low')
    .sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence])
    .slice(0, 2);
}

/* ------------------------------------------------------------------ */
/* Assemblage                                                          */
/* ------------------------------------------------------------------ */

export interface AssessmentInput {
  fen: string;
  /** Couleur du joueur : tous les textes sont ecrits de son point de vue. */
  perspective: Color;
  /** Analyse moteur de CETTE position, ou null si elle n'est pas encore la. */
  analysis: AnalysisResult | null;
}

/**
 * Lecture complete de la position.
 *
 * Aucune donnee du moteur n'est indispensable : le tableau s'affiche
 * immediatement a partir des seules fonctions deterministes locales, puis se
 * complete lorsque l'analyse arrive.
 */
export function assessPosition(input: AssessmentInput): PositionAssessment | null {
  const chess = safeFen(input.fen);
  if (!chess) return null;

  const analysis = input.analysis && input.analysis.fen === input.fen ? input.analysis : null;
  const phase = detectPhase(chess);

  return {
    fen: input.fen,
    phase,
    perspective: input.perspective,
    factors: buildFactors(chess, phase),
    critical: selectCritical(criticalFeatures(chess, input.perspective, phase, analysis)),
    swings: swingFactors(chess, input.perspective, analysis),
    engineBacked: analysis !== null,
    forcedMate: forcedMateSide(chess, analysis),
  };
}
