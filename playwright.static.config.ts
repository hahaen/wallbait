import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/static.spec.ts',
  timeout: 30000,
  workers: 1,
  use: {
    ...devices['iPhone 13'],
    defaultBrowserType: 'chromium',
    launchOptions:
      process.platform === 'darwin' ? { args: ['--use-angle=metal'] } : {},
    baseURL: 'http://127.0.0.1:4174',
  },
  webServer: {
    command: 'node tests/serve-build.mjs',
    url: 'http://127.0.0.1:4174/wallbait/',
  },
});
