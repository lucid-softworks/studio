import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.STUDIO_E2E_PORT ?? 4173)
const serverCommand = process.env.CI
  ? `corepack pnpm --dir apps/web run build:e2e && corepack pnpm --dir apps/web exec vite preview --host 127.0.0.1 --port ${port}`
  : `corepack pnpm --dir apps/web exec vite --host 127.0.0.1 --port ${port}`

export default defineConfig({
  testDir: './apps/web/e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['json', { outputFile: 'test-results/results.json' }]]
    : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: serverCommand,
    url: `http://127.0.0.1:${port}/app`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
