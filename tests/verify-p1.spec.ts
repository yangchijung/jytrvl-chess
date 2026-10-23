/**
 * 瘋狂碰碰車 Crazy Bumper — P1 browser verification (spec section 8).
 *
 * Written before the game exists, so it fails until /bumper ships. Run with:
 *   npm run test:bumper                       (against BUMPER_URL, default http://127.0.0.1:8788)
 *   BUMPER_URL=https://chess.jytrvl.com npm run test:bumper
 *
 * ASSUMPTIONS (James: change any of these and the constants below follow):
 *  1. Route is /bumper, a full-screen page like /taxi with no site header/footer around it.
 *  2. Selectors: game root [data-testid=bumper], start [data-testid=bumper-start] (text 開始遊戲),
 *     replay [data-testid=bumper-again] (text 再玩一次), dash [data-testid=bumper-dash],
 *     left joystick zone [data-testid=bumper-stick].
 *  3. window.__GAME_STATS__ exists from first paint (phase 'title') and is updated every frame.
 *     avgFps is the game's own running average over the current round.
 *  4. `?round=12` sets the round length in seconds; without it a round is 60 s, so the 10 s play
 *     test never reaches the result screen.
 *  5. Keyboard: W/↑ accelerate, A/D or ←/→ turn, Space dash (2.5 s cooldown). The play script
 *     dashes every 3 s (4 presses in 10 s) and expects at least 3 to register.
 *  6. "Moved significantly" = horizontal (x/z) distance from the start point >= BUMPER_MIN_MOVE
 *     world units (default 5). Max distance over the run counts, not only the final position.
 *  7. totalCollisions counts any impact the game counts (AI cars, bumper posts, walls); a 10 s
 *     scripted drive must hit at least one thing.
 *  8. Touch targets: every visible button, [role=button], a[href], [data-touch-zone] and the joystick
 *     zone must be >= 64 × 64 px. The dash button must be 88 × 88 (±2 px). The ⚡ glyph and the
 *     radial cooldown are not asserted (icon may be SVG; check visually in the screenshots).
 *  9. Joystick is visible while playing on touch viewports (both projects set hasTouch).
 * 10. Chinese characters = /[一-鿿]/ in text nodes whose element is rendered (checkVisibility with
 *     opacity/visibility), larger than 1 × 1 px (skips sr-only text), and not inside aria-hidden.
 *     aria-label/alt text is not counted. Limits: title <= 6 and contains 開始遊戲, result <= 6 and
 *     contains 再玩一次, playing = 0.
 * 11. Headless Chromium renders WebGL through SwiftShader (CPU), so 50 fps is hard for a real 3D
 *     scene. The floor is BUMPER_MIN_FPS (default 50); the measured value is printed and written to
 *     artifacts/p1-<project>-fps.json either way.
 * 12. Any console 'error' message or 'pageerror' fails the test, including failed resource loads.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';

interface GameStats {
  phase: 'title' | 'playing' | 'result';
  fps: number;
  avgFps: number;
  frameCount: number;
  playerPosition: { x: number; y: number; z: number };
  playerScore: number;
  totalCollisions: number;
  dashCount: number;
  activePowerUp: string | null;
  consoleErrors: string[];
}

declare global {
  interface Window {
    __GAME_STATS__?: GameStats;
  }
}

const ROUTE = '/bumper';
const MIN_FPS = Number(process.env.BUMPER_MIN_FPS ?? 50);
const MIN_MOVE = Number(process.env.BUMPER_MIN_MOVE ?? 5);
const PLAY_MS = 10_000;
const DASH_EVERY_MS = 3_000;
const SHORT_ROUND_S = 12;
const MIN_TARGET_PX = 64;
const DASH_PX = 88;
const MAX_CJK = 6;
const ARTIFACTS = 'artifacts';

const SEL = {
  root: '[data-testid=bumper]',
  start: '[data-testid=bumper-start]',
  again: '[data-testid=bumper-again]',
  dash: '[data-testid=bumper-dash]',
  stick: '[data-testid=bumper-stick]',
} as const;

/** Collects console errors and uncaught page errors; any entry fails the test at teardown. */
const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
      });
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
      await use(errors);
      expect(errors, 'Browser reported errors during the test').toEqual([]);
    },
    { auto: true },
  ],
});

async function stats(page: Page): Promise<GameStats> {
  const s = await page.evaluate(() => window.__GAME_STATS__ ?? null);
  if (!s) throw new Error('window.__GAME_STATS__ is missing');
  return s;
}

async function openGame(page: Page, query = '') {
  await page.goto(ROUTE + query);
  await expect(
    page.locator(SEL.root),
    `Game root ${SEL.root} not found at ${ROUTE}. Is the Crazy Bumper route built and deployed?`,
  ).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => page.evaluate(() => window.__GAME_STATS__?.phase ?? 'missing'), {
      message: 'window.__GAME_STATS__ should exist and report phase "title" on load',
    })
    .toBe('title');
}

