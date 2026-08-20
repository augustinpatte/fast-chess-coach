import { useEffect, useRef } from 'react';
import type { MoveRecord } from '@/types';
import { sanToFrench } from '@/chess/pieces';
import { QUALITY_TONE } from '@/coaching/phrases';

export interface MoveListProps {
  moves: readonly MoveRecord[];
}

/** Historique des coups, en notation algebrique francaise. */
export function MoveList(props: MoveListProps): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // jsdom n'implemente pas scrollIntoView : on verifie sa presence.
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [props.moves.length]);

  const rows: Array<{ number: number; white: MoveRecord | null; black: MoveRecord | null }> = [];
  for (let i = 0; i < props.moves.length; i += 2) {
    rows.push({
      number: i / 2 + 1,
      white: props.moves[i] ?? null,
      black: props.moves[i + 1] ?? null,
    });
  }

  return (
    <div className="movelist" data-testid="move-list">
      <table>
        <caption className="sr-only">Historique des coups</caption>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="movelist-empty" colSpan={3}>
                Aucun coup joué.
              </td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={row.number}>
              <th scope="row">{row.number}.</th>
              <td>{row.white ? <MoveCell move={row.white} /> : null}</td>
              <td>{row.black ? <MoveCell move={row.black} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div ref={endRef} />
    </div>
  );
}

function MoveCell({ move }: { move: MoveRecord }): React.JSX.Element {
  const tone = move.feedback ? QUALITY_TONE[move.feedback.quality] : null;
  return (
    <span className="move-cell">
      {sanToFrench(move.san)}
      {tone && tone !== 'good' ? (
        <span className={`move-flag tone-${tone}`} aria-label={move.feedback?.qualityLabel}>
          {tone === 'bad' ? '??' : '?!'}
        </span>
      ) : null}
    </span>
  );
}
