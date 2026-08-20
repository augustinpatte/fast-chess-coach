import { createEngineWorker } from '@/workers/createEngineWorker';
import { StockfishEngine } from './StockfishEngine';
import { AnalysisCache } from './analysisCache';

/**
 * Instance unique de Stockfish pour toute l'application.
 * Un seul Worker est cree, quelle que soit la navigation entre les ecrans.
 */
let instance: StockfishEngine | null = null;

export function getEngine(): StockfishEngine {
  if (!instance) {
    instance = new StockfishEngine(createEngineWorker, { threads: 1, hashMb: 32 });
  }
  return instance;
}

/** Detruit le Worker (utile lors du dechargement de la page). */
export function disposeEngine(): void {
  instance?.dispose();
  instance = null;
}

/** Cache d'analyses partage (200 positions maximum). */
export const analysisCache = new AnalysisCache(200);
