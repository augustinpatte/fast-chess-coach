#!/usr/bin/env node
/**
 * Copie le build Stockfish WebAssembly mono-thread depuis node_modules vers public/engine.
 *
 * On ne prend QUE la variante "lite-single" :
 *  - "lite"   : reseau NNUE reduit embarque -> fichier plus petit, RAM plus faible
 *  - "single" : mono-thread -> pas besoin de SharedArrayBuffer ni d'en-tetes COOP/COEP
 *
 * Le fichier est ensuite charge par un Web Worker classique (voir src/engine/worker.ts).
 * Aucun telechargement reseau n'est effectue au runtime : tout est servi en local.
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = join(root, 'public', 'engine');
const pkgDir = join(root, 'node_modules', 'stockfish');

/** Parcours recursif d'un dossier. */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

if (!existsSync(pkgDir)) {
  console.warn('[engine] node_modules/stockfish absent : execute `npm install` puis `npm run engine:setup`.');
  process.exit(0);
}

const all = walk(pkgDir);
const wanted = all.filter((f) => /lite-single/.test(f) && /\.(js|wasm)$/.test(f));

if (wanted.length === 0) {
  console.error('[engine] Aucun build "lite-single" trouve dans node_modules/stockfish.');
  process.exit(1);
}

if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let total = 0;
const copied = [];
for (const file of wanted) {
  const name = file.split('/').pop();
  copyFileSync(file, join(outDir, name));
  const size = statSync(file).size;
  total += size;
  copied.push({ name, size });
}

const loader = copied.find((f) => f.name.endsWith('.js'));
if (!loader) {
  console.error('[engine] Loader .js introuvable.');
  process.exit(1);
}

// Manifeste consomme par le worker : evite de coder en dur un nom de fichier hashe.
writeFileSync(
  join(outDir, 'manifest.json'),
  JSON.stringify({ loader: loader.name, files: copied.map((f) => f.name) }, null, 2) + '\n',
);

console.log(
  `[engine] ${copied.length} fichier(s) copie(s) dans public/engine (${(total / 1024 / 1024).toFixed(1)} Mo) - loader: ${loader.name}`,
);
