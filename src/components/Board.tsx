import { useCallback, useMemo, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import type { BoardArrow, BoardHighlight, Color, PieceType } from '@/types';
import { movesFromSquare } from '@/chess/rules';
import { PromotionDialog } from './PromotionDialog';

export interface BoardProps {
  fen: string;
  orientation: 'white' | 'black';
  /** Autorise le joueur a bouger les pieces. */
  interactive: boolean;
  /** Couleur des pieces que le joueur peut deplacer. */
  playerColor: Color;
  showLegalMoves: boolean;
  animate: boolean;
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  /** Fleche d'aide (au plus une) : meilleur coup ou menace adverse. */
  arrows?: readonly BoardArrow[];
  /** Cases mises en evidence par les aides (au plus trois). */
  highlights?: readonly BoardHighlight[];
  /** Retourne true si le coup a ete accepte. */
  onMove: (from: string, to: string, promotion?: string) => boolean;
}

const HIGHLIGHT_LAST = 'rgba(255, 205, 65, 0.45)';
const HIGHLIGHT_SELECTED = 'rgba(56, 142, 255, 0.42)';
const HIGHLIGHT_CHECK =
  'radial-gradient(circle, rgba(226, 62, 62, 0.95) 12%, rgba(226, 62, 62, 0.35) 62%, transparent 72%)';
const DOT_MOVE = 'radial-gradient(circle, rgba(30, 34, 40, 0.32) 17%, transparent 19%)';
const HIGHLIGHT_KIND: Record<BoardHighlight['kind'], string> = {
  focus: 'inset 0 0 0 4px rgba(47, 111, 235, 0.85)',
  threat: 'inset 0 0 0 4px rgba(226, 62, 62, 0.85)',
  strategic: 'inset 0 0 0 4px rgba(31, 138, 76, 0.85)',
};
const ARROW_COLOR: Record<BoardArrow['kind'], string> = {
  best: 'rgba(31, 138, 76, 0.85)',
  threat: 'rgba(226, 62, 62, 0.8)',
};
/** Garde-fous d'affichage : le plateau ne doit jamais etre surcharge. */
const MAX_ARROWS = 1;
const MAX_HIGHLIGHTS = 3;
const RING_CAPTURE =
  'radial-gradient(circle, transparent 56%, rgba(226, 62, 62, 0.55) 58%, rgba(226, 62, 62, 0.55) 70%, transparent 72%)';

/**
 * Echiquier interactif.
 *
 * Gere le glisser-deposer, le deplacement en deux clics, l'affichage des coups
 * legaux (points / cercles de prise), la surbrillance du dernier coup et du roi
 * en echec, ainsi que la fenetre de promotion.
 * Aucun coup illegal ne peut etre joue : chess.js valide chaque tentative.
 */
export function Board(props: BoardProps): React.JSX.Element {
  const { fen, orientation, interactive, playerColor, showLegalMoves, animate } = props;
  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const targets = useMemo(() => {
    if (!selected || !interactive) return [];
    return movesFromSquare(chess, selected);
  }, [chess, selected, interactive]);

  const canSelect = useCallback(
    (square: string): boolean => {
      const piece = chess.get(square as never);
      return Boolean(piece && piece.color === playerColor);
    },
    [chess, playerColor],
  );

  /** Tente un coup ; ouvre la fenetre de promotion si necessaire. */
  const tryMove = useCallback(
    (from: string, to: string): boolean => {
      if (!interactive) return false;
      const candidates = movesFromSquare(chess, from).filter((m) => m.to === to);
      if (candidates.length === 0) return false;
      if (candidates.some((m) => m.promotion)) {
        setPromotion({ from, to });
        setSelected(null);
        return false;
      }
      const accepted = props.onMove(from, to);
      if (accepted) setSelected(null);
      return accepted;
    },
    [chess, interactive, props],
  );

  const handleSquareClick = useCallback(
    ({ square }: { square: string }): void => {
      if (!interactive) return;
      if (selected === square) {
        setSelected(null);
        return;
      }
      if (selected && tryMove(selected, square)) return;
      setSelected(canSelect(square) ? square : null);
    },
    [interactive, selected, tryMove, canSelect],
  );

  const handleDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }): boolean => {
      if (!targetSquare) return false;
      return tryMove(sourceSquare, targetSquare);
    },
    [tryMove],
  );

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (props.lastMove) {
      styles[props.lastMove.from] = { background: HIGHLIGHT_LAST };
      styles[props.lastMove.to] = { background: HIGHLIGHT_LAST };
    }
    if (props.checkSquare) {
      styles[props.checkSquare] = { background: HIGHLIGHT_CHECK };
    }
    if (selected) {
      styles[selected] = { ...styles[selected], background: HIGHLIGHT_SELECTED };
    }
    for (const highlight of (props.highlights ?? []).slice(0, MAX_HIGHLIGHTS)) {
      styles[highlight.square] = {
        ...styles[highlight.square],
        boxShadow: HIGHLIGHT_KIND[highlight.kind],
      };
    }
    if (showLegalMoves) {
      for (const move of targets) {
        const isCapture = Boolean(move.captured);
        styles[move.to] = {
          ...styles[move.to],
          backgroundImage: isCapture ? RING_CAPTURE : DOT_MOVE,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          backgroundSize: '100% 100%',
        };
      }
    }
    return styles;
  }, [props.lastMove, props.checkSquare, props.highlights, selected, showLegalMoves, targets]);

  const arrows = useMemo(
    () =>
      (props.arrows ?? []).slice(0, MAX_ARROWS).map((arrow) => ({
        startSquare: arrow.from,
        endSquare: arrow.to,
        color: ARROW_COLOR[arrow.kind],
      })),
    [props.arrows],
  );

  const onPromotionPick = useCallback(
    (piece: PieceType): void => {
      if (!promotion) return;
      props.onMove(promotion.from, promotion.to, piece);
      setPromotion(null);
    },
    [promotion, props],
  );

  return (
    <div className="board-wrapper">
      <div
        className="board"
        role="application"
        aria-label={`Échiquier, position ${fen.split(' ')[0]}`}
        data-testid="board"
      >
        <Chessboard
          options={{
            id: 'fast-chess-coach-board',
            position: fen,
            boardOrientation: orientation,
            allowDragging: interactive,
            animationDurationInMs: animate ? 150 : 0,
            showAnimations: animate,
            allowDrawingArrows: false,
            arrows,
            squareStyles,
            darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
            lightSquareStyle: { backgroundColor: 'var(--board-light)' },
            onSquareClick: handleSquareClick,
            onPieceDrop: handleDrop,
          }}
        />
      </div>
      {promotion ? (
        <PromotionDialog
          color={playerColor}
          onSelect={onPromotionPick}
          onCancel={() => setPromotion(null)}
        />
      ) : null}
    </div>
  );
}
