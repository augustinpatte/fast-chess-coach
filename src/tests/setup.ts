import '@testing-library/jest-dom/vitest';

/**
 * Sous Node 22+, un global experimental `localStorage` masque celui de jsdom :
 * on installe donc une implementation memoire minimale, suffisante et
 * deterministe pour les tests de persistance.
 */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

function installStorage(target: object, name: 'localStorage' | 'sessionStorage'): void {
  const holder = target as Record<string, unknown>;
  if (holder[name] === undefined || holder[name] === null) {
    Object.defineProperty(target, name, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}

installStorage(globalThis, 'localStorage');
installStorage(globalThis, 'sessionStorage');
if (typeof window !== 'undefined') {
  installStorage(window, 'localStorage');
  installStorage(window, 'sessionStorage');
}

// jsdom ne fournit pas matchMedia : les reglages de theme en dependent.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/**
 * jsdom ne calcule aucune mise en page : `getBoundingClientRect` renvoie
 * toujours une taille nulle. react-chessboard mesure la largeur d'une case
 * pour animer les pieces et leve une erreur si elle vaut zero. On fournit donc
 * une taille plausible aux seules cases de l'echiquier, ce qui permet de tester
 * une partie complete (un coup change la position, donc declenche l'animation).
 */
const originalRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
  const rect = originalRect.call(this);
  if (rect.width === 0 && this instanceof HTMLElement && this.id.includes('-square-')) {
    return new DOMRect(0, 0, 60, 60);
  }
  return rect;
};
