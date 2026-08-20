import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type {
  AnalysisResult,
  BookLookupResult,
  CoachFeedback,
  Color,
  EngineScore,
  GameEndReason,
  GameResult,
  GameSummary,
  MoveRecord,
  OpeningEntry,
  PieceType,
  Settings,
} from '@/types';
import type { Move } from '@/chess/rules';
import { START_FEN, endReason, kingSquare, legalMoves } from '@/chess/rules';
import { safeFen, sideToMove } from '@/chess/fen';
import { scoreToCp, scoreToWhitePov } from '@/engine/uci';
import {
  SPEED_PROFILES,
  bookPlyLimit,
  chooseEngineMove,
  resolveProfile,
  toEngineStrength,
} from '@/engine/difficulty';
import { FULL_STRENGTH, analyzePosition } from '@/engine/analysisService';
import { AnalysisCancelledError } from '@/engine/StockfishEngine';
import { getEngine } from '@/engine/engineInstance';
import { buildFeedback } from '@/coaching/coach';
import { getOpeningById, isInBook, lookupBook, pickAiOpening, pickBookMove } from '@/openings/book';
import { useLatest } from './useLatest';

export type GameMode = 'free' | 'opening';

export interface GameConfig {
  playerColor: Color;
  mode: GameMode;
  openingId: string | null;
}

export type GameStatus = 'idle' | 'playing' | 'over';

export interface GameEnd {
  result: GameResult;
  reason: GameEndReason;
  summary: GameSummary;
}

export interface GameController {
  fen: string;
  status: GameStatus;
  turn: Color;
  config: GameConfig | null;
  opening: OpeningEntry | null;
  moves: MoveRecord[];
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  feedback: CoachFeedback | null;
  evalScore: EngineScore | null;
  /**
   * Derniere analyse pleine force de la position affichee.
   * Elle est reutilisee telle quelle par le tableau de lecture de position :
   * aucune recherche supplementaire n'est lancee pour lui.
   */
  analysis: AnalysisResult | null;
  thinking: boolean;
  bookInfo: BookLookupResult | null;
  gameEnd: GameEnd | null;
  isPlayerTurn: boolean;
  canUndo: boolean;
  start: (config: GameConfig) => void;
  playMove: (from: string, to: string, promotion?: string) => boolean;
  undo: () => void;
  resign: () => void;
  offerDraw: () => void;
  reset: () => void;
}

/** Coup du joueur en attente d'analyse pedagogique. */
interface PendingCoach {
  fenBefore: string;
  move: Move;
  inBookBefore: boolean;
  suggestion: string | null;
  variationName: string | null;
}

const rng = (): number => Math.random();

/**
 * Controleur de partie : echiquier, IA, analyse pedagogique et fin de partie.
 *
 * Tout l'asynchrone est protege par un compteur d'epoque : une reponse tardive
 * du moteur ne peut jamais modifier une position plus recente. Les refs ne sont
 * lues que dans les gestionnaires d'evenements et les effets, jamais pendant le
 * rendu.
 */
