import { expect, test } from '@playwright/test';
import type { Controls } from '../../src/input/controls';
type FixtureWindow = Window & { thumbFixture?: Controls };

async function fixture(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    const path = '/src/input/controls.ts';
    const { Controls } = await import(path);
    const root = document.createElement('div');
    root.id = 'thumb-fixture';
    root.style.cssText =
      'position:fixed;left:20px;top:20px;display:flex;align-items:center;gap:24px;z-index:20;touch-action:none';
    root.innerHTML = `<div class="joystick" data-joystick><button data-direction="up">▲</button><button data-direction="right">▶</button><button data-direction="down">▼</button><button data-direction="left">◀</button><span class="stick-knob"></span></div><button data-dodge>工具</button>`;
    document.body.append(root);
    (window as FixtureWindow).thumbFixture = new Controls(
      root,
      () => true,
      () => {},
    );
  });
}

test('摇杆保留拖动角度、回中心进入死区、拖出外圈和松手停止', async ({
  page,
}) => {
  await fixture(page);
  const sample = () =>
    page.evaluate(() => (window as FixtureWindow).thumbFixture!.sample());
  const box = (await page.locator('[data-joystick]').boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  expect((await sample()).direction).toBeNull();
  await page.mouse.move(x + 50, y);
  expect((await sample()).direction).toBe('right');
  await page.mouse.move(x + 50, y + 54);
  const first = (await sample()).movement!;
  expect(first.y / first.x).toBeCloseTo(54 / 50, 1);
  await page.mouse.move(x + 20, y + 60);
  const second = (await sample()).movement!;
  expect(second.y / second.x).toBeCloseTo(3, 1);
  await page.mouse.move(x, y);
  expect((await sample()).direction).toBeNull();
  await page.mouse.move(x - 150, y);
  expect((await sample()).direction).toBe('left');
  await page.mouse.up();
  expect((await sample()).direction).toBeNull();
  await expect(page.locator('.joystick')).not.toHaveClass(/engaged/);
  await expect(page.locator('.pressed')).toHaveCount(0);
  expect(
    await page
      .locator('[data-joystick]')
      .evaluate((el) => el.style.getPropertyValue('--stick-x')),
  ).toBe('0px');
});

test('摇杆和大技能按钮可双指同时用，取消和重置均释放输入', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'CDP多点触摸只用于Chromium');
  await fixture(page);
  const sample = () =>
    page.evaluate(() => (window as FixtureWindow).thumbFixture!.sample());
  const stick = (await page.locator('[data-joystick]').boundingBox())!,
    tool = (await page.locator('#thumb-fixture [data-dodge]').boundingBox())!;
  const a = {
    x: stick.x + stick.width / 2 + 50,
    y: stick.y + stick.height / 2 - 35,
    id: 1,
  };
  const b = { x: tool.x + tool.width / 2, y: tool.y + tool.height / 2, id: 2 };
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [a],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [a, b],
  });
  const combo = await sample();
  expect(combo).toMatchObject({
    direction: 'right',
    dodge: true,
    beacon: false,
  });
  expect(combo.movement!.y / combo.movement!.x).toBeCloseTo(-0.7, 1);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...a, x: stick.x + stick.width / 2, y: stick.y + 10 }, b],
  });
  expect((await sample()).direction).toBe('up');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  expect(await sample()).toEqual({
    direction: null,
    dodge: false,
    beacon: false,
  });
  await expect(page.locator('.pressed')).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [a],
  });
  await page.evaluate(() => (window as FixtureWindow).thumbFixture!.clear());
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  expect((await sample()).direction).toBeNull();
});

test('角色与手机操作区实拍，失败默认不出现技术标记', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-04T04:00:01Z'));
  await page.goto('/');
  await page
    .getByRole('button', { name: '开始游戏', exact: true })
    .click({ force: true });
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.clock.runFor(700);
  const stick = (await page.locator('[data-joystick]').boundingBox())!,
    skill = (await page.locator('[data-dodge]').boundingBox())!;
  expect(stick.width).toBeGreaterThanOrEqual(140);
  expect(skill.width).toBeGreaterThanOrEqual(100);
  expect(skill.height).toBeGreaterThanOrEqual(80);
  expect(stick.x + stick.width).toBeLessThan(skill.x);
  await page.screenshot({
    path: `test-results/characters-play-${info.project.name}.png`,
  });
  await page.clock.runFor(5300);
  await expect(page.locator('#play-status')).toHaveText(
    '被逮住了，下次再骗它！',
  );
  await page.screenshot({
    path: `test-results/characters-caught-${info.project.name}.png`,
  });
  await page.getByText('更多选择', { exact: true }).click({ force: true });
  await page
    .getByRole('button', { name: '查看失败现场' })
    .click({ force: true });
  await expect(page.locator('.loss-inspection')).toBeVisible();
  await page.clock.runFor(32);
  await page.screenshot({
    path: `test-results/characters-inspection-${info.project.name}.png`,
  });
});

test('角色图集失败时禁止空白开局，重新加载后可恢复', async ({ page }) => {
  await page.route('**/bean-mascots.webp*', (route) =>
    route.request().resourceType() === 'script'
      ? route.continue()
      : route.abort('failed'),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  const error = page.getByRole('heading', { name: '游戏还没准备好' });
  await expect(error).toBeVisible();
  await expect(page.locator('#clock')).toHaveText('0.0s');
  await page.keyboard.press('p');
  await page.keyboard.press('Escape');
  await expect(error).toBeVisible();
  await page.unroute('**/bean-mascots.webp*');
  await page.getByRole('button', { name: '重新加载页面' }).click();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('#arena')).toHaveAttribute('aria-busy', 'false');
});
