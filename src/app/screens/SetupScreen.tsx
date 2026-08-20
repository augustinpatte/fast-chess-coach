import { useState } from 'react';
import type { Color, OpeningSide } from '@/types';
import { openingsForSide } from '@/openings/book';
import { OpeningCard } from '@/components/OpeningCard';
import type { GameConfig } from '@/hooks/useGameController';

export interface SetupScreenProps {
  onStart: (config: GameConfig) => void;
  onOpenTrainer: () => void;
  onOpenOpenings: () => void;
  onOpenProgress: () => void;
  onOpenSettings: () => void;
  levelLabel: string;
}

type ColorChoice = 'white' | 'black' | 'random';
type ModeChoice = 'free' | 'opening';

/** Ecran de preparation compact : couleur, mode, ouverture, c'est tout. */
export function SetupScreen(props: SetupScreenProps): React.JSX.Element {
  const [color, setColor] = useState<ColorChoice>('white');
  const [mode, setMode] = useState<ModeChoice>('free');
  const [openingId, setOpeningId] = useState<string | null>(null);

  const side: OpeningSide | null = color === 'white' ? 'white' : null;

  /** La couleur aleatoire est tiree au lancement, jamais pendant le rendu. */
  const start = (): void => {
    const playerColor: Color =
      color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color === 'white' ? 'w' : 'b';
    props.onStart({
      playerColor,
      mode: mode === 'opening' && openingId ? 'opening' : 'free',
      openingId: mode === 'opening' ? openingId : null,
    });
  };

  return (
    <div className="screen setup">
      <header className="setup-head">
        <h1>Fast Chess Coach</h1>
        <p className="subtitle">
          Joue vite, comprends chaque coup en deux lignes, progresse vers 1500.
        </p>
      </header>

      <section className="panel">
        <h2>Couleur</h2>
        <div className="choice-row" role="radiogroup" aria-label="Couleur">
          {(
            [
              ['white', 'Blancs'],
              ['black', 'Noirs'],
              ['random', 'Aléatoire'],
            ] as Array<[ColorChoice, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={color === value}
              className={`chip ${color === value ? 'selected' : ''}`}
              onClick={() => {
                setColor(value);
                setOpeningId(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Mode</h2>
        <div className="choice-row" role="radiogroup" aria-label="Mode de partie">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'free'}
            className={`chip ${mode === 'free' ? 'selected' : ''}`}
            onClick={() => setMode('free')}
          >
            Partie libre
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'opening'}
            className={`chip ${mode === 'opening' ? 'selected' : ''}`}
            onClick={() => setMode('opening')}
          >
            Tester une ouverture
          </button>
        </div>
        {mode === 'free' ? (
          <p className="hint">
            {color === 'white'
              ? 'Tu joues librement, l’adversaire répond selon son niveau.'
              : 'L’adversaire choisit une ouverture crédible et variée.'}
          </p>
        ) : null}
      </section>

      {mode === 'opening' ? (
        <section className="panel">
          <h2>Ouverture</h2>
          {side === 'white' ? (
            <div className="opening-grid">
              {openingsForSide('white').map((opening) => (
                <OpeningCard
                  key={opening.id}
                  opening={opening}
                  selected={openingId === opening.id}
                  onSelect={setOpeningId}
                />
              ))}
            </div>
          ) : (
            <>
              <h3>Contre 1.e4</h3>
              <div className="opening-grid">
                {openingsForSide('black-e4').map((opening) => (
                  <OpeningCard
                    key={opening.id}
                    opening={opening}
                    selected={openingId === opening.id}
                    onSelect={setOpeningId}
                  />
                ))}
              </div>
              <h3>Contre 1.d4</h3>
              <div className="opening-grid">
                {openingsForSide('black-d4').map((opening) => (
                  <OpeningCard
                    key={opening.id}
                    opening={opening}
                    selected={openingId === opening.id}
                    onSelect={setOpeningId}
                  />
                ))}
              </div>
            </>
          )}
          {color === 'random' ? (
            <p className="hint">
              En couleur aléatoire, l’ouverture n’est appliquée que si elle correspond à la couleur
              tirée.
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="setup-actions">
        <button
          type="button"
          className="btn btn-primary btn-large"
          onClick={start}
          disabled={mode === 'opening' && !openingId}
        >
          Jouer
        </button>
        <span className="hint">Adversaire : {props.levelLabel}</span>
      </div>

      <nav className="setup-nav">
        <button type="button" className="btn" onClick={props.onOpenTrainer}>
          Entraîner une ouverture
        </button>
        <button type="button" className="btn" onClick={props.onOpenOpenings}>
          Mes ouvertures
        </button>
        <button type="button" className="btn" onClick={props.onOpenProgress}>
          Progression
        </button>
        <button type="button" className="btn" onClick={props.onOpenSettings} aria-label="Réglages">
          ⚙︎ Réglages
        </button>
      </nav>
    </div>
  );
}
