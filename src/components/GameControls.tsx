import { useState } from 'react';

export interface GameControlsProps {
  canUndo: boolean;
  analysisVisible: boolean;
  confirmResign: boolean;
  disabled: boolean;
  onNewGame: () => void;
  onUndo: () => void;
  onResign: () => void;
  onOfferDraw: () => void;
  onFlip: () => void;
  onSettings: () => void;
  onToggleAnalysis: () => void;
  onShowLastTip: () => void;
  onBackToMenu: () => void;
  /** Saisie d'un coup au clavier (accessibilite). */
  onKeyboardMove: (san: string) => boolean;
}

/** Commandes de la partie. Volontairement limitees a l'essentiel. */
export function GameControls(props: GameControlsProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [sanInput, setSanInput] = useState('');
  const [sanError, setSanError] = useState(false);

  const resign = (): void => {
    if (props.confirmResign && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    props.onResign();
  };

  return (
    <div className="controls">
      <div className="controls-row">
        <button type="button" className="btn btn-primary" onClick={props.onNewGame}>
          Nouvelle partie
        </button>
        <button type="button" className="btn" onClick={props.onUndo} disabled={!props.canUndo}>
          Annuler
        </button>
        <button
          type="button"
          className={`btn ${confirming ? 'danger' : ''}`}
          onClick={resign}
          disabled={props.disabled}
        >
          {confirming ? 'Confirmer ?' : 'Abandonner'}
        </button>
        <button type="button" className="btn" onClick={props.onOfferDraw} disabled={props.disabled}>
          Nulle
        </button>
      </div>
      <div className="controls-row">
        <button type="button" className="btn" onClick={props.onFlip}>
          Inverser
        </button>
        <button type="button" className="btn" onClick={props.onToggleAnalysis}>
          {props.analysisVisible ? 'Masquer l’analyse' : 'Afficher l’analyse'}
        </button>
        <button type="button" className="btn" onClick={props.onShowLastTip}>
          Dernier conseil
        </button>
        <button type="button" className="btn" onClick={props.onSettings} aria-label="Réglages">
          ⚙︎
        </button>
        <button type="button" className="btn btn-ghost" onClick={props.onBackToMenu}>
          Menu
        </button>
      </div>
      <form
        className="controls-row keyboard-move"
        onSubmit={(event) => {
          event.preventDefault();
          const ok = props.onKeyboardMove(sanInput.trim());
          setSanError(!ok);
          if (ok) setSanInput('');
        }}
      >
        <label htmlFor="san-input">Coup au clavier</label>
        <input
          id="san-input"
          type="text"
          value={sanInput}
          placeholder="e4, Cf3, O-O…"
          autoComplete="off"
          aria-invalid={sanError}
          onChange={(event) => {
            setSanInput(event.target.value);
            setSanError(false);
          }}
        />
        <button type="submit" className="btn">
          Jouer
        </button>
        {sanError ? (
          <span className="hint error" role="alert">
            Coup illégal.
          </span>
        ) : null}
      </form>
    </div>
  );
}