export function useGameController(
  settings: Settings,
  onFinish?: (end: GameEnd) => void,
): GameController {
  const chessRef = useRef<Chess>(new Chess());
  const [fen, setFen] = useState<string>(START_FEN);
  const [status, setStatus] = useState<GameStatus>('idle');
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [feedback, setFeedback] = useState<CoachFeedback | null>(null);
  const [evalScore, setEvalScore] = useState<EngineScore | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [thinking, setThinking] = useState(false);
  const [bookInfo, setBookInfo] = useState<BookLookupResult | null>(null);
  const [gameEnd, setGameEnd] = useState<GameEnd | null>(null);

  const epochRef = useRef(0);
  const settingsRef = useLatest(settings);
  const onFinishRef = useLatest(onFinish);
  const configRef = useRef<GameConfig | null>(null);
  const openingRef = useRef<OpeningEntry | null>(null);
  const aiOpeningRef = useRef<OpeningEntry | null>(null);
  const pendingCoachRef = useRef<PendingCoach | null>(null);
  const previousAiMistakeRef = useRef(false);
  /** Source de verite synchrone de l'historique ; `moves` n'en est que le miroir. */
  const movesRef = useRef<MoveRecord[]>([]);

  const commitMoves = useCallback((next: MoveRecord[]): void => {
    movesRef.current = next;
    setMoves(next);
  }, []);

  const opening = useMemo(
    () => (config?.mode === 'opening' ? getOpeningById(config.openingId) : null),
    [config],
  );

  const turn = sideToMove(fen);
  const isPlayerTurn = status === 'playing' && config !== null && turn === config.playerColor;

  /* ---------------------------------------------------------------- */
  /* Demarrage et fin                                                  */
  /* ---------------------------------------------------------------- */

  const start = useCallback(
    (next: GameConfig): void => {
      epochRef.current += 1;
      chessRef.current = new Chess();
      pendingCoachRef.current = null;
      previousAiMistakeRef.current = false;
      configRef.current = next;
      openingRef.current = next.mode === 'opening' ? getOpeningById(next.openingId) : null;
      aiOpeningRef.current = openingRef.current ?? pickAiOpening(next.playerColor, rng);
      commitMoves([]);
      setConfig(next);
      setFeedback(null);
      setEvalScore(null);
      setAnalysis(null);
      setBookInfo(null);
      setGameEnd(null);
      setFen(chessRef.current.fen());
      setStatus('playing');
      void getEngine()
        .newGame()
        .catch(() => undefined);
    },
    [commitMoves],
  );

  const reset = useCallback((): void => {
    epochRef.current += 1;
    configRef.current = null;
    setStatus('idle');
    setConfig(null);
    setGameEnd(null);
    setThinking(false);
  }, []);

  const finish = useCallback(
    (result: GameResult, reason: GameEndReason): void => {
      epochRef.current += 1;
      setThinking(false);
      setStatus('over');
      const currentConfig = configRef.current;
      if (!currentConfig) return;
      const summary = buildSummary(
        movesRef.current,
        currentConfig,
        settingsRef.current,
        result,
        reason,
        openingRef.current,
      );
      const end: GameEnd = { result, reason, summary };
      setGameEnd(end);
      onFinishRef.current?.(end);
    },
    [settingsRef, onFinishRef],
  );

  /** Detecte une fin de partie naturelle apres un coup. */
  const checkEnd = useCallback(
    (mover: Color): boolean => {
      const reason = endReason(chessRef.current);
      if (!reason) return false;
      const playerColor = configRef.current?.playerColor ?? 'w';
      let result: GameResult = 'draw';
      if (reason === 'checkmate') result = mover === playerColor ? 'win' : 'loss';
      finish(result, reason);
      return true;
    },
    [finish],
  );

  /* ---------------------------------------------------------------- */
  /* Coups                                                             */
  /* ---------------------------------------------------------------- */

  const pushMove = useCallback(
    (move: Move): void => {
      commitMoves([
        ...movesRef.current,
        {
          san: move.san,
          uci: `${move.from}${move.to}${move.promotion ?? ''}`,
          fenBefore: move.before,
          fenAfter: move.after,
          color: move.color,
          feedback: null,
          evalAfterCp: null,
          mateAfter: null,
        },
      ]);
    },
    [commitMoves],
  );

  const playMove = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      const currentConfig = configRef.current;
      if (status !== 'playing' || !currentConfig) return false;
      const chess = chessRef.current;
      if (chess.turn() !== currentConfig.playerColor) return false;

      const fenBefore = chess.fen();
      const book = openingRef.current ? lookupBook(openingRef.current, fenBefore) : null;

      let move: Move;
      try {
        move = chess.move({ from, to, promotion });
      } catch {
        // Coup illegal : refus immediat, l'echiquier ne bouge pas.
        return false;
      }

      pendingCoachRef.current = {
        fenBefore,
        move,
        inBookBefore: book?.inBook ?? false,
        suggestion: book?.moves[0] ?? null,
        variationName: book?.variation ?? null,
      };

      pushMove(move);
      setFeedback(null);
      setFen(chess.fen());
      checkEnd(move.color);
      return true;
    },
    [status, pushMove, checkEnd],
  );

  const undo = useCallback((): void => {
    const currentConfig = configRef.current;
    if (!settingsRef.current.allowUndo || status !== 'playing' || !currentConfig) return;
    const chess = chessRef.current;
    epochRef.current += 1;
    setThinking(false);

    // On annule le coup de l'IA puis celui du joueur.
    let undone = 0;
    if (chess.turn() === currentConfig.playerColor && chess.history().length >= 2) {
      if (chess.undo()) undone += 1;
    }
    if (chess.undo()) undone += 1;
    if (undone === 0) return;

    pendingCoachRef.current = null;
    commitMoves(movesRef.current.slice(0, Math.max(0, movesRef.current.length - undone)));
    setFeedback(null);
    setFen(chess.fen());
  }, [status, settingsRef, commitMoves]);

  const resign = useCallback((): void => finish('loss', 'resignation'), [finish]);

  const offerDraw = useCallback((): void => {
    // L'IA accepte la nulle si la position ne lui est pas nettement favorable.
    const playerColor = configRef.current?.playerColor ?? 'w';
    const cp = evalScore ? scoreToCp(evalScore) : 0;
    const fromPlayer = playerColor === 'w' ? cp : -cp;
    if (fromPlayer >= -50) finish('draw', 'agreement');
    else finish('loss', 'resignation');
  }, [evalScore, finish]);

  /* ---------------------------------------------------------------- */
  /* Boucle moteur : evaluation, coaching, coup de l'IA                */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (status !== 'playing') return;
    const currentConfig = configRef.current;
    if (!currentConfig) return;

    const epoch = ++epochRef.current;
    const currentSettings = settingsRef.current;
    const speed = SPEED_PROFILES[currentSettings.analysisSpeed];
    const profile = resolveProfile(currentSettings.level, currentSettings.customElo);
    const currentFen = chessRef.current.fen();
    const aiToMove = sideToMove(currentFen) !== currentConfig.playerColor;
    const alive = (): boolean => epochRef.current === epoch;

    void (async () => {
      try {
        // Le livre du joueur (aide theorique) est distinct de celui de l'IA.
        const playerBook = openingRef.current;
        if (!aiToMove) setBookInfo(playerBook ? lookupBook(playerBook, currentFen) : null);
        if (aiToMove) setThinking(true);

        /* --- Analyse pleine force : barre d'evaluation + coaching ----- */
        const wantCoach = currentSettings.showCoach;
        const movetime = wantCoach ? speed.coachMovetime : speed.evalMovetime;
        const evaluation = await analyzePosition({
          fen: currentFen,
          multiPV: 3,
          movetime,
          depth: speed.coachDepth,
          strength: FULL_STRENGTH,
          tag: 'full',
        });
        if (!alive()) return;

        setAnalysis(evaluation);
        const turnNow = sideToMove(currentFen);
        const topLine = evaluation.lines[0];
        const whiteScore = topLine ? scoreToWhitePov(topLine.score, turnNow) : null;
        if (whiteScore) setEvalScore(whiteScore);

        /* --- Retour pedagogique sur le coup du joueur ----------------- */
        const pending = pendingCoachRef.current;
        if (pending && pending.move.after === currentFen) {
          pendingCoachRef.current = null;
          const beforeAnalysis = await analyzePosition({
            fen: pending.fenBefore,
            multiPV: 3,
            movetime,
            depth: speed.coachDepth,
            strength: FULL_STRENGTH,
            tag: 'full',
          });
          if (!alive()) return;

          const result = buildFeedback({
            fenBefore: pending.fenBefore,
            fenAfter: currentFen,
            move: pending.move,
            playerColor: currentConfig.playerColor,
            before: beforeAnalysis,
            after: evaluation,
            coachLevel: currentSettings.coachLevel,
            playerMoveHistory: playerHistory(movesRef.current, currentConfig.playerColor),
            opening: openingRef.current
              ? {
                  active: true,
                  inBookBefore: pending.inBookBefore,
                  inBookAfter: isInBook(openingRef.current, currentFen),
                  variationName: pending.variationName,
                  suggestion: pending.suggestion,
                }
              : null,
          });
          if (!alive()) return;
          if (currentSettings.showCoach) setFeedback(result);

          const history = [...movesRef.current];
          const last = history[history.length - 1];
          if (last) {
            history[history.length - 1] = {
              ...last,
              feedback: result,
              evalAfterCp: whiteScore ? scoreToCp(whiteScore) : null,
              mateAfter: whiteScore?.mate ?? null,
            };
            commitMoves(history);
          }
        }

        if (!aiToMove) return;

        /* --- Coup de l'IA -------------------------------------------- */
        // L'IA ne suit un repertoire que dans le mode ouverture, ou lorsqu'elle
        // a les blancs en partie libre : l'ouverture doit rester credible.
        // La profondeur autorisee depend de son niveau.
        const aiBook =
          openingRef.current ?? (currentConfig.playerColor === 'b' ? aiOpeningRef.current : null);
        const bookAllowed = aiBook !== null && movesRef.current.length < bookPlyLimit(profile);
        let chosen: string | null = bookAllowed ? bookUci(aiBook, currentFen) : null;
        if (chosen) {
          previousAiMistakeRef.current = false;
        } else {
          const strength = toEngineStrength(profile, getEngine().getCapabilities());
          const search = await analyzePosition({
            fen: currentFen,
            multiPV: profile.multiPV,
            movetime: profile.movetime,
            depth: profile.depth,
            strength,
            tag: `ai${profile.elo}`,
          });
          if (!alive()) return;
          const choice = chooseEngineMove(
            search.lines,
            profile,
            { ply: movesRef.current.length, previousWasMistake: previousAiMistakeRef.current },
            rng,
          );
          chosen = choice?.uci ?? search.bestMove;
          previousAiMistakeRef.current = choice?.deliberateMistake ?? false;
        }

        if (!alive()) return;
        setThinking(false);
        if (!chosen) {
          // Aucune reponse exploitable : on joue un coup legal par securite.
          const fallback = legalMoves(chessRef.current)[0];
          if (!fallback) return;
          chosen = `${fallback.from}${fallback.to}${fallback.promotion ?? ''}`;
        }

        const applied = chessRef.current.move({
          from: chosen.slice(0, 2),
          to: chosen.slice(2, 4),
          promotion: chosen.length > 4 ? chosen[4] : undefined,
        });
        pushMove(applied);
        setFen(chessRef.current.fen());
        checkEnd(applied.color);
      } catch (error) {
        if (error instanceof AnalysisCancelledError) return;
        if (alive()) setThinking(false);
        console.error('[moteur]', error);
      }
    })();
  }, [fen, status, settingsRef, commitMoves, pushMove, checkEnd]);

  const lastMove = useMemo(() => {
    const last = moves[moves.length - 1];
    return last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : null;
  }, [moves]);

  const checkSquare = useMemo(() => {
    const position = safeFen(fen);
    if (!position || !position.isCheck()) return null;
    return kingSquare(position, position.turn());
  }, [fen]);

  return {
    fen,
    status,
    turn,
    config,
    opening,
    moves,
    lastMove,
    checkSquare,
    feedback,
    evalScore,
    analysis,
    thinking,
    bookInfo,
    gameEnd,
    isPlayerTurn,
    canUndo: settings.allowUndo && status === 'playing' && moves.length >= 1,
    start,
    playMove,
    undo,
    resign,
    offerDraw,
    reset,
  };
}

