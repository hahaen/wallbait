import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('dialog')).toHaveCount(0);
}
test('空存档直接进入无尽，掉落可见且设置刷新后恢复', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '怎么玩' }).click();
  await expect(
    page.getByRole('heading', { name: '你是苹果，借墙脱身' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '知道了' }).click();
  const settings = page.getByRole('button', { name: '设置', exact: true });
  await settings.focus();
  await page.keyboard.press('Enter');
  const audio = page.getByRole('switch', { name: '游戏音效' });
  await expect(audio).toBeChecked();
  await audio.focus();
  await page.keyboard.press('Enter');
  await expect(audio).not.toBeChecked();
  await expect(audio).toHaveText('已静音');
  await expect(audio).toBeFocused();
  const motion = page.getByRole('switch', { name: '减少动态效果' });
  await motion.focus();
  await page.keyboard.press('Space');
  await expect(motion).toBeChecked();
  await expect(motion).toBeFocused();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(settings).toBeFocused();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('#round-label')).toHaveText('第 1 波');
  await expect(page.locator('.level-name')).toHaveText('回环石园');
  await expect(page.locator('#drop-guide')).toContainText(/护盾|冰冻|诱饵/);
  await expect(page.getByRole('button', { name: '放下诱饵' })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: '选择关卡' })).toHaveCount(0);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(audio).not.toBeChecked();
  await expect(motion).toBeChecked();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('暂停冻结时间与掉落、后台暂停、连续重开无重复监听', async ({ page }) => {
  await start(page);
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(100);
  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: '歇一口气' })).toBeVisible();
  const time = await page.locator('#clock').textContent(),
    drop = await page.locator('#drop-guide').textContent();
  await page.waitForTimeout(500);
  expect(await page.locator('#clock').textContent()).toBe(time);
  expect(await page.locator('#drop-guide').textContent()).toBe(drop);
  await page.getByRole('button', { name: '继续游戏' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('heading', { name: '歇一口气' })).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: '重试同一局' }).click();
    await expect(page.locator('#arena')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('dialog')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: '歇一口气' })).toBeVisible();
  }
  await page.getByRole('button', { name: '返回首页' }).click();
  await expect(
    page.getByRole('heading', { name: '撞墙了么', exact: true }),
  ).toBeVisible();
});

test('损坏及不可用的存储仍能正常游玩', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('wallbait.save.v3', '{bad'),
  );
  await start(page);
  await expect(page.locator('#round-label')).toHaveText('第 1 波');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const audio = page.getByRole('switch', { name: '游戏音效' });
  await audio.focus();
  await page.keyboard.press('Enter');
  await expect(audio).not.toBeChecked();
  await expect(audio).toBeFocused();
  await expect(page.getByRole('status')).toHaveText(
    '保存暂不可用，设置会在本次游玩生效。',
  );
  await start(page);
  await expect(page.locator('#round-label')).toHaveText('第 1 波');
  await expect(page.getByRole('heading', { name: '再骗它一次' })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: '再来一局', exact: true }).click();
  await expect(page.locator('#round-label')).toHaveText('第 1 波');
  await expect(page.locator('dialog')).toHaveCount(0);
});

