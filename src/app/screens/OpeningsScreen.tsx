import type { OpeningStat, ProgressionState } from '@/types';
import { getOpeningById } from '@/openings/book';
import {
  MIN_GAMES_FOR_RECOMMENDATION,
  openingAverageEval,
  openingRecommendation,
  openingScore,
} from '@/progression/store';

export interface OpeningsScreenProps {
  progression: ProgressionState;
  onBack: () => void;
  onSetPreference: (openingId: string, preference: OpeningStat['preference']) => void;
}

/** Ecran « Mes ouvertures » : comparatif simple, sans prétention statistique. */
export function OpeningsScreen(props: OpeningsScreenProps): React.JSX.Element {
  const stats = Object.values(props.progression.openings).sort((a, b) => b.games - a.games);

  return (
    <div className="screen list-screen">
      <header className="list-head">
        <h1>Mes ouvertures</h1>
        <button type="button" className="btn" onClick={props.onBack}>
          Retour
        </button>
      </header>

      {stats.length === 0 ? (
        <p className="hint">
          Aucune ouverture jouée pour l’instant. Lance une partie en mode « Tester une ouverture ».
        </p>
      ) : null}

      <ul className="stat-list">
        {stats.map((stat) => {
          const opening = getOpeningById(stat.openingId);
          const avgEval = openingAverageEval(stat);
          const avgMistakes = stat.games === 0 ? 0 : stat.totalOpeningMistakes / stat.games;
          return (
            <li key={stat.openingId} className="stat-card">
              <div className="stat-head">
                <strong>{stat.openingName}</strong>
                <span className="badge">
                  {stat.games} partie{stat.games > 1 ? 's' : ''}
                </span>
              </div>
              <p className="stat-line">
                {stat.wins}V / {stat.draws}N / {stat.losses}D · score{' '}
                {(openingScore(stat) * 100).toFixed(0)}% · {avgMistakes.toFixed(1)} erreur(s)
                d’ouverture par partie
                {avgEval === null
                  ? ''
                  : ` · éval. moyenne après 10 coups ${(avgEval / 100).toFixed(1)}`}
              </p>
              <p className="stat-reco">{openingRecommendation(stat)}</p>
              {stat.games < MIN_GAMES_FOR_RECOMMENDATION ? (
                <p className="hint">
                  Il faut au moins {MIN_GAMES_FOR_RECOMMENDATION} parties pour une recommandation
                  fiable.
                </p>
              ) : null}
              {opening ? <p className="hint">{opening.goal}</p> : null}
              <div className="pref-row" role="group" aria-label="Mon appréciation">
                {(
                  [
                    ['like', 'J’aime'],
                    ['neutral', 'Neutre'],
                    ['dislike', 'Je n’aime pas'],
                  ] as Array<[NonNullable<OpeningStat['preference']>, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`chip ${stat.preference === value ? 'selected' : ''}`}
                    aria-pressed={stat.preference === value}
                    onClick={() => props.onSetPreference(stat.openingId, value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
