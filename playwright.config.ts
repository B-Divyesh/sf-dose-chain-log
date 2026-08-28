import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run build && npm run preview', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
})
