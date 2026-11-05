import { expect, test } from '@playwright/test';

test('生产包在 /game/wallbait/ 加载全部资源并完成一局，并继承旧纪录', async ({
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
        '/game/wallbait/assets/bean-mascots-',
      ) && response.url().endsWith('.webp'),
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      'wallbait.save.v2',
      JSON.stringify({
        version: 2,
        campaign: 'foundry-v2',
        utility: 'magnet',
        endlessBest: { cleared: 3, defeated: 5 },
      }),
    );
  });
  await page.goto('/game/wallbait/');
  expect((await atlas).ok()).toBe(true);
  const record = page.getByText('无尽纪录 · 完成 3 波 · 撞毁 5 条');
  await expect(record).toBeVisible();
  await expect(page.getByRole('button', { name: '选择关卡' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/mobile-home.png' });
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('#drop-guide')).toContainText(/护盾|冰冻|诱饵/);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#round-label')).toHaveText('第 1 波');
  await expect(page.locator('#clock')).not.toHaveText('0.0s');
  await page.screenshot({ path: 'test-results/mobile-play.png' });
  await expect(page.getByRole('heading', { name: '再骗它一次' })).toBeVisible({
    timeout: 12000,
  });
  await expect(page.getByText('个人纪录 · 3 波 / 5 条')).toBeVisible();
  await page.getByRole('button', { name: '返回首页' }).click();
  await page.reload();
  await expect(record).toBeVisible();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '放下诱饵' })).toBeDisabled();
  expect(scripts.length).toBeGreaterThanOrEqual(2);
  expect(
    scripts.every((path) => path.startsWith('/game/wallbait/assets/')),
  ).toBe(true);
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
