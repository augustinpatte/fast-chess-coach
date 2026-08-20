import type { PositionFactor } from '@/types';
import type { PositionInsight } from '@/hooks/usePositionInsight';
import { isTacticalKind } from '@/coaching/positionAssessment';
import { FACTOR_FULL_LABEL, PHASE_LABEL, POSITION_PHRASES } from '@/coaching/positionPhrases';

export interface PositionDashboardProps {
  insight: PositionInsight;
}

/** Description textuelle d'une jauge, pour les lecteurs d'ecran. */
function factorDescription(factor: PositionFactor): string {
  const label = FACTOR_FULL_LABEL[factor.id];
  if (Math.abs(factor.value) < 0.25) return `${label} : équilibré`;
  const side = factor.value > 0 ? 'des Blancs' : 'des Noirs';
  const strength = Math.abs(factor.value) >= 1.2 ? 'nettement' : 'légèrement';
  return `${label} : ${strength} en faveur ${side}`;
}

/**
 * Une jauge compacte : le trait part du centre vers le camp avantage.
 * L'echelle interne est bornee a -2 / +2 et n'est jamais affichee telle quelle.
 */
function FactorGauge({ factor }: { factor: PositionFactor }): React.JSX.Element {
  const magnitude = Math.min(50, (Math.abs(factor.value) / 2) * 50);
  const toWhite = factor.value > 0;

  return (
    <li
      className={`gauge ${factor.highlighted ? 'gauge-focus' : ''}`}
      data-testid={`gauge-${factor.id}`}
      title={factorDescription(factor)}
    >
      <span className="gauge-label">{factor.label}</span>
      <span
        className="gauge-track"
        role="meter"
        aria-valuemin={-2}
        aria-valuemax={2}
        aria-valuenow={factor.value}
        aria-label={factorDescription(factor)}
      >
        <span className="gauge-center" aria-hidden="true" />
        <span
          className={`gauge-fill ${toWhite ? 'to-white' : 'to-black'}`}
          style={{ width: `${magnitude}%`, [toWhite ? 'right' : 'left']: '50%' }}
          aria-hidden="true"
        />
      </span>
      <span className="gauge-detail">{factor.detail ?? ''}</span>
    </li>
  );
}

/**
 * Tableau de lecture de position.
 *
 * Il repond a « qu'est-ce qui est important maintenant ? », la ou le panneau
 * du coach repond a « est-ce que mon dernier coup etait bon ? ». Les deux
 * restent volontairement separes.
 *
 * Il s'affiche immediatement a partir des calculs locaux ; les elements qui
 * dependent du moteur se completent quand l'analyse arrive.
 */
export function PositionDashboard(props: PositionDashboardProps): React.JSX.Element | null {
  const { insight } = props;
  const assessment = insight.assessment;
  if (!assessment) return null;

  return (
    <section
      className="dashboard"
      data-testid="position-dashboard"
      aria-label="Lecture de la position"
    >
      <header className="dashboard-head">
        <h2>Position</h2>
        <span className="dashboard-phase">{PHASE_LABEL[assessment.phase]}</span>
      </header>

      <ul className="gauges" data-testid="dashboard-gauges">
        {assessment.factors.map((factor) => (
          <FactorGauge key={factor.id} factor={factor} />
        ))}
      </ul>

      <h3 className="dashboard-title">À regarder</h3>
      <ul className="dashboard-list" data-testid="dashboard-critical">
        {assessment.critical.map((feature) => (
          <li key={feature.text} className={`critical-${feature.kind}`}>
            {isTacticalKind(feature.kind) ? <span aria-hidden="true">⚠ </span> : null}
            {feature.text}
          </li>
        ))}
      </ul>

      {assessment.swings.length > 0 ? (
        <details className="dashboard-swings" data-testid="dashboard-swings">
          <summary>Points de bascule</summary>
          <ul className="dashboard-list">
            {assessment.swings.map((swing) => (
              <li key={swing.text}>{swing.text}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {insight.plan ? (
        <>
          <h3 className="dashboard-title">Ton plan</h3>
          <p className="dashboard-plan" data-testid="dashboard-plan">
            {insight.plan.text}
          </p>
        </>
      ) : null}

      <div className="dashboard-actions">
        <button type="button" className="btn btn-small" onClick={insight.showWatch}>
          Que regarder ?
        </button>
        {insight.canRequestBestMove ? (
          <button
            type="button"
            className="btn btn-small"
            onClick={insight.requestBestMove}
            disabled={!insight.bestMoveAvailable}
            data-testid="show-best-move"
          >
            Voir le meilleur coup
          </button>
        ) : null}
        {insight.watch || insight.bestMoveRequested ? (
          <button type="button" className="btn btn-link btn-small" onClick={insight.clearHints}>
            Masquer
          </button>
        ) : null}
      </div>

      {insight.watch ? (
        <p className="dashboard-watch" data-testid="dashboard-watch" aria-live="polite">
          {insight.watch.text}
        </p>
      ) : null}

      {insight.bestMoveRequested ? (
        <div className="dashboard-best" data-testid="dashboard-best-move" aria-live="polite">
          {insight.bestMove ? (
            <>
              <p className="best-move-san">{insight.bestMove.san}</p>
              <p className="best-move-text">{insight.bestMove.text}</p>
              {insight.bestMoveAlternatives ? (
                <p className="best-move-alt">{insight.bestMoveAlternatives}</p>
              ) : null}
            </>
          ) : (
            <p className="best-move-text hint">
              {insight.bestMovePending
                ? POSITION_PHRASES.waitingForEngine()
                : POSITION_PHRASES.noBestMove()}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
