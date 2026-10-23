import { defineConfig } from '@playwright/test';

/**
 * Playwright config for browser verification specs (tests/verify-*.spec.ts).
 * Vitest only picks up tests/**\/*.test.ts, so these specs never run under `npm test`.
 *
 * Browser: @playwright/test is pinned to 1.56.1 because its bundled Chromium revision (1194)
 * matches what is preinstalled under PLAYWRIGHT_BROWSERS_PATH (/opt/pw-browsers/chromium-1194 and
 * chromium_headless_shell-1194). Do not run `playwright install` here. To use another binary, set
 * BUMPER_CHROMIUM_PATH to its executable.
 */
const baseURL = process.env.BUMPER_URL ?? 'http://127.0.0.1:8788';
const executablePath = process.env.BUMPER_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'tests',
  testMatch: /verify-.*\.spec\.ts$/,
  outputDir: 'test-results',
  retries: 0,
  // One worker: the FPS baseline is meaningless when two software-rendered scenes share the CPU.
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'off',
    launchOptions: {
      executablePath,
      // SwiftShader through ANGLE gives headless Chromium a working (software) WebGL context.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    {
      name: 'ipad',
      use: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true },
    },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true },
    },
  ],
});
