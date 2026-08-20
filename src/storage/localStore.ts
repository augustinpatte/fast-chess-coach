/**
 * Acces typé et tolerant au localStorage.
 *
 * Toutes les donnees restent sur la machine : aucune requete reseau,
 * aucun compte, aucune synchronisation.
 */

const PREFIX = 'fcc';

export const STORAGE_KEYS = {
  settings: `${PREFIX}.settings.v1`,
  progression: `${PREFIX}.progression.v1`,
  setup: `${PREFIX}.setup.v1`,
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    // Mode navigation privee tres restrictif.
    return null;
  }
}

/** Lit une valeur ; renvoie `fallback` si absente ou corrompue. */
export function readJson<T>(key: string, fallback: T): T {
  const store = storage();
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Ecrit une valeur ; renvoie false si le stockage est indisponible ou plein. */
export function writeJson(key: string, value: unknown): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Supprime une cle. */
export function removeKey(key: string): void {
  storage()?.removeItem(key);
}

/** Efface toutes les donnees de l'application (bouton des reglages). */
export function clearAll(): void {
  const store = storage();
  if (!store) return;
  for (const key of Object.values(STORAGE_KEYS)) store.removeItem(key);
}

/** Taille approximative occupee par l'application, en octets. */
export function approximateUsage(): number {
  const store = storage();
  if (!store) return 0;
  let total = 0;
  for (const key of Object.values(STORAGE_KEYS)) {
    total += (store.getItem(key)?.length ?? 0) * 2;
  }
  return total;
}
