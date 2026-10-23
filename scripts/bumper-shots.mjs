// Crazy Bumper — screenshots of the title, playing and result screens at iPad (1024×768) and phone (390×844)
// sizes, plus an optional deterministic 10 s gameplay video: the game is paused and hand-stepped with the
// __bumper.ff hook (1/30 s per frame), so the recording does not depend on how fast the renderer is.
// Usage: node scripts/bumper-shots.mjs <baseUrl> [outDir] [--video]
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8794';
const OUT = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : '/tmp/claude-0/bumper-shots';
const VIDEO = process.argv.includes('--video');
mkdirSync(OUT, { recursive: true });
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args });

async function open(size, query = '') {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${BASE}/bumper${query}`);
  await p.waitForFunction(() => document.querySelector('[data-testid=bumper]')?.dataset.state === 'ready', null, { timeout: 60000 });
  return { ctx, p, errors };
}
const info = (p) => p.evaluate(() => ({ ...window.__bumper.info(), stats: { ...window.__GAME_STATS__, consoleErrors: window.__GAME_STATS__.consoleErrors.length } }));

for (const [name, size] of [
  ['ipad', { width: 1024, height: 768 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const { ctx, p, errors } = await open(size, '?round=8');
  await p.waitForTimeout(2500); // the title orbit with the cars bumping
  await p.screenshot({ path: `${OUT}/${name}-title.png` });
  console.log(name, 'title', JSON.stringify(await info(p)));
  await p.click('[data-testid=bumper-start]');
  // drive with the keyboard for a few seconds
  await p.keyboard.down('KeyW');
  for (let i = 0; i < 8; i++) {
    await p.keyboard.down(i % 2 ? 'KeyA' : 'KeyD');
    await p.waitForTimeout(350);
    await p.keyboard.up(i % 2 ? 'KeyA' : 'KeyD');
    if (i === 2) await p.keyboard.press('Space');
  }
  await p.keyboard.up('KeyW');
  await p.screenshot({ path: `${OUT}/${name}-playing.png` });
  console.log(name, 'playing', JSON.stringify(await info(p)));
  await p.waitForFunction(() => window.__GAME_STATS__.phase === 'result', null, { timeout: 120000 });
  await p.waitForSelector('[data-testid=bumper-again]');
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `${OUT}/${name}-result.png` });
  console.log(name, 'result', JSON.stringify(await info(p)), 'errors', errors);
  await ctx.close();
}

if (VIDEO) {
  const frames = `${OUT}/frames`;
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const { ctx, p } = await open({ width: 1024, height: 768 }, '?round=60');
  await p.click('[data-testid=bumper-start]');
  await p.evaluate(() => window.__bumper.setPaused(true));
  const FPS = 30;
  for (let f = 0; f < 10 * FPS; f++) {
    const t = f / FPS;
    // a scripted drive: sweep the stick round in a slow figure, dash every 3 s
    const a = Math.sin(t * 0.9) * 2.2 + t * 0.35;
    const input = { x: Math.sin(a), y: Math.cos(a), thrust: 1, dash: f % (3 * FPS) === 15 };
    await p.evaluate((i) => window.__bumper.ff(1 / 30, i), input);
    await p.screenshot({ path: `${frames}/${String(f).padStart(4, '0')}.png` });
  }
  console.log('video', JSON.stringify(await info(p)));
  await ctx.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}/%04d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', `${OUT}/bumper-p1-10s.mp4`]);
  console.log('wrote', `${OUT}/bumper-p1-10s.mp4`);
}
await browser.close();
