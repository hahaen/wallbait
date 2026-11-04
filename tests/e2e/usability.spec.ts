import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Controls } from '../../src/input/controls';

type InputWindow = Window & { inputFixture?: Controls };
async function startFrozen(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-04T04:00:01Z'));
  await page.goto('/');
  await page
    .getByRole('button', { name: '开始游戏', exact: true })
    .click({ force: true });
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: '进入试验' }).click({ force: true });
  await page.clock.runFor(216);
}

for (const mode of ['keyboard', 'pointer'] as const) {
  test(`${mode} 快速点按在下一规则步移动一格并完成侧撤`, async ({ page }) => {
    await startFrozen(page);
    await expect(page.locator('#play-status')).toContainText('1号冲锋者蓄力');
    if (mode === 'keyboard') await page.keyboard.press('ArrowRight');
    else
      await page
        .getByRole('button', { name: '向右移动' })
        .click({ force: true });
    await page.clock.runFor(1200);
    await expect(
      page.getByRole('heading', { name: '撞墙了吧！' }),
    ).toBeVisible();
    await expect(page.locator('.result-stats')).toContainText('0 / 0');
  });
}

test('失败现场可查看、冻结、返回结算和快速重试', async ({ page }, info) => {
  await startFrozen(page);
  await page.clock.runFor(1400);
  await expect(page.locator('.loss-cause')).toHaveText('1号冲锋者 · 冲刺命中');
  await page
    .getByRole('button', { name: '查看失败现场' })
    .click({ force: true });
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('.loss-inspection')).toBeVisible();
  await expect(page.locator('#loss-advice')).toContainText('横向');
  await expect(page.locator('.controls')).toBeHidden();
  const clock = await page.locator('#clock').textContent();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await page.clock.runFor(1000);
  expect(await page.locator('#clock').textContent()).toBe(clock);
  const canvas = (await page.locator('canvas').boundingBox())!;
  const panel = (await page.locator('.loss-inspection').boundingBox())!;
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(panel.y + 1);
  await page.screenshot({
    path: `test-results/usability-inspection-${info.project.name}.png`,
  });
  await page.getByRole('button', { name: '返回结算' }).click({ force: true });
  await expect(page.getByRole('heading', { name: '再骗它一次' })).toBeVisible();
  await page
    .getByRole('button', { name: '查看失败现场' })
    .click({ force: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '再骗它一次' })).toBeVisible();
  await page
    .getByRole('button', { name: '查看失败现场' })
    .click({ force: true });
  await page
    .getByRole('button', { name: '再试一次', exact: true })
    .click({ force: true });
  await expect(page.locator('.loss-inspection')).toBeHidden();
  await expect(page.locator('.controls')).toBeVisible();
  await expect(page.locator('#clock')).toHaveText('0.0s');
  await expect(page.locator('#cooldown')).toContainText('▰▰');
});

test('原生指针捕获支持滑动换向、滑出停止、取消与多指释放', async ({
  page,
  context,
  browserName,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const path = '/src/input/controls.ts';
    const { Controls } = await import(path);
    const root = document.createElement('div');
    root.id = 'input-fixture';
    root.style.cssText =
      'position:fixed;inset:20px auto auto 20px;z-index:20;display:flex;gap:16px;touch-action:none';
    root.innerHTML =
      '<button data-direction="left">测试左</button><button data-direction="up">测试上</button><button data-dodge>测试闪避</button>';
    document.body.append(root);
    (window as InputWindow).inputFixture = new Controls(
      root,
      () => true,
      () => {},
    );
  });
  const left = (await page
    .locator('#input-fixture [data-direction="left"]')
    .boundingBox())!;
  const up = (await page
    .locator('#input-fixture [data-direction="up"]')
    .boundingBox())!;
  const dodge = (await page
    .locator('#input-fixture [data-dodge]')
    .boundingBox())!;
  const sample = () =>
    page.evaluate(() => (window as InputWindow).inputFixture!.sample());
  await page.mouse.move(left.x + left.width / 2, left.y + left.height / 2);
  await page.mouse.down();
  expect((await sample()).direction).toBe('left');
  await page.mouse.move(up.x + up.width / 2, up.y + up.height / 2);
  expect((await sample()).direction).toBe('up');
  await expect(
    page.locator('#input-fixture [data-direction="left"]'),
  ).not.toHaveClass(/pressed/);
  await expect(
    page.locator('#input-fixture [data-direction="up"]'),
  ).toHaveClass(/pressed/);
  await page.mouse.move(5, 5);
  expect((await sample()).direction).toBeNull();
  await page.mouse.up();
  if (browserName === 'chromium') {
    const cdp = await context.newCDPSession(page);
    const a = {
      x: left.x + left.width / 2,
      y: left.y + left.height / 2,
      id: 1,
    };
    const b = {
      x: dodge.x + dodge.width / 2,
      y: dodge.y + dodge.height / 2,
      id: 2,
    };
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [a],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [a, b],
    });
    const command = await sample();
    expect(command.direction).toBe('left');
    expect(command.dodge).toBe(true);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { ...a, x: up.x + up.width / 2, y: up.y + up.height / 2 },
        b,
      ],
    });
    expect((await sample()).direction).toBe('up');
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchCancel',
      touchPoints: [],
    });
    expect((await sample()).direction).toBeNull();
    await expect(page.locator('#input-fixture .pressed')).toHaveCount(0);
  }
  await page.evaluate(() => {
    (window as InputWindow).inputFixture!.destroy();
    document.querySelector('#input-fixture')!.remove();
  });
});