async function startGame(page: Page) {
  const start = page.locator(SEL.start);
  await expect(start, 'Start button should be visible on the title screen').toBeVisible();
  await expect(start).toHaveText(/開始遊戲/);
  await start.click();
  await expect
    .poll(async () => (await stats(page)).phase, { message: 'Clicking 開始遊戲 should enter "playing"' })
    .toBe('playing');
}

/** Counts Chinese characters in rendered, non-aria-hidden text nodes of the document body. */
async function visibleCjk(page: Page): Promise<{ count: number; text: string }> {
  return page.evaluate(() => {
    const re = /[一-鿿]/g;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let count = 0;
    const parts: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      const text = n.textContent ?? '';
      if (!el || !re.test(text)) continue;
      re.lastIndex = 0;
      if (el.closest('script,style,noscript,template,[aria-hidden="true"]')) continue;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      const hits = text.match(re) ?? [];
      count += hits.length;
      parts.push(hits.join(''));
    }
    return { count, text: parts.join(' ') };
  });
}

/** Returns every visible interactive element smaller than the minimum touch size. */
async function smallTargets(page: Page, min: number) {
  return page.evaluate(
    ({ min, stick }) => {
      const sel = `button,[role=button],a[href],[data-touch-zone],${stick}`;
      const out: { what: string; w: number; h: number }[] = [];
      let checked = 0;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        checked++;
        if (r.width < min || r.height < min) {
          const id = el.dataset.testid ? `[data-testid=${el.dataset.testid}]` : '';
          const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 20);
          out.push({ what: `<${el.tagName.toLowerCase()}${id}> "${label}"`, w: Math.round(r.width), h: Math.round(r.height) });
        }
      }
      return { checked, small: out };
    },
    { min, stick: SEL.stick },
  );
}

async function checkScreen(page: Page, state: GameStats['phase'], mustContain?: string) {
  const cjk = await visibleCjk(page);
  if (state === 'playing') {
    expect(cjk.count, `Playing screen must show no Chinese text, found "${cjk.text}"`).toBe(0);
  } else {
    expect(cjk.count, `${state} screen shows ${cjk.count} Chinese characters ("${cjk.text}"), max ${MAX_CJK}`).toBeLessThanOrEqual(MAX_CJK);
  }
  if (mustContain) expect(cjk.text.replace(/\s/g, ''), `${state} screen should show ${mustContain}`).toContain(mustContain);

  const targets = await smallTargets(page, MIN_TARGET_PX);
  expect(targets.checked, `${state} screen should have at least one visible control`).toBeGreaterThan(0);
  expect(
    targets.small,
    `${state} screen: touch targets under ${MIN_TARGET_PX}px: ${targets.small.map((t) => `${t.what} ${t.w}×${t.h}`).join(', ')}`,
  ).toEqual([]);
}

function artifactName(testInfo: TestInfo, suffix: string) {
  const vp = testInfo.project.use.viewport ?? { width: 0, height: 0 };
  mkdirSync(ARTIFACTS, { recursive: true });
  return `${ARTIFACTS}/p1-${testInfo.project.name}-${vp.width}x${vp.height}${suffix}`;
}

/**
 * Drives for `ms`: W held throughout with alternating turns (letters for the first half, arrows
 * for the second), Space every DASH_EVERY_MS starting at 0.5 s. Stops early when `until` is true.
 * Returns the furthest horizontal distance reached from the starting point.
 */
async function drive(page: Page, ms: number, until?: (s: GameStats) => boolean): Promise<number> {
  const origin = (await stats(page)).playerPosition;
  const turns: [string, string][] = [
    ['KeyA', 'ArrowLeft'],
    ['KeyD', 'ArrowRight'],
  ];
  const t0 = Date.now();
  let nextDash = 500;
  let maxDist = 0;
  let held: string[] = [];
  const hold = async (keys: string[]) => {
    for (const k of held) if (!keys.includes(k)) await page.keyboard.up(k);
    for (const k of keys) if (!held.includes(k)) await page.keyboard.down(k);
    held = keys;
  };
  try {
    while (Date.now() - t0 < ms) {
      const t = Date.now() - t0;
      const arrows = t >= ms / 2;
      const forward = arrows ? 'ArrowUp' : 'KeyW';
      // 1.2 s straight, 0.8 s turning, alternating left and right.
      const slot = Math.floor(t / 2000);
      const turning = t % 2000 >= 1200;
      const turnKey = turns[slot % 2][arrows ? 1 : 0];
      await hold(turning ? [forward, turnKey] : [forward]);
      if (t >= nextDash) {
        await page.keyboard.press('Space');
        nextDash += DASH_EVERY_MS;
      }
      const s = await stats(page);
      const d = Math.hypot(s.playerPosition.x - origin.x, s.playerPosition.z - origin.z);
      maxDist = Math.max(maxDist, d);
      if (until?.(s)) break;
      await page.waitForTimeout(100);
    }
  } finally {
    await hold([]);
  }
  return maxDist;
}

