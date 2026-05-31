import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig } from '@next/env';

// Load .env.local (etc.) into the test process exactly as Next does, so the
// e2e tests share the app's secrets (RX_TOKEN_SECRET, CRON_SECRET) and can
// mint valid Rx tokens / cron auth that the running app accepts.
loadEnvConfig(process.cwd());

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  // Auto-start the dev server for e2e; reuse one already running locally.
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
