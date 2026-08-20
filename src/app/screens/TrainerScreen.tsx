import { useCallback, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { BoardArrow, Settings } from '@/types';
import { Board } from '@/components/Board';
import { BestMovePanel } from '@/components/BestMovePanel';
import { OpeningCard } from '@/components/OpeningCard';
import { REPERTOIRE, getOpeningById, trainingPositions } from '@/openings/book';
import { sanToFrench } from '@/chess/pieces';
import { formatCoachText } from '@/coaching/format';
import { alternativesSentence, explainTheoryMove } from '@/coaching/bestMoveExplanation';

export interface TrainerScreenProps {
  settings: Settings;
  onBack: () => void;
}

/**
 * Mode « Entrainer une ouverture ».
 * Une position, un coup a trouver, plusieurs reponses acceptees,
 * une explication de deux lignes maximum.
 */
export function TrainerScreen(props: TrainerScreenProps): React.JSX.Element {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);
  const [asked, setAsked] = useState(false);
  const [score, setScore] = useState({ ok: 0, total: 0 });

  const opening = getOpeningById(openingId);
  const positions = useMemo(() => (opening ? trainingPositions(opening) : []), [opening]);
  const current = positions[index] ?? null;

  const orientation: 'white' | 'black' = opening?.side === 'white' ? 'white' : 'black';

  /**
   * Le coup a jouer, explique avant de repondre.
   *
   * A l'entrainement, le bon coup est celui du repertoire : il est deja connu,
   * donc aucune analyse moteur n'est necessaire. L'explication est produite par
   * le meme module que pendant une partie, a partir de l'echiquier seul.
   */
  const help = props.settings.nextMoveHelp;
  const hint = useMemo(
    () => (current ? explainTheoryMove(current.fen, current.answers) : null),
    [current],
  );
  const revealed = help === 'always' || asked;
  const arrows = useMemo<BoardArrow[]>(
    () => (revealed && hint ? [{ from: hint.from, to: hint.to, kind: 'best' as const }] : []),
    [revealed, hint],
  );

  const next = useCallback((): void => {
    setMessage(null);
    setSolved(false);
    setAsked(false);
    setIndex((i) => (positions.length === 0 ? 0 : (i + 1) % positions.length));
  }, [positions.length]);

  const attempt = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      if (!current || solved) return false;
      let san: string;
      try {
        const probe = new Chess(current.fen);
        san = probe.move({ from, to, promotion }).san;
      } catch {
        return false;
      }
      const accepted = current.answers.includes(san);
      setScore((s) => ({ ok: s.ok + (accepted ? 1 : 0), total: s.total + 1 }));
      setSolved(true);
      setMessage(
        accepted
          ? formatCoachText([`Correct : ${sanToFrench(san)} est un coup théorique.`, current.idea])
          : formatCoachText([
              `${sanToFrench(san)} n’est pas la théorie ici.`,
              `Joue plutôt ${current.answers.map(sanToFrench).join(' ou ')}.`,
            ]),
      );
      // Le coup n'est pas conserve : l'exercice reste sur la meme position.
      return false;
    },
    [current, solved],
  );

  if (!opening) {
    return (
      <div className="screen list-screen">
        <header className="list-head">
          <h1>Entraîner une ouverture</h1>
          <button type="button" className="btn" onClick={props.onBack}>
            Retour
          </button>
        </header>
        <div className="opening-grid">
          {REPERTOIRE.map((entry) => (
            <OpeningCard
              key={entry.id}
              opening={entry}
              selected={false}
              onSelect={(id) => {
                setOpeningId(id);
                setIndex(0);
                setScore({ ok: 0, total: 0 });
                setMessage(null);
                setSolved(false);
                setAsked(false);
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="screen trainer">
      <header className="list-head">
        <h1>{opening.name}</h1>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setOpeningId(null);
            setMessage(null);
          }}
        >
          Changer
        </button>
        <button type="button" className="btn btn-ghost" onClick={props.onBack}>
          Menu
        </button>
      </header>

      {current ? (
        <div className="trainer-body">
          <Board
            fen={current.fen}
            orientation={orientation}
            interactive={!solved}
            playerColor={orientation === 'white' ? 'w' : 'b'}
            showLegalMoves={props.settings.showLegalMoves}
            animate={!props.settings.reduceAnimations}
            lastMove={null}
            checkSquare={null}
            arrows={arrows}
            onMove={attempt}
          />
          <div className="trainer-side">
            <p className="hint">
              Exercice {index + 1} / {positions.length} · {current.variation}
            </p>
            <p className="hint">
              Coups joués : {current.history.map(sanToFrench).join(' ') || 'position de départ'}
            </p>
            <p className="trainer-question">
              Trouve un bon coup pour les {orientation === 'white' ? 'blancs' : 'noirs'}.
            </p>
            {message ? (
              <p className="coach-text" data-testid="trainer-message">
                {message}
              </p>
            ) : null}
            {help !== 'plan' ? (
              <BestMovePanel
                title="Coup théorique"
                explanation={hint}
                alternatives={hint ? alternativesSentence(hint) : null}
                revealed={revealed}
                pending={false}
                canRequest={help === 'on_demand'}
                available={hint !== null && !solved}
                onRequest={() => setAsked(true)}
                onHide={() => setAsked(false)}
                note={`Idée : ${current.idea}`}
              />
            ) : null}
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={next}>
                {solved ? 'Exercice suivant' : 'Passer'}
              </button>
            </div>
            <p className="hint">
              Score : {score.ok} / {score.total}
            </p>
          </div>
        </div>
      ) : (
        <p className="hint">Aucun exercice disponible pour cette ouverture.</p>
      )}
    </div>
  );
}
