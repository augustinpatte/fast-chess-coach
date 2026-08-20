#!/usr/bin/env node
/**
 * Genere LICENSES.md a partir des dependances reellement installees.
 * Aucun appel reseau : tout est lu dans node_modules.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function read(name) {
  const file = join(root, 'node_modules', name, 'package.json');
  if (!existsSync(file)) return null;
  const meta = JSON.parse(readFileSync(file, 'utf8'));
  return {
    name,
    version: meta.version ?? '?',
    license: typeof meta.license === 'string' ? meta.license : (meta.license?.type ?? 'voir le paquet'),
    homepage: meta.homepage ?? meta.repository?.url ?? '',
  };
}

const rows = (deps) =>
  Object.keys(deps ?? {})
    .sort()
    .map(read)
    .filter(Boolean)
    .map((d) => `| \`${d.name}\` | ${d.version} | ${d.license} |`)
    .join('\n');

const content = `# Licences des dépendances

Généré par \`npm run licenses\` à partir de \`node_modules\`.

## Application

**Fast Chess Coach** — licence MIT.

## Moteur d'échecs

Le moteur **Stockfish** (build WebAssembly \`stockfish.js\` de Chess.com / nmrugg)
est distribué sous **GPL v3**. Il est chargé tel quel, sans modification, dans un
Web Worker depuis \`public/engine/\`. Le texte complet de la licence est fourni
dans \`node_modules/stockfish/Copying.txt\`.

> Conséquence pratique : si tu redistribues une version compilée de cette
> application, tu dois respecter les obligations de la GPL v3 pour la partie
> Stockfish (mise à disposition des sources du moteur).

Les pièces d'échecs affichées proviennent de \`react-chessboard\` (jeu Cburnett,
domaine public / CC BY-SA 3.0 selon la source d'origine).

## Dépendances d'exécution

| Paquet | Version | Licence |
| --- | --- | --- |
${rows(pkg.dependencies)}

## Dépendances de développement

| Paquet | Version | Licence |
| --- | --- | --- |
${rows(pkg.devDependencies)}
`;

writeFileSync(join(root, 'LICENSES.md'), content);
console.log('[licenses] LICENSES.md mis a jour');
