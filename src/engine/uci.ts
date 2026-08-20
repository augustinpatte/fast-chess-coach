import type { EngineLine, EngineScore } from '@/types';

/**
 * Analyse d'une ligne `info` UCI.
 * Exemple :
 *   info depth 12 seldepth 18 multipv 1 score cp 34 nodes 1234 pv e2e4 e7e5 g1f3
 *
 * Retourne null si la ligne ne contient pas d'information exploitable
 * (pas de score, ou ligne de type `info string` / `currmove`).
 */
export function parseInfoLine(line: string): EngineLine | null {
  if (!line.startsWith('info ')) return null;
  if (line.includes(' currmove ')) return null;
  if (line.startsWith('info string')) return null;

  const tokens = line.split(/\s+/);
  let depth = 0;
  let multipv = 1;
  let score: EngineScore | null = null;
  let pv: string[] = [];

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === 'depth') {
      depth = Number(tokens[i + 1]) || 0;
      i += 1;
    } else if (token === 'multipv') {
      multipv = Number(tokens[i + 1]) || 1;
      i += 1;
    } else if (token === 'score') {
      const kind = tokens[i + 1];
      const value = Number(tokens[i + 2]);
      if (kind === 'cp' && Number.isFinite(value)) score = { cp: value, mate: null };
      else if (kind === 'mate' && Number.isFinite(value)) score = { cp: null, mate: value };
      i += 2;
    } else if (token === 'pv') {
      pv = tokens.slice(i + 1).filter((t) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t));
      break;
    }
  }

  if (!score) return null;
  return { multipv, depth, score, pv };
}

/** Extrait le coup de `bestmove e2e4 ponder e7e5`. Renvoie null pour `(none)`. */
export function parseBestMove(line: string): string | null {
  if (!line.startsWith('bestmove')) return null;
  const move = line.split(/\s+/)[1];
  if (!move || move === '(none)' || move === '0000') return null;
  return move;
}

/** true si la ligne signale que le moteur est pret. */
export function isReadyOk(line: string): boolean {
  return line.trim() === 'readyok';
}

/** true si la ligne cloture la phase d'identification UCI. */
export function isUciOk(line: string): boolean {
  return line.trim() === 'uciok';
}

/**
 * Convertit un score du point de vue du trait en score du point de vue des
 * blancs. Indispensable pour la barre d'evaluation.
 */
export function scoreToWhitePov(score: EngineScore, turn: 'w' | 'b'): EngineScore {
  if (turn === 'w') return score;
  return {
    cp: score.cp === null ? null : -score.cp,
    mate: score.mate === null ? null : -score.mate,
  };
}

/** Borne utilisee pour convertir un mat en centipions comparables. */
export const MATE_CP = 10000;

/**
 * Convertit un score (cp ou mat) en une valeur numerique unique, utilisable
 * pour comparer deux coups. Un mat proche vaut plus qu'un mat lointain.
 */
export function scoreToCp(score: EngineScore): number {
  if (score.mate !== null) {
    const sign = score.mate >= 0 ? 1 : -1;
    return sign * (MATE_CP - Math.min(Math.abs(score.mate), 50) * 100);
  }
  return score.cp ?? 0;
}

/** Formate un score pour l'affichage ("+1.2", "-0.4", "M3", "-M2"). */
export function formatScore(score: EngineScore): string {
  if (score.mate !== null) {
    return score.mate >= 0 ? `M${score.mate}` : `-M${Math.abs(score.mate)}`;
  }
  const cp = score.cp ?? 0;
  const pawns = cp / 100;
  const sign = pawns > 0 ? '+' : pawns < 0 ? '' : '';
  return `${sign}${pawns.toFixed(1)}`;
}

/**
 * Convertit une evaluation (point de vue des blancs) en pourcentage
 * d'avantage blanc pour la barre, entre 2 et 98 pour rester lisible.
 */
export function scoreToBarPercent(score: EngineScore): number {
  if (score.mate !== null) return score.mate > 0 ? 100 : 0;
  const cp = score.cp ?? 0;
  // Courbe logistique : compresse les gros avantages.
  const percent = 100 / (1 + Math.exp(-cp / 380));
  return Math.max(2, Math.min(98, percent));
}
