import { expect, test } from '@playwright/test';

test('资源就绪前冻结，就绪后自动开局', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/src/game/createGame.ts*', async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  const begin = page.locator('[data-action="begin"]');
  await expect(begin).toBeDisabled();
  await page.keyboard.press('p');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '正在准备' })).toBeVisible();
  await expect(page.locator('#clock')).toHaveText('0.0s');
  release();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('#arena')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#clock')).not.toHaveText('0.0s');
});

test('加载失败保持冻结，快捷键不能关闭错误，重新加载页面可恢复', async ({
  page,
}) => {
  await page.route('**/src/game/createGame.ts*', (route) =>
    route.abort('failed'),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  const error = page.getByRole('heading', { name: '游戏还没准备好' });
  await expect(error).toBeVisible();
  await page.keyboard.press('p');
  await page.keyboard.press('Escape');
  await expect(error).toBeVisible();
  await expect(page.locator('#clock')).toHaveText('0.0s');
  await page.unroute('**/src/game/createGame.ts*');
  await page.getByRole('button', { name: '重新加载页面' }).click();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('canvas')).toBeVisible();
});

test('离开加载中的无尽地图后，迟到的资源不会复活旧场景', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/src/game/createGame.ts*', async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await page.getByRole('button', { name: '返回首页' }).click();
  const response = page.waitForResponse('**/src/game/createGame.ts*');
  release();
  await response;
  // 等待整个模块树完成导入，覆盖 then 中的状态引用校验。
  await page.evaluate(async () => {
    const path = '/src/game/createGame.ts';
    await import(path);
  });
  await expect(
    page.getByRole('heading', { name: '撞墙了么', exact: true }),
  ).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('小屏、横屏和放大文字下，道具提示与操作始终在视窗内', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const size of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await page.getByRole('button', { name: '开始游戏' }).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '125%';
    });
    for (const selector of [
      '[data-action="pause"]',
      '#drop-guide',
      '[data-dodge]',
    ]) {
      const bounds = (await page.locator(selector).boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(size.width);
    if (size.width === 375)
      await page.screenshot({
        path: `test-results/optimization-drop-${info.project.name}.png`,
      });
  }
});

test('聚焦后的方向、工具与信标支持 Enter，修饰键不会误触暂停', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/src/input/controls.ts';
    const { Controls } = await import(path);
    const root = document.createElement('div');
    root.innerHTML =
      '<button data-direction="right">右</button><button data-dodge>工具</button><button data-beacon>信标</button>';
    document.body.append(root);
    let pauses = 0;
    const controls = new Controls(
      root,
      () => true,
      () => {
        pauses++;
      },
    );
    const enter = (selector: string) => {
      const button = root.querySelector<HTMLButtonElement>(selector)!;
      button.focus();
      button.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      );
      button.dispatchEvent(
        new KeyboardEvent('keyup', { code: 'Enter', bubbles: true }),
      );
      return controls.sample();
    };
    const direction = enter('[data-direction]');
    const stopped = controls.sample();
    const utility = enter('[data-dodge]');
    const beacon = enter('[data-beacon]');
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyP', ctrlKey: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyP', metaKey: true }),
    );
    controls.destroy();
    root.remove();
    return { direction, stopped, utility, beacon, pauses };
  });
  expect(result.direction.direction).toBe('right');
  expect(result.stopped.direction).toBeNull();
  expect(result.utility.dodge).toBe(true);
  expect(result.beacon.beacon).toBe(true);
  expect(result.pauses).toBe(0);
});
