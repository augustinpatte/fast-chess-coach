import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Settings } from '@/types';
import { Board } from '@/components/Board';
import { EvalBar } from '@/components/EvalBar';
import { MoveList } from '@/components/MoveList';
import { CoachPanel } from '@/components/CoachPanel';
import { PositionDashboard } from '@/components/PositionDashboard';
import { BestMovePanel } from '@/components/BestMovePanel';
import { GameControls } from '@/components/GameControls';
import { GameOverDialog } from '@/components/GameOverDialog';
import { keyMoments, type GameController } from '@/hooks/useGameController';
import { usePositionInsight } from '@/hooks/usePositionInsight';
import { playSound } from '@/utils/sound';

export interface GameScreenProps {
  controller: GameController;
  settings: Settings;
  onOpenSettings: () => void;
  onBackToMenu: () => void;
  onNewGame: () => void;
  onTryAnotherOpening: () => void;
}

/** Ecran de jeu : echiquier, barre d'evaluation, coups, coach, commandes. */
export function GameScreen(props: GameScreenProps): React.JSX.Element {
  const { controller, settings } = props;
  const [flipped, setFlipped] = useState(false);
  const [analysisVisible, setAnalysisVisible] = useState(true);
  const [dismissedEnd, setDismissedEnd] = useState<string | null>(null);

  const playerColor = controller.config?.playerColor ?? 'w';

  // L'aide au prochain coup ne depend pas du tableau de lecture : on peut
  // vouloir le meilleur coup avant de jouer sans afficher les jauges.
  const helpEnabled = settings.nextMoveHelp !== 'plan';
  const playing = controller.status === 'playing';

  // Le tableau de lecture reutilise l'analyse deja produite par le controleur :
  // il ne declenche aucune recherche supplementaire.
  const insight = usePositionInsight({
    fen: controller.fen,
    perspective: playerColor,
    analysis: controller.analysis,
    help: settings.nextMoveHelp,
    active: (settings.showPositionDashboard || helpEnabled) && playing,
  });

  const orientation = useMemo<'white' | 'black'>(() => {
    const base =
      settings.boardOrientation === 'auto'
        ? playerColor === 'w'
          ? 'white'
          : 'black'
        : settings.boardOrientation;
    return flipped ? (base === 'white' ? 'black' : 'white') : base;
  }, [settings.boardOrientation, playerColor, flipped]);

  // La fenetre de fin est derivee de l'etat : pas de setState dans un effet.
  const endId = controller.gameEnd?.summary.id ?? null;
  const showEnd = endId !== null && dismissedEnd !== endId;

  // Son discret a chaque coup joue.
  useEffect(() => {
    if (!settings.sound || controller.moves.length === 0) return;
    const last = controller.moves[controller.moves.length - 1];
    playSound(last.san.includes('x') ? 'capture' : 'move');
  }, [controller.moves, settings.sound]);

  const handleMove = useCallback(
    (from: string, to: string, promotion?: string): boolean =>
      controller.playMove(from, to, promotion),
    [controller],
  );

  /** Saisie d'un coup en notation algebrique (accessibilite clavier). */
  const handleKeyboardMove = useCallback(
    (input: string): boolean => {
      if (!input) return false;
      const french = input
        .replace(/^C/, 'N')
        .replace(/^F/, 'B')
        .replace(/^T/, 'R')
        .replace(/^D/, 'Q')
        .replace(/^R/, 'K')
        .replace(/0-0-0/i, 'O-O-O')
        .replace(/^0-0$/i, 'O-O');
      try {
        const probe = new Chess(controller.fen);
        const move = probe.move(french);
        return handleMove(move.from, move.to, move.promotion);
      } catch {
        return false;
      }
    },
    [controller.fen, handleMove],
  );

  const statusText = controller.thinking
    ? 'L’adversaire réfléchit…'
    : controller.isPlayerTurn
      ? 'À toi de jouer.'
      : 'En attente…';

  const placeholder = controller.bookInfo?.inBook
    ? `Théorie : ${controller.bookInfo.variation ?? ''}. ${controller.bookInfo.idea ?? ''}`.slice(
        0,
        160,
      )
    : 'Joue un coup : l’explication apparaît ici en deux lignes.';

  return (
    <div className="screen game">
      <div className="game-main">
        <div className="board-area">
          {settings.showEvalBar ? (
            <EvalBar
              score={controller.evalScore}
              showValue={settings.showEvalValue}
              orientation={orientation}
            />
          ) : null}
          <Board
            fen={controller.fen}
            orientation={orientation}
            interactive={controller.isPlayerTurn}
            playerColor={playerColor}
            showLegalMoves={settings.showLegalMoves}
            animate={!settings.reduceAnimations}
            lastMove={controller.lastMove}
            checkSquare={controller.checkSquare}
            arrows={insight.arrows}
            highlights={insight.highlights}
            onMove={handleMove}
          />
        </div>

        {settings.showCoach && analysisVisible ? (
          <CoachPanel
            feedback={controller.feedback}
            placeholder={placeholder}
            thinking={controller.thinking}
          />
        ) : null}

        {helpEnabled && analysisVisible && playing ? (
          <BestMovePanel
            title="Meilleur coup"
            explanation={insight.bestMove}
            alternatives={insight.bestMoveAlternatives}
            revealed={insight.bestMoveRequested}
            pending={insight.bestMovePending}
            canRequest={insight.canRequestBestMove}
            available={insight.bestMoveAvailable}
            onRequest={insight.requestBestMove}
            onHide={insight.hideBestMove}
          />
        ) : null}

        {settings.showPositionDashboard && analysisVisible ? (
          <PositionDashboard insight={insight} />
        ) : null}
      </div>

      <aside className="game-side">
        <div className="side-head">
          <span className="status" role="status">
            {statusText}
          </span>
          {controller.opening ? <span className="badge">{controller.opening.name}</span> : null}
        </div>
        <MoveList moves={controller.moves} />
        <GameControls
          canUndo={controller.canUndo}
          analysisVisible={analysisVisible}
          confirmResign={settings.confirmResign}
          disabled={controller.status !== 'playing'}
          onNewGame={props.onNewGame}
          onUndo={controller.undo}
          onResign={controller.resign}
          onOfferDraw={controller.offerDraw}
          onFlip={() => setFlipped((v) => !v)}
          onSettings={props.onOpenSettings}
          onToggleAnalysis={() => setAnalysisVisible((v) => !v)}
          onShowLastTip={() => setAnalysisVisible(true)}
          onBackToMenu={props.onBackToMenu}
          onKeyboardMove={handleKeyboardMove}
        />
      </aside>

      {controller.gameEnd ? (
        <GameOverDialog
          open={showEnd}
          summary={controller.gameEnd.summary}
          keyMoments={keyMoments(controller.moves, playerColor)}
          onClose={() => setDismissedEnd(endId)}
          onReplay={() => {
            setDismissedEnd(endId);
            props.onNewGame();
          }}
          onTryAnotherOpening={() => {
            setDismissedEnd(endId);
            props.onTryAnotherOpening();
          }}
        />
      ) : null}
    </div>
  );
}
