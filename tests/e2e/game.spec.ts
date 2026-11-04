import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
}
async function winFirst(page: Page): Promise<void> {
  await expect(page.locator('#play-status')).toContainText('蓄力', {
    timeout: 10000,
  });
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  await page.keyboard.up('ArrowRight');
  await expect(page.getByRole('heading', { name: '撞墙了吧！' })).toBeVisible({
    timeout: 10000,
  });
}

test('首页、说明、设置、失败重试、胜利下一关、刷新和选关', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '怎么玩' }).click();
  await expect(
    page.getByRole('heading', { name: '你是苹果，别被吃掉' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '知道了' }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '已开启', exact: true }).click();
  await expect(page.getByRole('button', { name: '已静音' })).toBeVisible();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.getByRole('heading', { name: '再骗它一次' })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: '再试一次', exact: true }).click();
  await winFirst(page);
  await expect(page.locator('.result-stars')).toHaveAttribute(
    'aria-label',
    '本关 3 星',
  );
  await page.getByRole('button', { name: '下一关', exact: true }).click();
  await expect(page.getByRole('heading', { name: '看准箭头' })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: '继续挑战 · 第 2 关' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '已静音' })).toBeVisible();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: '选择关卡' }).click();
  await expect(page.locator('.level')).toHaveCount(20);
  await expect(page.locator('[data-action="level:2"]')).toBeEnabled();
  await expect(page.locator('[data-action="level:3"]')).toBeDisabled();
  await page.locator('[data-action="level:1"]').click();
  await expect(page.getByRole('heading', { name: '苹果先走' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('暂停冻结时间与冷却、后台暂停、连续重开无重复监听', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: '歇一口气' })).toBeVisible();
  const time = await page.locator('#clock').textContent(),
    cooldown = await page.locator('#cooldown').textContent();
  await page.waitForTimeout(500);
  expect(await page.locator('#clock').textContent()).toBe(time);
  expect(await page.locator('#cooldown').textContent()).toBe(cooldown);
  await page.getByRole('button', { name: '继续游戏' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('heading', { name: '歇一口气' })).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: '重新挑战' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: '歇一口气' })).toBeVisible();
  }
  await page.getByRole('button', { name: '返回选关' }).click();
  await expect(page.getByRole('heading', { name: '选一堵墙' })).toBeVisible();
});

test('损坏及不可用的存储仍能正常游玩', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('wallbait.save.v1', '{bad'),
  );
  await start(page);
  await winFirst(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  await start(page);
  await winFirst(page);
  await expect(page.locator('.save-warning')).toBeVisible();
  await page.getByRole('button', { name: '下一关', exact: true }).click();
  await expect(page.getByRole('heading', { name: '看准箭头' })).toBeVisible();
});

test('地图与触控区无重叠、竖屏安全空间', async ({ page }) => {
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
    for (const b of await page.locator('.controls button').all()) {
      const box = (await b.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test('真实浏览器多点触控移动与闪避同时按、取消后释放', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'CDP 多点触控仅 Chromium；WebKit 流程另测',
  );
  await start(page);
  const client = await context.newCDPSession(page);
  const left = (await page.locator('[data-direction="left"]').boundingBox())!,
    dodge = (await page.locator('[data-dodge]').boundingBox())!;
  const a = { x: left.x + left.width / 2, y: left.y + left.height / 2, id: 1 },
    b = { x: dodge.x + dodge.width / 2, y: dodge.y + dodge.height / 2, id: 2 };
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [a],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [a, b],
  });
  await expect(page.locator('#cooldown')).not.toHaveText('闪避就绪');
  await expect(page.locator('[data-direction="left"]')).toHaveClass(/pressed/);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  await expect(page.locator('.pressed')).toHaveCount(0);
  await page.getByRole('button', { name: '暂停游戏' }).click();
  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect(page.locator('.pressed')).toHaveCount(0);
});

test('输入边界：最近方向优先、快速松手不丢闪避朝向、销毁释放', async ({
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
  expect(result.latest.direction).toBe('up');
  expect(result.fallback.direction).toBe('right');
  expect(result.quickDodge).toEqual({ direction: 'right', dodge: true });
  for (const c of [result.stopped, result.cleared, result.destroyed])
    expect(c).toEqual({ direction: null, dodge: false });
});
