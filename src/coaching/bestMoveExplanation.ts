import { Chess } from 'chess.js';
import type { AnalysisResult, BestMoveExplanation, Color, Confidence, Square } from '@/types';
import type { Move } from '@/chess/rules';
import { legalMoves, uciToMove } from '@/chess/rules';
import { fenWithTurn, safeFen } from '@/chess/fen';
import { PIECE_VALUE, sanToFrench } from '@/chess/pieces';
import {
  detectFork,
  findPins,
  freeCaptures,
  isEnPrise,
  findKing,
  kingZoneAttackers,
  mateInOneMoves,
  notablePassedPawns,
  kingSafetyScore,
  openFiles,
  passedPawns,
  pieceMobility,
  squareCoords as coordsOf,
  piecesOf,
  squareCoords,
  squareName,
} from '@/chess/positionFeatures';
import { scoreToCp } from '@/engine/uci';
import { MAX_EXPLANATION_CHARS, formatSentences } from './format';
import { POSITION_PHRASES, capitalize, composeMoveSentence } from './positionPhrases';
import { detectPhase } from './positionAssessment';

const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

/**
 * Ecart, en centipions, en dessous duquel deux coups sont presentes comme
 * pratiquement equivalents. Le seuil est un peu plus large dans les positions
 * desequilibrees, ou quelques centipions ne signifient plus grand-chose.
 */
export function equivalenceThreshold(bestCp: number): number {
  return Math.abs(bestCp) < 150 ? 25 : 35;
}

const CENTER_SQUARES: Square[] = ['d4', 'e4', 'd5', 'e5'];

/** Une raison detectee, avec sa confiance et son poids d'affichage. */
interface Reason {
  text: string;
  weight: number;
  confidence: Confidence;
}

export interface ExplainInput {
  fen: string;
  /** Analyse de CETTE position ; sert a confirmer les consequences concretes. */
  analysis: AnalysisResult | null;
  /** Coup a expliquer ; par defaut le meilleur coup de l'analyse. */
  uci?: string;
}

/**
 * Explique un coup a partir de faits verifiables : comparaison de la position
 * avant et apres, puis confirmation par la variante principale du moteur.
 *
 * Aucune consequence n'est affirmee si elle n'a pas ete rejouee et verifiee sur
 * l'echiquier. Faute de raison identifiee, l'explication reste factuelle
 * (« developpe ton cavalier et controle d5 ») plutot qu'inventee.
 */
export function explainBestMove(input: ExplainInput): BestMoveExplanation | null {
  const before = safeFen(input.fen);
  if (!before) return null;

  const uci = input.uci ?? input.analysis?.bestMove ?? input.analysis?.lines[0]?.pv[0] ?? null;
  if (!uci) return null;

  const move = uciToMove(input.fen, uci);
  if (!move) return null;

  const after = safeFen(move.after);
  if (!after) return null;

  const me = move.color;
  const foe = other(me);
  const reasons = collectReasons({ before, after, move, me, foe, analysis: input.analysis });

  const consequence = pvConsequence(input.fen, input.analysis, me);
  const first = composeMoveSentence(reasons.slice(0, 2).map((r) => r.text));
  const second = consequence ?? (reasons[2] ? capitalize(`${reasons[2].text}.`) : null);

  const text = formatSentences(second ? [first, second] : [first], MAX_EXPLANATION_CHARS);
  // La confiance suit la nature de la raison principale : un mat, une prise ou
  // une parade sont verifiables coup en main ; un benefice positionnel ne l'est
  // qu'a moitie ; le repli ne l'est pas du tout.
  const top = reasons[0];
  const confidence: Confidence =
    top === undefined || top.weight <= 10
      ? 'low'
      : top.weight >= 70 && top.confidence === 'high'
        ? 'high'
        : 'medium';

  return {
    uci,
    san: sanToFrench(move.san),
    from: move.from,
    to: move.to,
    text,
    confidence,
    alternatives: nearlyEqualMoves(input.fen, input.analysis, uci),
  };
}

