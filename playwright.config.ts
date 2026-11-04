import { defineConfig, devices } from '@playwright/test';

// macOS 默认 SwiftShader 会让固定步回放极慢；使用实际设备同类的 Metal 渲染。
const chromiumLaunch =
  process.platform === 'darwin' ? { args: ['--use-angle=metal'] } : {};
export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: '**/static.spec.ts',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: chromiumLaunch,
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        launchOptions: chromiumLaunch,
      },
    },
    {
      name: 'webkit',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
