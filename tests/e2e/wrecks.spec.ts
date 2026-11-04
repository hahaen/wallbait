import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Replay } from '../replay-search';

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
  const replay = (
    JSON.parse(
      readFileSync(
        new URL('../fixtures/solutions.json', import.meta.url),
        'utf8',
      ),
    ) as Replay[]
  ).find((r) => r.level === 8)!;
  const names = {
    up: '向上移动',
    right: '向右移动',
    down: '向下移动',
    left: '向左移动',
  };
  let checkedPause = false;
  for (const command of replay.commands) {
    if (command.direction)
      await page
        .getByRole('button', { name: names[command.direction], exact: true })
        .click({ force: true });
    if (command.beacon)
      await page
        .getByRole('button', { name: '信标', exact: true })
        .click({ force: true });
    await page.clock.runFor(120);
    if (
      !checkedPause &&
      (await page.locator('#cooldown').textContent())?.includes('▰▱')
    ) {
      checkedPause = true;
      await page
        .getByRole('button', { name: '暂停游戏' })
        .click({ force: true });
      const clock = await page.locator('#clock').textContent();
      await page.clock.runFor(1000);
      expect(await page.locator('#clock').textContent()).toBe(clock);
      await page
        .getByRole('button', { name: '继续游戏' })
        .click({ force: true });
    }
  }
  expect(checkedPause).toBe(true);
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
  await expect(page.locator('.result-highlights')).toContainText('借尸筑墙');
  expect(errors).toEqual([]);
});
