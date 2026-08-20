/**
 * Mise en forme des explications du coach.
 *
 * Contrainte produit stricte : 2 phrases maximum, 2 lignes maximum.
 * Ces fonctions sont la seule porte de sortie des textes pedagogiques :
 * tout ce qui est affiche passe par `formatCoachText`.
 */

/**
 * Longueur maximale du texte du coach.
 *
 * Calibree par mesure directe dans le navigateur : c'est la longueur qui tient
 * en deux lignes sur un ecran normal (>= 390 px de large) avec la taille de
 * police mobile, tout en laissant la place a deux phrases completes.
 */
export const MAX_COACH_CHARS = 110;

/** Decoupe un texte en phrases (`.`, `!`, `?`). */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Nombre de phrases d'un texte. */
export function countSentences(text: string): number {
  return splitSentences(text).length;
}

/** Nombre de lignes d'un texte (retours a la ligne explicites). */
export function countLines(text: string): number {
  return text.split('\n').filter((l) => l.trim().length > 0).length;
}

function ensureFinalPunctuation(sentence: string): string {
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

/**
 * Longueur maximale d'une explication de coup.
 *
 * Elle dispose d'un peu plus de place que le coach : l'explication du meilleur
 * coup est lue a la demande, jamais entre deux coups joues rapidement.
 */
export const MAX_EXPLANATION_CHARS = 150;

/**
 * Assemble au maximum deux phrases, sans retour a la ligne, et borne la
 * longueur totale.
 */
export function formatSentences(parts: readonly string[], maxChars: number): string {
  const sentences: string[] = [];
  for (const part of parts) {
    for (const sentence of splitSentences(part)) {
      if (sentences.length >= 2) break;
      sentences.push(ensureFinalPunctuation(sentence));
    }
    if (sentences.length >= 2) break;
  }
  if (sentences.length === 0) return '';

  let text = sentences.join(' ');
  if (text.length > maxChars) {
    // On preserve d'abord la premiere phrase, la plus importante.
    const first = sentences[0];
    text = first.length <= maxChars ? first : truncate(first, maxChars);
  }
  return text;
}

/**
 * Assemble au maximum deux phrases, sans retour a la ligne, et borne la
 * longueur totale pour tenir en deux lignes.
 */
export function formatCoachText(parts: readonly string[]): string {
  return formatSentences(parts, MAX_COACH_CHARS);
}

/** Tronque proprement sur une frontiere de mot. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[ ,;:.]+$/, '')}…`;
}

/** Verifie qu'un texte respecte la contrainte produit. */
export function respectsCoachLimits(text: string): boolean {
  return countSentences(text) <= 2 && countLines(text) <= 2 && text.length <= MAX_COACH_CHARS;
}

/** Verifie qu'une explication de coup respecte la contrainte produit. */
export function respectsExplanationLimits(text: string): boolean {
  return countSentences(text) <= 2 && countLines(text) <= 2 && text.length <= MAX_EXPLANATION_CHARS;
}
