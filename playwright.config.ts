import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.STUDIO_E2E_PORT ?? 4173)

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `corepack pnpm --dir apps/web exec vite --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/app`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
