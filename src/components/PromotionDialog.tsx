import type { Color, PieceType } from '@/types';
import { PIECE_NAME_FR } from '@/chess/pieces';

const CHOICES: PieceType[] = ['q', 'r', 'b', 'n'];

const GLYPHS: Record<Color, Record<string, string>> = {
  w: { q: '♕', r: '♖', b: '♗', n: '♘' },
  b: { q: '♛', r: '♜', b: '♝', n: '♞' },
};

export interface PromotionDialogProps {
  color: Color;
  onSelect: (piece: PieceType) => void;
  onCancel: () => void;
}

/** Choix de la piece de promotion. */
export function PromotionDialog(props: PromotionDialogProps): React.JSX.Element {
  return (
    <div
      className="promotion-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Choix de la promotion"
    >
      <div className="promotion-box">
        <p className="promotion-title">Promotion</p>
        <div className="promotion-choices">
          {CHOICES.map((piece) => (
            <button
              key={piece}
              type="button"
              className="promotion-choice"
              onClick={() => props.onSelect(piece)}
              aria-label={`Promouvoir en ${PIECE_NAME_FR[piece]}`}
            >
              <span aria-hidden="true">{GLYPHS[props.color][piece]}</span>
              <small>{PIECE_NAME_FR[piece]}</small>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost" onClick={props.onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}
