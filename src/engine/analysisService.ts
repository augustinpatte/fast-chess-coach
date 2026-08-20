import type { AnalysisResult } from '@/types';
import { analysisCache, getEngine } from './engineInstance';
import { AnalysisCache } from './analysisCache';

/** Reglage « pleine force » : indispensable pour l'analyse pedagogique. */
export const FULL_STRENGTH = { limitStrength: false, elo: 3190, skillLevel: 20 } as const;

export interface AnalyzeParams {
  fen: string;
  multiPV: number;
  movetime: number;
  depth?: number;
  /** Reglages de force appliques avant la recherche. */
  strength: { limitStrength: boolean; elo: number; skillLevel: number };
  /** Etiquette de cache : deux forces differentes ne partagent pas leurs resultats. */
  tag: string;
}

/**
 * Lance une analyse en passant par le cache local.
 *
 * La force du moteur est reglee juste avant la recherche : les analyses
 * pedagogiques tournent toujours a pleine force, meme quand l'adversaire joue
 * a 600 Elo.
 */
export async function analyzePosition(params: AnalyzeParams): Promise<AnalysisResult> {
  const key = `${params.tag}|${AnalysisCache.key(
    params.fen,
    params.multiPV,
    params.depth ?? 0,
    params.movetime,
  )}`;
  const cached = analysisCache.get(key);
  if (cached) return cached;

  const engine = getEngine();
  await engine.applyStrength(params.strength);
  const result = await engine.analyze({
    fen: params.fen,
    multiPV: params.multiPV,
    movetime: params.movetime,
    depth: params.depth,
  });
  analysisCache.set(key, result);
  return result;
}

/** Vide le cache d'analyses (bouton des reglages). */
export function clearAnalysisCache(): void {
  analysisCache.clear();
}

/** Taille courante du cache. */
export function analysisCacheSize(): number {
  return analysisCache.size;
}
