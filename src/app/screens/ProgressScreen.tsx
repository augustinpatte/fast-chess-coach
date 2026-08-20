import type { ProgressionState } from '@/types';
import { ESTIMATE_DISCLAIMER, estimateLevel, summarize } from '@/progression/estimate';
import { computePriority, recentStreak } from '@/progression/priority';
import { openingScore } from '@/progression/store';

export interface ProgressScreenProps {
  progression: ProgressionState;
  onBack: () => void;
}

/** Page de progression locale : indicateurs utiles et une seule priorite. */
export function ProgressScreen(props: ProgressScreenProps): React.JSX.Element {
  const games = props.progression.games;
  const stats = summarize(games);
  const estimate = estimateLevel(games);
  const priority = computePriority(games);
  const streak = recentStreak(games);

  const bestOpenings = Object.values(props.progression.openings)
    .filter((o) => o.games >= 3)
    .sort((a, b) => openingScore(b) - openingScore(a))
    .slice(0, 3);

  return (
    <div className="screen list-screen">
      <header className="list-head">
        <h1>Progression</h1>
        <button type="button" className="btn" onClick={props.onBack}>
          Retour
        </button>
      </header>

      <section className="panel priority">
        <h2>Priorité actuelle</h2>
        <p className="priority-text">{priority.text}</p>
      </section>

      <section className="panel">
        <h2>Niveau estimé dans l’application</h2>
        {estimate ? (
          <>
            <p className="estimate-value">{estimate.value}</p>
            <p className="hint">
              Basé sur {estimate.sample} partie{estimate.sample > 1 ? 's' : ''} · confiance{' '}
              {(estimate.confidence * 100).toFixed(0)}%.
            </p>
          </>
        ) : (
          <p className="hint">Joue quelques parties pour obtenir une estimation.</p>
        )}
        <p className="hint disclaimer">{ESTIMATE_DISCLAIMER}</p>
      </section>

      <section className="panel">
        <h2>Statistiques</h2>
        <ul className="kpi-list">
          <li>
            <span>Parties</span>
            <strong>{stats.games}</strong>
          </li>
          <li>
            <span>Résultats</span>
            <strong>
              {stats.wins}V / {stats.draws}N / {stats.losses}D
            </strong>
          </li>
          <li>
            <span>Niveau moyen affronté</span>
            <strong>{stats.averageOpponent}</strong>
          </li>
          <li>
            <span>Perte moyenne</span>
            <strong>{stats.averageCpLoss} cp</strong>
          </li>
          <li>
            <span>Pièces laissées en prise</span>
            <strong>{stats.hangingPieces}</strong>
          </li>
          <li>
            <span>Tactiques manquées</span>
            <strong>{stats.missedTactics}</strong>
          </li>
          <li>
            <span>Erreurs d’ouverture</span>
            <strong>{stats.openingMistakes}</strong>
          </li>
          <li>
            <span>Roques tardifs ou absents</span>
            <strong>{stats.lateCastles}</strong>
          </li>
          <li>
            <span>Défaites en partie longue</span>
            <strong>{stats.endgameLosses}</strong>
          </li>
          <li>
            <span>Série récente</span>
            <strong>{streak.length > 0 ? streak.join(' ') : '–'}</strong>
          </li>
        </ul>
      </section>

      {bestOpenings.length > 0 ? (
        <section className="panel">
          <h2>Ouvertures les plus efficaces</h2>
          <ul className="stat-list compact">
            {bestOpenings.map((o) => (
              <li key={o.openingId}>
                {o.openingName} — {(openingScore(o) * 100).toFixed(0)}% sur {o.games} parties
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
