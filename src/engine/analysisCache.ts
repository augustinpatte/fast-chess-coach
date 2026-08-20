import type { AnalysisResult } from '@/types';

/**
 * Cache LRU d'analyses, indexe par FEN + parametres de recherche.
 * Taille bornee pour ne jamais faire grossir la memoire indefiniment.
 */
export class AnalysisCache {
  private readonly map = new Map<string, AnalysisResult>();

  constructor(private readonly maxEntries = 200) {}

  static key(fen: string, multiPV: number, depth: number, movetime: number): string {
    return `${fen}|${multiPV}|${depth}|${movetime}`;
  }

  get(key: string): AnalysisResult | undefined {
    const value = this.map.get(key);
    if (value) {
      // Reinsertion : marque l'entree comme recemment utilisee.
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: string, value: AnalysisResult): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
