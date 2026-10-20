import { defineConfig, devices } from '@playwright/test';

/**
 * Browser end-to-end tests. They run against an already running Taskora
 * (development stack via `npm run dev`, or a Docker deployment):
 *
 *   E2E_BASE_URL=http://localhost:5173 E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e
 *
 * The tests create their own uniquely named records.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