test('地图与触控区无重叠、竖屏安全空间', async ({ page }) => {
  test.setTimeout(120000);
  for (const size of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await start(page);
    const canvas = await page.locator('canvas').boundingBox(),
      controls = await page.locator('.controls').boundingBox();
    expect(canvas).not.toBeNull();
    expect(controls).not.toBeNull();
    expect(canvas!.height).toBeGreaterThan(220);
    expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(controls!.y);
    expect(controls!.y + controls!.height).toBeLessThan(size.height);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(size.width);
    for (const b of await page.locator('.controls button:visible').all()) {
      const box = (await b.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test('真实浏览器多点触控可边移动边放下拾到的诱饵', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'CDP 多点触控仅 Chromium；WebKit 流程另测',
  );
  // 固定种子使第一个诱饵落在苹果右边第一格。
  await page.addInitScript(() => {
    const random = Math.random;
    Math.random = () => {
      Math.random = random;
      return 1033 / 0x100000000;
    };
  });
  await start(page);
  const client = await context.newCDPSession(page);
  const right = (await page.locator('[data-direction="right"]').boundingBox())!;
  const lure = page.getByRole('button', { name: '放下诱饵' });
  const tool = (await lure.boundingBox())!;
  const a = {
    x: right.x + right.width / 2,
    y: right.y + right.height / 2,
    id: 1,
  };
  const b = { x: tool.x + tool.width / 2, y: tool.y + tool.height / 2, id: 2 };
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [a],
  });
  await expect(lure).toBeEnabled();
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [a, b],
  });
  await expect(page.locator('#mechanisms')).toContainText('诱饵');
  await expect(lure).toBeDisabled();
  await expect(page.locator('[data-direction="right"]')).toHaveClass(/pressed/);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  await expect(page.locator('.pressed')).toHaveCount(0);
  await page.getByRole('button', { name: '暂停游戏' }).click();
  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect(page.locator('.pressed')).toHaveCount(0);
});

test('输入边界：垂直方向键组合斜走、快速松手不丢闪避朝向、销毁释放', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/src/input/controls.ts';
    const { Controls } = await import(path);
    const root = document.createElement('div');
    const controls = new Controls(
      root,
      () => true,
      () => {},
    );
    const key = (type: string, code: string): void => {
      window.dispatchEvent(new KeyboardEvent(type, { code }));
    };
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowUp');
    const latest = controls.sample();
    key('keyup', 'ArrowUp');
    const fallback = controls.sample();
    key('keydown', 'Space');
    key('keyup', 'ArrowRight');
    const quickDodge = controls.sample();
    const stopped = controls.sample();
    key('keydown', 'ArrowLeft');
    controls.clear();
    const cleared = controls.sample();
    controls.destroy();
    key('keydown', 'ArrowDown');
    const destroyed = controls.sample();
    return { latest, fallback, quickDodge, stopped, cleared, destroyed };
  });
  expect(result.latest).toMatchObject({
    direction: 'up',
    movement: { x: 1, y: -1 },
  });
  expect(result.fallback.direction).toBe('right');
  expect(result.quickDodge).toEqual({
    direction: 'right',
    dodge: true,
    beacon: false,
  });
  for (const c of [result.stopped, result.cleared, result.destroyed])
    expect(c).toEqual({ direction: null, dodge: false, beacon: false });
});

test('信标按键只触发一次，触控取消不遗留技能，快速点按仍有效', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/src/input/controls.ts';
    const { Controls } = await import(path);
    const root = document.createElement('div');
    root.innerHTML =
      '<button data-beacon>信标</button><button data-dodge>闪避</button>';
    const beacon = root.querySelector<HTMLButtonElement>('[data-beacon]')!;
    // 隔离输入适配器：合成 PointerEvent 没有浏览器原生 pointer capture。
    // 真正多指的 capture/cancel 由上方 Chromium CDP 用例覆盖。
    for (const button of root.querySelectorAll('button')) {
      button.setPointerCapture = () => {};
      button.hasPointerCapture = () => false;
    }
    const controls = new Controls(
      root,
      () => true,
      () => {},
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    const first = controls.sample();
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyE', repeat: true }),
    );
    const repeat = controls.sample();
    const pointer = (type: string, id: number): void => {
      beacon.dispatchEvent(
        new PointerEvent(type, { pointerId: id, bubbles: true }),
      );
    };
    pointer('pointerdown', 1);
    pointer('pointercancel', 1);
    const cancelled = controls.sample();
    pointer('pointerdown', 2);
    pointer('pointerup', 2);
    pointer('lostpointercapture', 2);
    const tapped = controls.sample();
    pointer('pointerdown', 3);
    controls.clear();
    const cleared = controls.sample();
    controls.destroy();
    return { first, repeat, cancelled, tapped, cleared };
  });
  expect(result.first.beacon).toBe(true);
  expect(result.tapped.beacon).toBe(true);
  for (const command of [result.repeat, result.cancelled, result.cleared]) {
    expect(command).toEqual({ direction: null, dodge: false, beacon: false });
  }
});
