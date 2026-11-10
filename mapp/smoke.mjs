import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { chromium, devices, expect, webkit } from '@playwright/test';

const zip = process.argv[2] ?? 'dist-mapp/app.zip';
const read = (name) =>
  execFileSync('unzip', ['-p', zip, name], { maxBuffer: 8 * 1024 * 1024 });
const html = read('index.html').toString();
const css = read('app.css').toString();
const script = read('app.js').toString();
const atlas = read('images/bean-mascots.webp').toString('base64');
const hash = (source) => createHash('sha256').update(source).digest('base64');
const origin = 'http://wallbait.test';

// 在宿主收到 ready 之前扣住素材，验证首次握手可以独立完成。
const sdk = `
  window.miniApp = {
    ready: Promise.resolve(),
    permissions: { has: () => false },
    assets: { readBytes: async () => {
      await window.waitForAtlas();
      return Uint8Array.from(atob(${JSON.stringify(atlas)}), char => char.charCodeAt(0));
    } },
    lifecycle: { ready: async () => parent.postMessage('ready', '*') }
  };
`;
const host = `
  <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <iframe sandbox="allow-scripts" src="/app" width="370" height="750" hidden></iframe>
  <script>
    const frame = document.querySelector('iframe');
    addEventListener('message', event => {
      if (event.source === frame.contentWindow && event.data === 'ready') frame.hidden = false;
    });
  </script>
`;
const policy = [
  "default-src 'none'",
  `script-src 'sha256-${hash(sdk)}' 'sha256-${hash(script)}' 'wasm-unsafe-eval'`,
  `style-src 'sha256-${hash(css)}'`,
  "style-src-attr 'none'",
  "connect-src 'none'",
  'img-src blob:',
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
].join('; ');
const frameHtml = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${policy}">
  <style>${css}</style>${html}<script>${sdk}</script><script>${script}</script>
`;

for (const browserType of [chromium, webkit]) {
  const browser = await browserType.launch(
    browserType === chromium && process.platform === 'darwin'
      ? { args: ['--use-angle=metal'] }
      : {},
  );
  const { resolve: releaseAtlas, promise: atlasGate } = Promise.withResolvers();
  try {
    const page = await browser.newPage(devices['iPhone 13']);
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.exposeBinding('waitForAtlas', () => atlasGate);
    await page.route(origin + '/', (route) =>
      route.fulfill({ contentType: 'text/html; charset=utf-8', body: host }),
    );
    await page.route(origin + '/app', (route) =>
      route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: frameHtml,
      }),
    );
    await page.goto(origin + '/');
    await expect(page.locator('iframe')).toBeVisible({ timeout: 5000 });
    const frame = page.frameLocator('iframe');
    await expect(frame.getByRole('status')).toHaveText('正在摆好墙…');
    releaseAtlas();
    await frame.getByRole('button', { name: '设置' }).click();
    await frame.getByRole('button', { name: '完成' }).click();
    await frame.getByRole('button', { name: '开始游戏' }).click();
    await expect(frame.locator('#arena')).toHaveAttribute('aria-busy', 'false');
    await expect(frame.locator('canvas')).toBeVisible();
    await frame.getByRole('button', { name: '暂停游戏' }).click();
    await frame.getByRole('button', { name: '继续游戏' }).click();
    await expect(
      frame.getByRole('heading', { name: /再骗它一次|新的无尽纪录/ }),
    ).toBeVisible({
      timeout: 15000,
    });
    assert.deepEqual(errors, []);
    process.stdout.write(`${browserType.name()} 微应用沙箱回归通过\n`);
  } finally {
    releaseAtlas();
    await browser.close();
  }
}
