import { defineConfig, devices } from '@playwright/test';

/**
 * See docs/SPEC.md ("Playwright projects") and
 * https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: [['list'], ['html']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'e2e',
      testDir: './tests',
      testIgnore: ['api/**', 'regression/**'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'api',
      testDir: './tests/api',
    },
    {
      name: 'regression',
      testDir: './tests/regression',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'evals',
      testDir: './evals',
    },
  ],

  webServer: {
    command: 'npm start',
    port: 3000,
    env: {
      AGENT_MODE: 'mock',
      DB_FILE: 'test.db',
    },
    reuseExistingServer: !process.env.CI,
  },
});