test.describe('Crazy Bumper P1', () => {
  test('title screen: start button, ≤6 Chinese characters, touch targets ≥64px', async ({ page }) => {
    await openGame(page);
    await checkScreen(page, 'title', '開始遊戲');
    const box = await page.locator(SEL.start).boundingBox();
    expect(box, 'Start button should have a bounding box').not.toBeNull();
  });

  test('10 s of play: fps baseline, movement, collisions, dashes, HUD rules, screenshot', async ({ page }, testInfo) => {
    await openGame(page);
    await startGame(page);

    const dash = page.locator(SEL.dash);
    await expect(dash, 'Dash button should be visible while playing').toBeVisible();
    const dashBox = await dash.boundingBox();
    expect(dashBox, 'Dash button should have a bounding box').not.toBeNull();
    expect(Math.abs(dashBox!.width - DASH_PX), `Dash button width ${dashBox!.width}, expected ${DASH_PX}`).toBeLessThanOrEqual(2);
    expect(Math.abs(dashBox!.height - DASH_PX), `Dash button height ${dashBox!.height}, expected ${DASH_PX}`).toBeLessThanOrEqual(2);
    await expect(page.locator(SEL.stick), 'Left joystick zone should be visible while playing').toBeVisible();

    const before = await stats(page);
    const t0 = Date.now();
    const maxDist = await drive(page, PLAY_MS);
    const elapsed = (Date.now() - t0) / 1000;
    const after = await stats(page);

    const measuredFps = (after.frameCount - before.frameCount) / elapsed;
    const report = {
      project: testInfo.project.name,
      viewport: testInfo.project.use.viewport,
      avgFps: Number(after.avgFps.toFixed(1)),
      lastFps: Number(after.fps.toFixed(1)),
      framesPerSecondFromFrameCount: Number(measuredFps.toFixed(1)),
      minFpsRequired: MIN_FPS,
      seconds: Number(elapsed.toFixed(2)),
      maxDistance: Number(maxDist.toFixed(2)),
      totalCollisions: after.totalCollisions,
      dashCount: after.dashCount,
      playerScore: after.playerScore,
      activePowerUp: after.activePowerUp,
    };
    console.log(`[bumper:${testInfo.project.name}] FPS baseline avgFps=${report.avgFps} (frameCount rate ${report.framesPerSecondFromFrameCount}, floor ${MIN_FPS})`);
    console.log(`[bumper:${testInfo.project.name}] ${JSON.stringify(report)}`);
    writeFileSync(artifactName(testInfo, '-fps.json'), JSON.stringify(report, null, 2) + '\n');
    await testInfo.attach('p1-stats', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });

    expect(after.phase, 'A 60 s round should still be running after 10 s').toBe('playing');
    await checkScreen(page, 'playing');
    await page.screenshot({ path: artifactName(testInfo, '.png') });

    expect(after.frameCount, 'Render loop should advance frameCount').toBeGreaterThan(before.frameCount);
    expect(after.avgFps, `Average FPS ${after.avgFps.toFixed(1)} is below the floor ${MIN_FPS} (BUMPER_MIN_FPS)`).toBeGreaterThanOrEqual(MIN_FPS);
    expect(maxDist, `Player moved only ${maxDist.toFixed(2)} units in 10 s (needs ${MIN_MOVE})`).toBeGreaterThanOrEqual(MIN_MOVE);
    expect(after.totalCollisions, 'Expected at least one collision in 10 s of play').toBeGreaterThanOrEqual(1);
    expect(after.dashCount, 'Expected at least 3 dashes from Space every 3 s').toBeGreaterThanOrEqual(3);
    expect(after.consoleErrors, '__GAME_STATS__.consoleErrors should be empty').toEqual([]);
  });

  test(`result screen via ?round=${SHORT_ROUND_S}: replay button, ≤6 Chinese characters, touch targets ≥64px`, async ({ page }) => {
    test.setTimeout(SHORT_ROUND_S * 1000 + 60_000);
    await openGame(page, `?round=${SHORT_ROUND_S}`);
    await startGame(page);
    await drive(page, SHORT_ROUND_S * 1000 + 8_000, (s) => s.phase === 'result');
    await expect
      .poll(async () => (await stats(page)).phase, {
        message: `Round of ${SHORT_ROUND_S} s should end on the result screen (does the game honour ?round=?)`,
        timeout: 5_000,
      })
      .toBe('result');

    const again = page.locator(SEL.again);
    await expect(again, 'Replay button should be visible on the result screen').toBeVisible();
    await expect(again).toHaveText(/再玩一次/);
    await checkScreen(page, 'result', '再玩一次');
    expect((await stats(page)).consoleErrors, '__GAME_STATS__.consoleErrors should be empty').toEqual([]);

    await again.click();
    await expect
      .poll(async () => (await stats(page)).phase, { message: 'Clicking 再玩一次 should leave the result screen' })
      .not.toBe('result');
  });
});
