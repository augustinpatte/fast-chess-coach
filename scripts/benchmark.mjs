/**
 * Enregistre une analyse Stockfish reelle pour chaque position du banc d'essai.
 *
 * Le moteur ne tourne qu'ici : le resultat est fige dans
 * `src/tests/benchmarkAnalyses.json`, ce qui permet aux tests de verifier le
 * comportement du coach face a de vraies donnees MultiPV, sans dependre du
 * moteur ni de sa vitesse a l'execution.
 *
 * Usage : node scripts/benchmark.mjs [profondeur]
 */
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEPTH = Number(process.argv[2]) || 18;
const MULTI_PV = 3;

/** Copie le moteur sous une extension CommonJS : le projet est en ESM. */
function prepareEngine() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'public/engine/manifest.json'), 'utf8'));
  const loader = manifest.loader;
  const wasm = loader.replace(/\.js$/, '.wasm');
  const dir = mkdtempSync(join(tmpdir(), 'fcc-engine-'));
  copyFileSync(join(ROOT, 'public/engine', loader), join(dir, 'sf.cjs'));
  copyFileSync(join(ROOT, 'public/engine', wasm), join(dir, 'sf.wasm'));
  return { dir, entry: join(dir, 'sf.cjs') };
}

/** Extrait les positions du banc d'essai sans passer par TypeScript. */
function readBenchmark() {
  const source = readFileSync(join(ROOT, 'src/tests/benchmark.ts'), 'utf8');
  const entries = [];
  const pattern =
    /id:\s*'([^']+)',\s*\n\s*label:\s*'([^']*)',\s*\n\s*fen:\s*'([^']+)',\s*\n\s*perspective:\s*'([wb])'/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    entries.push({ id: match[1], label: match[2], fen: match[3], perspective: match[4] });
  }
  return entries;
}

function parseInfo(line) {
  if (!line.startsWith('info ') || line.includes(' currmove ') || line.startsWith('info string')) {
    return null;
  }
  const tokens = line.split(/\s+/);
  let depth = 0;
  let multipv = 1;
  let score = null;
  let pv = [];
  for (let i = 1; i < tokens.length; i += 1) {
    if (tokens[i] === 'depth') depth = Number(tokens[++i]) || 0;
    else if (tokens[i] === 'multipv') multipv = Number(tokens[++i]) || 1;
    else if (tokens[i] === 'score') {
      const kind = tokens[i + 1];
      const value = Number(tokens[i + 2]);
      if (kind === 'cp') score = { cp: value, mate: null };
      else if (kind === 'mate') score = { cp: null, mate: value };
      i += 2;
    } else if (tokens[i] === 'pv') {
      pv = tokens.slice(i + 1).filter((t) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t));
      break;
    }
  }
  return score ? { multipv, depth, score, pv } : null;
}

async function main() {
  const positions = readBenchmark();
  if (positions.length === 0) throw new Error('Aucune position lue dans benchmark.ts');
  const { dir, entry } = prepareEngine();
  const engine = spawn(process.execPath, [entry], { stdio: ['pipe', 'pipe', 'inherit'] });

  let buffer = '';
  const listeners = new Set();
  engine.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) for (const listener of listeners) listener(line.trim());
  });

  const send = (command) => engine.stdin.write(`${command}\n`);
  const waitFor = (predicate) =>
    new Promise((resolve) => {
      const listener = (line) => {
        const value = predicate(line);
        if (value !== undefined) {
          listeners.delete(listener);
          resolve(value);
        }
      };
      listeners.add(listener);
    });

  send('uci');
  await waitFor((line) => (line === 'uciok' ? true : undefined));
  send(`setoption name MultiPV value ${MULTI_PV}`);
  send('isready');
  await waitFor((line) => (line === 'readyok' ? true : undefined));

  const results = {};
  for (const position of positions) {
    const lines = new Map();
    let maxDepth = 0;
    const collect = (line) => {
      const info = parseInfo(line);
      if (info) {
        lines.set(info.multipv, info);
        maxDepth = Math.max(maxDepth, info.depth);
      }
    };
    listeners.add(collect);
    send('ucinewgame');
    send(`position fen ${position.fen}`);
    send(`go depth ${DEPTH}`);
    const bestMove = await waitFor((line) => {
      if (!line.startsWith('bestmove')) return undefined;
      const move = line.split(/\s+/)[1];
      return move && move !== '(none)' && move !== '0000' ? move : null;
    });
    listeners.delete(collect);

    results[position.id] = {
      fen: position.fen,
      bestMove,
      depth: maxDepth,
      elapsedMs: 0,
      lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv),
    };
    const top = results[position.id].lines[0];
    const score = top
      ? top.score.mate !== null
        ? `M${top.score.mate}`
        : `${(top.score.cp / 100).toFixed(2)}`
      : '?';
    console.info(`${position.id.padEnd(26)} ${String(bestMove).padEnd(6)} ${score}`);
  }

  send('quit');
  engine.kill();
  rmSync(dir, { recursive: true, force: true });

  writeFileSync(
    join(ROOT, 'src/tests/benchmarkAnalyses.json'),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  console.info(`\n${positions.length} positions enregistrees (profondeur ${DEPTH}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
