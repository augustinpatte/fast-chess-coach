import { useCallback, useMemo, useState } from 'react';
import type {
  AnalysisResult,
  BestMoveExplanation,
  BoardArrow,
  BoardHighlight,
  Color,
  NextMoveHelp,
  PositionAssessment,
  PositionPlan,
  WatchFocus,
} from '@/types';
import { sideToMove } from '@/chess/fen';
import { assessPosition } from '@/coaching/positionAssessment';
import { buildPlan } from '@/coaching/positionPlan';
import { alternativesSentence, explainBestMove } from '@/coaching/bestMoveExplanation';
import { buildWatchFocus } from '@/coaching/watchFocus';

export interface PositionInsightInput {
  fen: string;
  /** Couleur du joueur : les textes sont ecrits de son point de vue. */
  perspective: Color;
  /**
   * Analyse deja produite par le controleur de partie.
   *
   * Ce hook ne parle jamais au moteur : il consomme uniquement le resultat
   * existant. Aucune seconde instance de Stockfish, aucune recherche
   * supplementaire.
   */
  analysis: AnalysisResult | null;
  help: NextMoveHelp;
  /** false hors partie : les aides sont desactivees. */
  active: boolean;
}

export interface PositionInsight {
  assessment: PositionAssessment | null;
  plan: PositionPlan | null;
  bestMove: BestMoveExplanation | null;
  /** Phrase sur les coups equivalents, ou null. */
  bestMoveAlternatives: string | null;
  /** true quand le meilleur coup a ete demande (ou est affiche d'office). */
  bestMoveRequested: boolean;
  /** true quand l'analyse moteur de cette position n'est pas encore arrivee. */
  bestMovePending: boolean;
  watch: WatchFocus | null;
  arrows: BoardArrow[];
  highlights: BoardHighlight[];
  /** true si le bouton « Voir le meilleur coup » doit etre propose. */
  canRequestBestMove: boolean;
  /** false quand ce n'est pas au joueur de jouer : le bouton reste inactif. */
  bestMoveAvailable: boolean;
  requestBestMove: () => void;
  hideBestMove: () => void;
  showWatch: () => void;
  hideWatch: () => void;
}

/** Etat des aides visuelles, attache a une position precise. */
interface HintState {
  fen: string;
  bestMove: boolean;
  /** Index de la piste « Que regarder ? », ou null si elle est masquee. */
  watchIndex: number | null;
}

const NO_HINTS: HintState = { fen: '', bestMove: false, watchIndex: null };

/** Au plus une fleche et trois cases : l'echiquier ne doit pas etre surcharge. */
const MAX_ARROWS = 1;
const MAX_HIGHLIGHTS = 3;

/**
 * Lecture de la position courante : jauges, priorites, plan, aides a la demande.
 *
 * Les aides sont indexees sur le FEN : des que la position change (coup joue,
 * annulation, nouvelle partie), l'etat memorise ne correspond plus et toutes
 * les aides disparaissent sans le moindre effet de bord.
 */
export function usePositionInsight(input: PositionInsightInput): PositionInsight {
  const { fen, perspective, analysis, help, active } = input;
  const [hints, setHints] = useState<HintState>(NO_HINTS);

  const current = hints.fen === fen ? hints : NO_HINTS;

  // L'analyse n'est utilisable que si elle porte bien sur la position affichee.
  const freshAnalysis = analysis && analysis.fen === fen ? analysis : null;

  const assessment = useMemo<PositionAssessment | null>(
    () => (active ? assessPosition({ fen, perspective, analysis: freshAnalysis }) : null),
    [active, fen, perspective, freshAnalysis],
  );

  const plan = useMemo<PositionPlan | null>(
    () =>
      active
        ? buildPlan({
            fen,
            perspective,
            phase: assessment?.phase,
            forcedMate: assessment?.forcedMate ?? null,
          })
        : null,
    [active, fen, perspective, assessment?.phase, assessment?.forcedMate],
  );

  // Expliquer le meilleur coup n'a de sens que quand c'est au joueur de jouer :
  // sinon on commenterait le coup de l'adversaire.
  const playerToMove = sideToMove(fen) === perspective;
  const bestMoveRequested = active && playerToMove && (help === 'always' || current.bestMove);

  const bestMove = useMemo<BestMoveExplanation | null>(
    () =>
      bestMoveRequested && freshAnalysis ? explainBestMove({ fen, analysis: freshAnalysis }) : null,
    [bestMoveRequested, fen, freshAnalysis],
  );

  const watch = useMemo<WatchFocus | null>(
    () =>
      active && current.watchIndex !== null
        ? buildWatchFocus({ fen, perspective }, current.watchIndex)
        : null,
    [active, fen, perspective, current.watchIndex],
  );

  const requestBestMove = useCallback((): void => {
    setHints((previous) => ({
      fen,
      bestMove: true,
      watchIndex: previous.fen === fen ? previous.watchIndex : null,
    }));
  }, [fen]);

  const showWatch = useCallback((): void => {
    setHints((previous) => {
      const base = previous.fen === fen ? previous : NO_HINTS;
      return {
        fen,
        bestMove: base.bestMove,
        watchIndex: base.watchIndex === null ? 0 : base.watchIndex + 1,
      };
    });
  }, [fen]);

  // Chaque aide se masque separement : cacher le meilleur coup ne doit pas
  // effacer la piste de lecture, et inversement.
  const hideBestMove = useCallback((): void => {
    setHints((previous) => (previous.fen === fen ? { ...previous, bestMove: false } : NO_HINTS));
  }, [fen]);

  const hideWatch = useCallback((): void => {
    setHints((previous) => (previous.fen === fen ? { ...previous, watchIndex: null } : NO_HINTS));
  }, [fen]);

  const arrows = useMemo<BoardArrow[]>(
    () => (bestMove ? [{ from: bestMove.from, to: bestMove.to, kind: 'best' as const }] : []),
    [bestMove],
  );

  const highlights = useMemo<BoardHighlight[]>(
    () =>
      (watch?.squares ?? [])
        .slice(0, MAX_HIGHLIGHTS)
        .map((square) => ({ square, kind: 'focus' as const })),
    [watch],
  );

  return {
    assessment,
    plan,
    bestMove,
    bestMoveAlternatives: bestMove ? alternativesSentence(bestMove) : null,
    bestMoveRequested,
    bestMovePending: bestMoveRequested && freshAnalysis === null,
    watch,
    arrows: arrows.slice(0, MAX_ARROWS),
    highlights,
    canRequestBestMove: active && help === 'on_demand',
    bestMoveAvailable: playerToMove,
    requestBestMove,
    hideBestMove,
    showWatch,
    hideWatch,
  };
}
