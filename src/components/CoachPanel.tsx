import { useState } from 'react';
import type { CoachFeedback } from '@/types';
import { QUALITY_TONE } from '@/coaching/phrases';

export interface CoachPanelProps {
  feedback: CoachFeedback | null;
  /** Message affiche tant qu'aucun coup n'a ete analyse. */
  placeholder: string;
  thinking: boolean;
}

/**
 * Zone pedagogique : classification + explication de deux lignes maximum.
 * Le detail (« Voir plus ») est facultatif et referme a chaque nouveau coup.
 */
export function CoachPanel(props: CoachPanelProps): React.JSX.Element {
  // Le detail est memorise par retour : un nouveau coup le referme
  // automatiquement, sans passer par un effet.
  const [expandedFor, setExpandedFor] = useState<CoachFeedback | null>(null);
  const feedback = props.feedback;
  const expanded = feedback !== null && expandedFor === feedback;

  const tone = feedback ? QUALITY_TONE[feedback.quality] : 'neutral';

  return (
    <section className="coach" aria-live="polite" data-testid="coach-panel">
      <div className="coach-head">
        <span className={`coach-badge tone-${tone}`} data-testid="coach-quality">
          {feedback ? feedback.qualityLabel : props.thinking ? 'Analyse…' : 'Coach'}
        </span>
        {feedback?.details ? (
          <button
            type="button"
            className="btn btn-link"
            onClick={() => setExpandedFor(expanded ? null : feedback)}
            aria-expanded={expanded}
          >
            {expanded ? 'Voir moins' : 'Voir plus'}
          </button>
        ) : null}
      </div>

      <p
        className="coach-text"
        data-testid="coach-text"
        title={feedback?.text ?? props.placeholder}
      >
        {feedback ? feedback.text : props.placeholder}
      </p>

      {expanded && feedback?.details ? (
        <div className="coach-details" data-testid="coach-details">
          {feedback.details.bestMoveSan ? (
            <p>
              <strong>Meilleur coup :</strong> {feedback.details.bestMoveSan}
            </p>
          ) : null}
          {feedback.details.variation.length > 0 ? (
            <p>
              <strong>Suite :</strong> {feedback.details.variation.join(' ')}
            </p>
          ) : null}
          <p className="coach-concept">{feedback.details.concept}</p>
        </div>
      ) : null}
    </section>
  );
}
