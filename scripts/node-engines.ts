/// <reference types="node" />
// Node transports for the same WASM engines the browser uses — for automated AI tests & difficulty ladder.
import { createRequire } from 'node:module';
import { UciClient, type UciTransport } from '../shared/ai/uci';

const require = createRequire(import.meta.url);

export async function nodeStockfish(): Promise<UciClient> {
  const init = require('stockfish');
  const engine = await init('lite-single');
  const listeners: ((l: string) => void)[] = [];
  engine.listener = (l: string) => listeners.forEach((f) => f(l));
  const t: UciTransport = { send: (c) => engine.sendCommand(c), onLine: (cb) => listeners.push(cb) };
  return new UciClient(t, []);
}

export async function nodeFairyStockfish(): Promise<{ client: UciClient; terminate: () => void }> {
  // emscripten 2.x build: Node 18+ global fetch confuses its loader, so hide it while loading.
  const savedFetch = globalThis.fetch;
  // @ts-expect-error intentional
  delete globalThis.fetch;
  const Factory = require('fairy-stockfish-nnue.wasm/stockfish.js');
  const sf = await Factory();
  globalThis.fetch = savedFetch;
  const listeners: ((l: string) => void)[] = [];
  sf.addMessageListener((l: string) => listeners.forEach((f) => f(l)));
  const t: UciTransport = { send: (c) => sf.postMessage(c), onLine: (cb) => listeners.push(cb) };
  return { client: new UciClient(t, ['setoption name UCI_Variant value xiangqi']), terminate: () => sf.terminate() };
}
