// Copies the GPL-3.0 engine builds from node_modules into public/engines at build time.
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
const out = 'public/engines';
mkdirSync(`${out}/fsf`, { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'])
  copyFileSync(`node_modules/stockfish/bin/${f}`, `${out}/${f}`);
copyFileSync('node_modules/stockfish/Copying.txt', `${out}/STOCKFISH-COPYING.txt`);
for (const f of ['stockfish.js', 'stockfish.wasm', 'stockfish.worker.js', 'Copying.txt', 'AUTHORS'])
  copyFileSync(`node_modules/fairy-stockfish-nnue.wasm/${f}`, `${out}/fsf/${f}`);
writeFileSync(`${out}/SOURCES.txt`, [
  'Engines distributed with JY Games (GNU GPL v3):',
  'Stockfish 19 (stockfish.js lite single-threaded build by Chess.com / Nathan Rugg) — source: https://github.com/nmrugg/stockfish.js , upstream https://github.com/official-stockfish/Stockfish',
  'Fairy-Stockfish WASM 1.1.12 (Fabian Fichter) — source: https://github.com/fairy-stockfish/fairy-stockfish.wasm , upstream https://github.com/fairy-stockfish/Fairy-Stockfish',
  'JY Games complete corresponding source: https://github.com/yangchijung/jytrvl-chess',
  '',
].join('\n'));
console.log('engines copied');
