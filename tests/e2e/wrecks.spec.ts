import { expect, test } from '@playwright/test';

test('第八关双按钮投掷与残骸接力，暂停冻结并正常通关', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (info.project.name !== 'desktop')
    await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 仅预置前七关成绩以选择第八关；对局只用原生按钮，不写坐标或敌人状态。
  await page.addInitScript(() =>
    localStorage.setItem(
      'wallbait.save.v2',
      JSON.stringify({
        version: 2,
        campaign: 'foundry-v2',
        muted: true,
        reducedMotion: true,
        best: Object.fromEntries(
          Array.from({ length: 7 }, (_, i) => [
            String(i + 1),
            { timeMs: 10000, dodges: 0, beacons: 0, stars: 1 },
          ]),
        ),
      }),
    ),
  );
  await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-04T04:00:01Z'));
  await page.goto('/');
  await page
    .getByRole('button', { name: '继续挑战 · 第 8 关' })
    .click({ force: true });
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.skills button')).toHaveCount(2);
  await page.getByRole('button', { name: '进入试验' }).click({ force: true });
  await page.clock.runFor(16);
  await page.getByRole('button', { name: '向左移动' }).click({ force: true });
  await page
    .getByRole('button', { name: '信标', exact: true })
    .click({ force: true });
  await page.clock.runFor(120);
  await expect(page.locator('#cooldown')).toContainText('▰▱');
  await page.clock.runFor(960);
  await page.getByRole('button', { name: '向下移动' }).click({ force: true });
  await page.clock.runFor(120);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '向左移动' }).click({ force: true });
    await page.clock.runFor(120);
  }
  await page.clock.runFor(780);
  await expect(page.locator('#mechanisms')).toContainText('残骸 1 阻挡');
  await expect(page.locator('#beacon-text')).toHaveText('前投 ≤2格');
  await page.getByRole('button', { name: '暂停游戏' }).click({ force: true });
  const clock = await page.locator('#clock').textContent();
  const hud = await page.locator('#mechanisms').textContent();
  await page.clock.runFor(1000);
  expect(await page.locator('#clock').textContent()).toBe(clock);
  expect(await page.locator('#mechanisms').textContent()).toBe(hud);
  await page.getByRole('button', { name: '继续游戏' }).click({ force: true });
  await page.getByRole('button', { name: '向上移动' }).click({ force: true });
  await page
    .getByRole('button', { name: '信标', exact: true })
    .click({ force: true });
  await page.clock.runFor(120);
  await expect(page.locator('#cooldown')).toContainText('▱▱');
  const canvas = (await page.locator('canvas').boundingBox())!;
  const controls = (await page.locator('.controls').boundingBox())!;
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(controls.y);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/wrecks-${info.project.name}.png`,
  });
  await page.clock.runFor(2000);
  await expect(page.getByRole('heading', { name: '撞墙了吧！' })).toBeVisible();
  await expect(page.locator('.result-stats')).toContainText('0 / 2');
  expect(errors).toEqual([]);
});
