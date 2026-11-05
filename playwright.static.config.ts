import { defineConfig, devices } from '@playwright/test';
const onlineOrigin = process.env.WALLBAIT_STATIC_ORIGIN;

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
    baseURL: onlineOrigin ?? 'http://127.0.0.1:4174',
  },
  ...(onlineOrigin
    ? {}
    : {
        webServer: {
          command: 'node tests/serve-build.mjs',
          url: 'http://127.0.0.1:4174/game/wallbait/',
        },
      }),
});
