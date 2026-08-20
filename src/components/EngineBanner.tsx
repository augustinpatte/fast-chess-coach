import { useCallback, useSyncExternalStore } from 'react';
import { getEngine } from '@/engine/engineInstance';

/**
 * Bandeau discret indiquant l'etat de Stockfish.
 * Il n'apparait que pendant le chargement ou en cas d'erreur.
 */
export function EngineBanner(): React.JSX.Element | null {
  const subscribe = useCallback(
    (notify: () => void) => getEngine().onStatusChange(() => notify()),
    [],
  );
  const status = useSyncExternalStore(
    subscribe,
    () => getEngine().getStatus(),
    () => 'idle' as const,
  );
  const error = status === 'error' ? getEngine().getLastError() : null;

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="engine-banner" role="status">
        Chargement du moteur Stockfish…
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="engine-banner error" role="alert">
        Moteur indisponible{error ? ` : ${error}` : ''}. Lance « npm run engine:setup » puis
        recharge la page.
      </div>
    );
  }
  return null;
}
