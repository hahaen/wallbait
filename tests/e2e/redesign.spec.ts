import { expect, test, type Page } from '@playwright/test';

async function begin(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-04T04:00:01Z'));
  await page.goto('/');
  await page
    .getByRole('button', { name: '开始游戏', exact: true })
    .click({ force: true });
  await expect(page.locator('[data-action="begin"]')).toBeEnabled();
  await page.locator('[data-action="begin"]').click({ force: true });
}
async function endRound(page: Page, win: boolean): Promise<void> {
  await begin(page);
  await page.clock.runFor(916);
  if (win) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 8; i++) {
    if (await page.locator('.play-screen.ending').count()) break;
    await page.clock.runFor(80);
  }
  await expect(page.locator('.play-screen')).toHaveClass(/ending/);
}

for (const win of [false, true]) {
  test(`${win ? '胜利' : '失败'}先停留现场，禁止继续输入，1.2秒后才结算`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await endRound(page, win);
    await expect(page.locator('dialog')).toHaveCount(0);
    const clock = await page.locator('#clock').textContent();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await page.clock.runFor(1000);
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.locator('#clock')).toHaveText(clock!);
    await expect(page.locator('.controls')).toHaveAttribute('inert', '');
    if (win) {
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('wallbait.save.v2')!),
      );
      expect(saved.best['1'].scoring).toBe('chase-v2');
    }
    await page.clock.runFor(240);
    await expect(
      page.getByRole('heading', { name: win ? '撞墙了吧！' : '再骗它一次' }),
    ).toBeVisible();
    await expect(page.locator('.result-options')).not.toHaveAttribute(
      'open',
      '',
    );
    await page.screenshot({
      path: `test-results/redesign-${win ? 'win' : 'loss'}-${info.project.name}.png`,
    });
    await page
      .getByRole('button', { name: win ? '重试本关' : '再试一次', exact: true })
      .click({ force: true });
    await page.clock.runFor(16);
    await expect(page.locator('.controls')).not.toHaveAttribute('inert', '');
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.locator('#clock')).toHaveText('0.0s');
    expect(errors).toEqual([]);
  });
}

test('暖色首页与清爽对局，没有蓄力读条、预警横幅或重复常驻说明', async ({
  page,
}, info) => {
  await begin(page);
  await page.clock.runFor(700);
  await expect(page.locator('.hud')).toContainText('剩余 1 条');
  await expect(page.locator('#mechanisms')).toBeEmpty();
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
  await endRound(page, false);
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
