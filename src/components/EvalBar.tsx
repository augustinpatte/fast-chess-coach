import type { EngineScore } from '@/types';
import { formatScore, scoreToBarPercent } from '@/engine/uci';

export interface EvalBarProps {
  /** Evaluation du point de vue des blancs, ou null si non disponible. */
  score: EngineScore | null;
  showValue: boolean;
  orientation: 'white' | 'black';
}

/**
 * Barre d'evaluation verticale.
 * La valeur est toujours exprimee du point de vue des blancs ; l'orientation
 * suit celle de l'echiquier pour rester intuitive.
 */
export function EvalBar(props: EvalBarProps): React.JSX.Element {
  const percent = props.score ? scoreToBarPercent(props.score) : 50;
  const label = props.score ? formatScore(props.score) : '–';
  const whiteFromBottom = props.orientation === 'white';

  return (
    <div
      className="evalbar"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-label={`Évaluation ${label} pour les blancs`}
      data-testid="eval-bar"
      title={`Évaluation : ${label}`}
    >
      <div
        className="evalbar-fill"
        style={{
          height: `${percent}%`,
          [whiteFromBottom ? 'bottom' : 'top']: 0,
        }}
      />
      {props.showValue ? (
        <span className={`evalbar-value ${percent >= 50 ? 'on-white' : 'on-black'}`}>{label}</span>
      ) : null}
    </div>
  );
}
