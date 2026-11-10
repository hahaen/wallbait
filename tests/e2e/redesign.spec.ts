import { expect, test, type Page } from '@playwright/test';

async function begin(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-04T04:00:01Z'));
  await page.goto('/');
  await page
    .getByRole('button', { name: '开始游戏', exact: true })
    .click({ force: true });
  await expect(page.locator('dialog')).toHaveCount(0);
}
async function endRound(page: Page): Promise<void> {
  await begin(page);
  for (let i = 0; i < 60; i++) {
    if (await page.locator('.play-screen.ending').count()) break;
    await page.clock.runFor(80);
  }
  await expect(page.locator('.play-screen')).toHaveClass(/ending/);
}

test('首页标题靠近顶部，开始与帮助都在首屏', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 755 });
  await page.goto('/');
  const title = page.locator('.home h1');
  const top = page.locator('.home-top');
  const start = page.getByRole('button', { name: '开始游戏', exact: true });
  const help = page.getByRole('button', { name: '怎么玩', exact: true });

  for (const [width, height] of [
    [393, 755],
    [393, 740],
    [393, 741],
    [393, 667],
    [393, 568],
    [320, 568],
    [430, 932],
    [1280, 900],
  ] as const) {
    await test.step(`${width} × ${height}`, async () => {
      await page.setViewportSize({ width, height });
      await expect(start).toBeInViewport({ ratio: 1 });
      await expect(help).toBeInViewport({ ratio: 1 });
      const titleBox = (await title.boundingBox())!;
      const topBox = (await top.boundingBox())!;
      const gap = titleBox.y - (topBox.y + topBox.height);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(40);
    });
  }
});

test('被抓后先停留现场，禁止继续输入，1.2秒后才结算', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await endRound(page);
  await expect(page.locator('dialog')).toHaveCount(0);
  const clock = await page.locator('#clock').textContent();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await page.clock.runFor(1000);
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('#clock')).toHaveText(clock!);
  await expect(page.locator('.controls')).toHaveAttribute('inert', '');
  await page.clock.runFor(240);
  await expect(page.getByRole('heading', { name: '再骗它一次' })).toBeVisible();
  await expect(page.locator('.result-options')).not.toHaveAttribute('open', '');
  await page.screenshot({
    path: `test-results/redesign-loss-${info.project.name}.png`,
  });
  await page.getByRole('button', { name: '重试同一局' }).click({ force: true });
  await page.clock.runFor(16);
  await expect(page.locator('.controls')).not.toHaveAttribute('inert', '');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('#clock')).toHaveText('0.0s');
  expect(errors).toEqual([]);
});

test('暖色首页与清爽对局，没有蓄力读条、预警横幅或重复常驻说明', async ({
  page,
}, info) => {
  await begin(page);
  await page.clock.runFor(700);
  await expect(page.locator('.hud')).toContainText('剩余 1 条');
  await expect(page.locator('#mechanisms')).toHaveText('A 开 · B 闭');
  await expect(page.locator('#play-status')).toBeEmpty();
  await expect(page.locator('.play-footer')).not.toContainText('目标');
  await expect(page.locator('.play-screen')).not.toContainText(
    /蓄力|锁定|每3秒回1电/,
  );
  expect(
    await page
      .locator('#app')
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe('rgb(255, 245, 228)');
  const canvas = (await page.locator('canvas').boundingBox())!;
  const controls = (await page.locator('.controls').boundingBox())!;
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(controls.y);
  await page.screenshot({
    path: `test-results/redesign-play-${info.project.name}.png`,
  });
});

test('结束停留时切后台，回来仍能看清现场，不在后台弹结算', async ({ page }) => {
  await endRound(page);
  const visibility = async (hidden: boolean): Promise<void> => {
    await page.evaluate((value) => {
      Object.defineProperty(document, 'hidden', { configurable: true, value });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  };
  await visibility(true);
  await page.clock.runFor(5000);
  await expect(page.locator('dialog')).toHaveCount(0);
  await visibility(false);
  await page.clock.runFor(1000);
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.clock.runFor(240);
  await expect(page.getByRole('heading', { name: '再骗它一次' })).toBeVisible();
});
