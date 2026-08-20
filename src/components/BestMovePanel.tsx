import type { BestMoveExplanation } from '@/types';
import { POSITION_PHRASES } from '@/coaching/positionPhrases';

export interface BestMovePanelProps {
  /** Titre affiche : « Meilleur coup » en partie, « Coup théorique » a l'entrainement. */
  title: string;
  /** Explication du coup, ou null tant qu'elle n'est pas calculable. */
  explanation: BestMoveExplanation | null;
  /** Phrase sur les coups equivalents, ou null. */
  alternatives: string | null;
  /** true quand le coup doit etre affiche (demande, ou mode « Toujours »). */
  revealed: boolean;
  /** true quand l'analyse de la position n'est pas encore arrivee. */
  pending: boolean;
  /** true quand le bouton « Voir le meilleur coup » doit etre propose. */
  canRequest: boolean;
  /** false quand ce n'est pas au joueur de jouer : rien a expliquer. */
  available: boolean;
  onRequest: () => void;
  onHide: () => void;
  /** Ligne complementaire facultative (idee de la variante, par exemple). */
  note?: string | null;
}

/**
 * Le coup a jouer, montre AVANT de jouer.
 *
 * Le panneau du coach commente le coup precedent ; celui-ci repond a « que
 * dois-je jouer maintenant, et pourquoi ? ». Il vit en dehors du tableau de
 * lecture de position pour rester disponible meme quand ce tableau est masque,
 * et il est purement presentationnel : aucun calcul, aucun acces au moteur.
 */
export function BestMovePanel(props: BestMovePanelProps): React.JSX.Element {
  const { explanation, revealed } = props;

  return (
    <section className="best-move" data-testid="best-move-panel" aria-label={props.title}>
      <header className="best-move-head">
        <h2>{props.title}</h2>
        {revealed && props.canRequest ? (
          <button type="button" className="btn btn-link btn-small" onClick={props.onHide}>
            Masquer
          </button>
        ) : null}
      </header>

      {revealed ? (
        <div className="best-move-body" data-testid="best-move-detail" aria-live="polite">
          {explanation ? (
            <>
              <p className="best-move-san">{explanation.san}</p>
              <p className="best-move-why">Pourquoi ce coup ?</p>
              <p className="best-move-text">{explanation.text}</p>
              {props.alternatives ? <p className="best-move-alt">{props.alternatives}</p> : null}
              {props.note ? <p className="best-move-alt">{props.note}</p> : null}
            </>
          ) : (
            <p className="best-move-text hint">
              {props.pending ? POSITION_PHRASES.waitingForEngine() : POSITION_PHRASES.noBestMove()}
            </p>
          )}
        </div>
      ) : props.canRequest ? (
        <button
          type="button"
          className="btn btn-small"
          data-testid="show-best-move"
          disabled={!props.available}
          onClick={props.onRequest}
        >
          Voir le meilleur coup
        </button>
      ) : (
        <p className="hint">Le coup s’affichera dès que ce sera à toi de jouer.</p>
      )}
    </section>
  );
}
