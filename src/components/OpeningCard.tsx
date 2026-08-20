import type { OpeningEntry } from '@/types';

export interface OpeningCardProps {
  opening: OpeningEntry;
  selected: boolean;
  onSelect: (id: string) => void;
}

/** Carte compacte : nom, style, difficulte, objectif. Jamais un cours. */
export function OpeningCard(props: OpeningCardProps): React.JSX.Element {
  const { opening } = props;
  return (
    <button
      type="button"
      className={`opening-card ${props.selected ? 'selected' : ''}`}
      onClick={() => props.onSelect(opening.id)}
      aria-pressed={props.selected}
    >
      <span className="opening-name">{opening.name}</span>
      <span className="opening-tags">
        <span className={`tag style-${opening.style}`}>{opening.style}</span>
        <span className="tag">{opening.difficulty}</span>
      </span>
      <span className="opening-goal">{opening.goal}</span>
    </button>
  );
}