/** Convertit le coup theorique de la position en notation UCI, si disponible. */
function bookUci(opening: OpeningEntry | null, fen: string): string | null {
  const san = opening ? pickBookMove(opening, fen, rng) : null;
  if (!san) return null;
  const probe = safeFen(fen);
  if (!probe) return null;
  try {
    const applied = probe.move(san);
    return `${applied.from}${applied.to}${applied.promotion ?? ''}`;
  } catch {
    return null;
  }
}

/** Historique des coups du joueur, au format attendu par le coach. */
function playerHistory(
  moves: readonly MoveRecord[],
  color: Color,
): Array<{ from: string; to: string; piece: PieceType }> {
  return moves
    .filter((m) => m.color === color)
    .map((m) => ({
      from: m.uci.slice(0, 2),
      to: m.uci.slice(2, 4),
      piece: pieceFromFen(m.fenBefore, m.uci.slice(0, 2)),
    }));
}

/** Type de piece presente sur une case dans un FEN donne. */
function pieceFromFen(fen: string, square: string): PieceType {
  const chess = safeFen(fen);
  const piece = chess?.get(square as never);
  return piece ? piece.type : 'p';
}

/** Construit le resume statistique d'une partie terminee. */
export function buildSummary(
  moves: readonly MoveRecord[],
  config: GameConfig,
  settings: Settings,
  result: GameResult,
  reason: GameEndReason,
  opening: OpeningEntry | null,
): GameSummary {
  const playerMoves = moves.filter((m) => m.color === config.playerColor);
  const losses = playerMoves.filter((m) => m.feedback).map((m) => m.feedback?.cpLoss ?? 0);
  const averageCpLoss =
    losses.length === 0 ? 0 : Math.round(losses.reduce((a, b) => a + b, 0) / losses.length);

  const count = (predicate: (m: MoveRecord) => boolean): number =>
    playerMoves.filter(predicate).length;

  const castledIndex = playerMoves.findIndex((m) => m.san === 'O-O' || m.san === 'O-O-O');
  const tenthMove = moves[19];
  const evalAfterTen =
    tenthMove?.evalAfterCp === null || tenthMove?.evalAfterCp === undefined
      ? null
      : config.playerColor === 'w'
        ? tenthMove.evalAfterCp
        : -tenthMove.evalAfterCp;

  const profile = resolveProfile(settings.level, settings.customElo);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: Date.now(),
    playerColor: config.playerColor,
    opponentElo: profile.elo,
    result,
    reason,
    openingId: opening?.id ?? null,
    openingName: opening?.name ?? null,
    moveCount: moves.length,
    averageCpLoss,
    inaccuracies: count((m) => m.feedback?.quality === 'inaccuracy'),
    mistakes: count((m) => m.feedback?.quality === 'mistake'),
    blunders: count((m) => m.feedback?.quality === 'blunder'),
    hangingPieces: count(
      (m) =>
        m.feedback?.diagnostics.includes('piece_hanging') === true ||
        m.feedback?.diagnostics.includes('piece_lost') === true,
    ),
    missedTactics: count(
      (m) =>
        m.feedback?.diagnostics.includes('free_capture_available') === true ||
        m.feedback?.quality === 'missed_mate',
    ),
    castledOnMove: castledIndex >= 0 ? castledIndex + 1 : null,
    openingMistakes: playerMoves
      .slice(0, 10)
      .filter(
        (m) => m.feedback && ['mistake', 'blunder', 'inaccuracy'].includes(m.feedback.quality),
      ).length,
    evalAfterTenMoves: evalAfterTen,
  };
}

/** Trois moments les plus importants de la partie (plus grosses pertes). */
export function keyMoments(moves: readonly MoveRecord[], playerColor: Color): MoveRecord[] {
  return moves
    .filter((m) => m.color === playerColor && m.feedback)
    .sort((a, b) => (b.feedback?.cpLoss ?? 0) - (a.feedback?.cpLoss ?? 0))
    .slice(0, 3);
}