interface ReasonContext {
  before: Chess;
  after: Chess;
  move: Move;
  me: Color;
  foe: Color;
  analysis: AnalysisResult | null;
}

/**
 * Rassemble toutes les raisons detectees, triees par importance.
 * L'ordre suit celui du cahier des charges : d'abord le mat, la tactique et le
 * materiel, ensuite seulement les benefices positionnels.
 */
export function collectReasons(context: ReasonContext): Reason[] {
  const { before, after, move, me, foe } = context;
  const out: Reason[] = [];
  const add = (text: string, weight: number, confidence: Confidence = 'high'): void => {
    out.push({ text, weight, confidence });
  };

  /* --- Mat -------------------------------------------------------------- */
  if (after.isCheckmate()) {
    add(POSITION_PHRASES.moveMate(), 100);
    return out.sort((a, b) => b.weight - a.weight);
  }

  // Le score du moteur est donne du point de vue du trait, donc du camp qui joue
  // ce coup : un mat positif est bien un mat en notre faveur.
  const mateIn = context.analysis?.lines[0]?.score.mate ?? null;
  if (mateIn !== null && mateIn > 0) add(POSITION_PHRASES.moveForcedMate(mateIn), 96);

  /* --- Echec ------------------------------------------------------------ */
  if (after.isCheck()) add(POSITION_PHRASES.moveCheck(), 84);

  /* --- Materiel : gain net, echange ou sacrifice -------------------------- */
  const gained = move.captured ? PIECE_VALUE[move.captured] : 0;
  const risked = PIECE_VALUE[move.piece];
  const exposed = isEnPrise(after, move.to);
  const defendedByFoe = after.attackers(move.to as never, foe).length > 0;

  if (move.captured) {
    if (!exposed && !defendedByFoe) add(POSITION_PHRASES.moveWinsPiece(move.captured), 92);
    else if (!exposed) {
      // La case est defendue mais la reprise n'est pas rentable pour l'adversaire :
      // annoncer un gain serait exagere, c'est une prise que l'on peut soutenir.
      add(
        gained >= risked
          ? POSITION_PHRASES.moveWinsPiece(move.captured)
          : POSITION_PHRASES.moveTrades(move.captured),
        gained >= risked ? 92 : 74,
      );
    } else if (gained >= risked) add(POSITION_PHRASES.moveFavourableTrade(move.captured), 76);
  }

  // Un sacrifice doit etre nomme : sans cela, « met le roi en echec » decrit un
  // don de piece comme un coup ordinaire.
  if (exposed && risked - gained >= 200 && move.piece !== 'p') {
    const opensKing = kingZoneAttackers(after, foe) >= 2;
    add(
      opensKing
        ? POSITION_PHRASES.moveSacrificesForAttack(move.piece)
        : POSITION_PHRASES.moveSacrifices(move.piece),
      95,
    );
  }

  /* --- Piece sauvee ------------------------------------------------------ */
  if (!move.captured && isEnPrise(before, move.from) && !isEnPrise(after, move.to)) {
    add(POSITION_PHRASES.moveSavesPiece(move.piece), 90);
  }

  /* --- Echec subi et menace de mat ---------------------------------------- */
  if (before.isCheck()) add(POSITION_PHRASES.moveEscapesCheck(), 85);

  // Le trait force n'a de sens que si l'on n'est pas soi-meme en echec :
  // sinon la position de sondage serait illegale et la menace, imaginaire.
  const mateBefore = before.isCheck() ? undefined : mateInOneMoves(before, foe)[0];
  if (mateBefore && mateInOneMoves(after, foe).length === 0) {
    add(POSITION_PHRASES.moveStopsMate(sanToFrench(mateBefore.san)), 93);
  }

  /* --- Menace adverse paree ---------------------------------------------- */
  const threatBefore = freeCaptures(before, foe)[0];
  if (threatBefore && threatBefore.gain >= 200) {
    const stillThere = freeCaptures(after, foe).some(
      (c) => c.to === threatBefore.to && c.gain >= 200,
    );
    if (!stillThere) add(POSITION_PHRASES.moveParriesThreat(sanToFrench(threatBefore.san)), 88);
  }

  /* --- Fourchette, clouage, double attaque, deviation --------------------- */
  const fork = detectFork(after, move.to);
  if (fork) add(POSITION_PHRASES.moveFork(fork.targets.length), 86);

  const pin = findPins(after, me).find((p) => p.pinner === move.to);
  if (pin) {
    const pinned = after.get(pin.pinned as never);
    // Un pion cloue n'a aucune valeur pedagogique : on ne cite que les pieces.
    if (pinned && PIECE_VALUE[pinned.type] >= 300) {
      add(POSITION_PHRASES.movePins(pinned.type, pin.pinned), 82);
    }
  }

  const attackedNow = piecesOf(after, foe).filter((p) =>
    after.attackers(p.square as never, me).includes(move.to as never),
  );
  if (!fork && attackedNow.length >= 2) add(POSITION_PHRASES.moveDoubleAttack(), 80);
  else if (!fork && attackedNow.length === 1) {
    const target = attackedNow[0];
    if (target.type !== 'k' && PIECE_VALUE[target.type] >= PIECE_VALUE[move.piece]) {
      add(POSITION_PHRASES.moveAttacks(target.type, target.square), 66);
    }
  }

  const deflected = deflectionTarget(after, move.to, me, foe);
  if (deflected) add(POSITION_PHRASES.moveDeflects(deflected), 78);

  /* --- Roi ---------------------------------------------------------------- */
  if (move.flags.includes('k') || move.flags.includes('q')) {
    add(POSITION_PHRASES.moveCastles(), 74);
  } else if (preparesCastling(before, after, me)) {
    add(POSITION_PHRASES.movePreparesCastle(), 52, 'medium');
  }

  /* --- Pions passes --------------------------------------------------------- */
  if (move.promotion) add(POSITION_PHRASES.movePromotes(), 94);
  // Un pion deja passe qui avance ne « cree » pas un pion passe : on compare
  // les colonnes concernees, pas les cases, sinon toute poussee compterait.
  const passedFilesBefore = new Set(passedPawns(before, me).map((sq) => sq[0]));
  const passedAfter = passedPawns(after, me);
  if (!move.promotion) {
    const created = passedAfter.find((sq) => !passedFilesBefore.has(sq[0]));
    if (created) add(POSITION_PHRASES.moveCreatesPassed(), 70);
    else if (move.piece === 'p' && passedAfter.includes(move.to)) {
      add(POSITION_PHRASES.movePushesPassed(move.to), 70);
    }
  }

  const foePassed = passedPawns(after, foe);
  const stopped = foePassed.find((square) => {
    const coords = squareCoords(square);
    const next = coords ? squareName(coords[0], coords[1] + (foe === 'w' ? 1 : -1)) : null;
    return next !== null && after.attackers(next as never, me).includes(move.to as never);
  });
  if (stopped) add(POSITION_PHRASES.moveStopsPassed(stopped), 68);

  /* --- Developpement et activite -------------------------------------------- */
  const startMinors = me === 'w' ? ['b1', 'g1', 'c1', 'f1'] : ['b8', 'g8', 'c8', 'f8'];
  const developing = (move.piece === 'n' || move.piece === 'b') && startMinors.includes(move.from);
  if (developing) add(POSITION_PHRASES.moveDevelops(move.piece), 62);

  if (move.piece === 'r' && openFiles(after).includes(move.to[0])) {
    add(POSITION_PHRASES.moveRookOpenFile(move.to[0]), 60);
  }

  const controlled = CENTER_SQUARES.filter(
    (square) =>
      square !== move.to && after.attackers(square as never, me).includes(move.to as never),
  );
  if (move.piece === 'p' && !move.captured && CENTER_SQUARES.includes(move.to)) {
    add(POSITION_PHRASES.moveOccupiesCenter(move.to), 58);
  } else if (controlled.length > 0) {
    add(POSITION_PHRASES.moveControls(controlled.slice(0, 2)), 56);
  }

  if (!developing && move.piece !== 'p' && move.piece !== 'k') {
    const gain = pieceMobility(after, move.to) - pieceMobility(before, move.from);
    if (gain >= 3) add(POSITION_PHRASES.moveActivates(move.piece, move.from, move.to), 50);
  }

  // Une case de fuite : fait verifiable et decisif pour un joueur qui se fait
  // mater sur la derniere rangee.
  if (givesLuft(before, after, me)) add(POSITION_PHRASES.moveGivesLuft(), 64);

  // En finale, un roi qui se rapproche du pion passe fait un vrai progres.
  const approached = kingApproachedPassedPawn(before, after, move, me, foe);
  if (approached) add(POSITION_PHRASES.moveApproachesPawn(approached), 58);

  const phase = detectPhase(after);
  const safetyGain =
    kingSafetyScore(after, me, { endgame: phase === 'endgame' }) -
    kingSafetyScore(before, me, { endgame: phase === 'endgame' });
  if (safetyGain >= 0.6 && !move.flags.includes('k') && !move.flags.includes('q')) {
    add(POSITION_PHRASES.moveImprovesKing(), 48, 'medium');
  }

  if (out.length === 0) {
    // Repli strictement factuel. « Active ta piece » etait faux la moitie du
    // temps (un roi qui va dans un coin n'est pas plus actif) : on se contente
    // de dire ce que l'on sait avec certitude, c'est-a-dire qu'il n'y a rien a
    // gagner tout de suite.
    add(POSITION_PHRASES.moveQuiet(), 10, 'medium');
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/** Cases ou le roi de `color` peut legalement aller. */
function kingDestinations(chess: Chess, color: Color): Square[] {
  const probe = chess.turn() === color ? chess : safeFen(fenWithTurn(chess.fen(), color));
  const king = probe ? findKing(probe, color) : null;
  if (!probe || !king) return [];
  return legalMoves(probe)
    .filter((m) => m.from === king)
    .map((m) => m.to);
}

/**
 * Le coup ouvre-t-il une case de fuite hors de la rangee de depart ?
 * C'est la parade concrete au mat de la derniere rangee.
 */
function givesLuft(before: Chess, after: Chess, color: Color): boolean {
  const homeRank = color === 'w' ? '1' : '8';
  const king = findKing(before, color);
  if (!king || king[1] !== homeRank) return false;
  // Un roi encore sur sa case de depart n'est pas menace de mat du couloir :
  // dire que 1.e4 « ouvre une case de fuite » serait ridicule.
  const startSquare = color === 'w' ? 'e1' : 'e8';
  if (king === startSquare) return false;
  // Et il faut une piece lourde adverse pour qu'un mat de la derniere rangee
  // soit seulement possible.
  const foe: Color = color === 'w' ? 'b' : 'w';
  if (!piecesOf(before, foe).some((p) => p.type === 'r' || p.type === 'q')) return false;
  const escaped = (chess: Chess): boolean =>
    kingDestinations(chess, color).some((square) => square[1] !== homeRank);
  return !escaped(before) && escaped(after);
}

/** Distance de roi (Chebyshev) entre deux cases. */
function kingDistance(from: Square, to: Square): number {
  const a = coordsOf(from);
  const b = coordsOf(to);
  if (!a || !b) return 99;
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

/**
 * Le roi se rapproche-t-il d'un pion passe (le sien ou celui d'en face) ?
 * En finale, c'est le progres le plus concret qu'un coup tranquille puisse
 * apporter, et il se verifie par un simple calcul de distance.
 */
function kingApproachedPassedPawn(
  before: Chess,
  after: Chess,
  move: Move,
  me: Color,
  foe: Color,
): Square | null {
  if (move.piece !== 'k') return null;
  const candidates = [...notablePassedPawns(after, foe), ...notablePassedPawns(after, me)];
  const from = findKing(before, me);
  const to = findKing(after, me);
  if (!from || !to) return null;
  for (const pawn of candidates) {
    if (kingDistance(to, pawn) < kingDistance(from, pawn)) return pawn;
  }
  return null;
}

/**
 * La piece arrivee sur `square` attaque-t-elle l'unique defenseur d'une piece
 * adverse ? C'est le seul cas de deviation detectable de facon fiable.
 */
function deflectionTarget(chess: Chess, square: Square, me: Color, foe: Color): Square | null {
  for (const target of piecesOf(chess, foe)) {
    if (target.type === 'k' || !isEnPrise(chess, target.square)) continue;
    const defenders = chess.attackers(target.square as never, foe);
    if (defenders.length !== 1) continue;
    if (!chess.attackers(defenders[0] as never, me).includes(square as never)) continue;
    return target.square;
  }

  for (const target of piecesOf(chess, foe)) {
    if (target.type === 'k' || target.type === 'p') continue;
    const defenders = chess.attackers(target.square as never, foe);
    const attackers = chess.attackers(target.square as never, me);
    if (defenders.length !== 1 || attackers.length === 0) continue;
    if (!chess.attackers(defenders[0] as never, me).includes(square as never)) continue;
    return target.square;
  }
  return null;
}

/** Le roque devient-il possible grace a ce coup ? */
function preparesCastling(before: Chess, after: Chess, color: Color): boolean {
  const canCastle = (chess: Chess): boolean => {
    const probe = chess.turn() === color ? chess : safeFen(fenWithTurn(chess.fen(), color));
    if (!probe) return false;
    return legalMoves(probe).some((m) => m.san === 'O-O' || m.san === 'O-O-O');
  };
  return !canCastle(before) && canCastle(after);
}

/**
 * Deuxieme phrase confirmee par la variante principale.
 *
 * On rejoue la reponse adverse puis le coup suivant, et on ne conserve la
 * phrase que si ce coup gagne reellement du materiel non repris.
 */
export function pvConsequence(
  fen: string,
  analysis: AnalysisResult | null,
  me: Color,
): string | null {
  const pv = analysis?.lines[0]?.pv ?? [];
  if (pv.length < 3) return null;

  const board = safeFen(fen);
  if (!board) return null;

  const applied: Move[] = [];
  for (const uci of pv.slice(0, 3)) {
    try {
      applied.push(
        board.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length > 4 ? uci[4] : undefined,
        }) as Move,
      );
    } catch {
      return null;
    }
  }

  const [, reply, follow] = applied;
  if (!reply || !follow || follow.color !== me || !follow.captured) return null;
  // Le gain n'est annonce que s'il tient : la piece ne doit pas etre reprise.
  if (isEnPrise(board, follow.to)) return null;

  return POSITION_PHRASES.movePvConsequence(
    sanToFrench(reply.san),
    sanToFrench(follow.san),
    follow.captured,
  );
}

/**
 * Autres coups pratiquement equivalents, tires de la MultiPV deja calculee.
 * Aucune analyse supplementaire n'est lancee.
 */
export function nearlyEqualMoves(
  fen: string,
  analysis: AnalysisResult | null,
  bestUci: string,
): string[] {
  const lines = analysis?.lines ?? [];
  const best = lines[0];
  if (!best || best.pv.length === 0) return [];

  const bestCp = scoreToCp(best.score);
  const threshold = equivalenceThreshold(bestCp);
  const out: string[] = [];

  for (const line of lines.slice(1)) {
    const uci = line.pv[0];
    if (!uci || uci === bestUci) continue;
    if (bestCp - scoreToCp(line.score) > threshold) continue;
    const move = uciToMove(fen, uci);
    if (move) out.push(sanToFrench(move.san));
  }
  return out.slice(0, 2);
}

/** Phrase decrivant les coups alternatifs, ou null s'il n'y en a pas. */
export function alternativesSentence(explanation: BestMoveExplanation): string | null {
  if (explanation.alternatives.length === 0) return null;
  return POSITION_PHRASES.moveAlternatives(explanation.san, explanation.alternatives);
}
