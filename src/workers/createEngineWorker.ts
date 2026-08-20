/**
 * Fabrique du Web Worker Stockfish.
 *
 * Le binaire est servi depuis `public/engine/` (copie par
 * `scripts/setup-engine.mjs`). Le nom du fichier contient un hash, il est donc
 * lu dans `engine/manifest.json` plutot que code en dur.
 *
 * Aucune requete reseau externe : tout est servi par le serveur local.
 */

interface EngineManifest {
  loader: string;
  files: string[];
}

let manifestPromise: Promise<EngineManifest> | null = null;

function engineBase(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? `${base}engine/` : `${base}/engine/`;
}

async function loadManifest(): Promise<EngineManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${engineBase()}manifest.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Stockfish introuvable (${response.status}). Lance "npm run engine:setup".`,
          );
        }
        return response.json() as Promise<EngineManifest>;
      })
      .catch((error: unknown) => {
        manifestPromise = null;
        throw error instanceof Error ? error : new Error(String(error));
      });
  }
  return manifestPromise;
}

/** Cree un Worker classique executant Stockfish WebAssembly (mono-thread). */
export async function createEngineWorker(): Promise<Worker> {
  const manifest = await loadManifest();
  return new Worker(`${engineBase()}${manifest.loader}`);
}
