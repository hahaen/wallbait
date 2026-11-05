import { expect, test } from '@playwright/test';

test('生产包在 /wallbait/ 加载全部资源并完成一局，保存实际截图', async ({
  page,
}) => {
  const failures: string[] = [],
    errors: string[] = [],
    scripts: string[] = [];
  page.on('requestfailed', (request) => failures.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.resourceType() === 'script')
      scripts.push(new URL(request.url()).pathname);
  });
  const atlas = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith(
        '/wallbait/assets/bean-mascots-',
      ) && response.url().endsWith('.webp'),
  );
  await page.goto('/wallbait/');
  expect((await atlas).ok()).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-home.png' });
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.getByRole('heading', { name: '试验准备' })).toBeVisible();
  await page.getByRole('button', { name: '进入试验' }).click();
  await page.waitForFunction(
    () => document.querySelector('#play-status')?.textContent?.includes('直冲'),
    null,
    { polling: 'raf', timeout: 10000 },
  );
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: 'test-results/mobile-warning.png' });
  await expect(page.getByRole('heading', { name: '撞墙了吧！' })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-win.png' });
  await page.getByRole('button', { name: '返回选关' }).click();
  await page.screenshot({ path: 'test-results/mobile-levels.png' });
  await page.reload();
  await expect(
    page.getByRole('button', { name: '继续挑战 · 第 2 关' }),
  ).toBeVisible();
  expect(scripts.length).toBeGreaterThanOrEqual(2);
  expect(scripts.every((path) => path.startsWith('/wallbait/assets/'))).toBe(
    true,
  );
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
