import { expect, test, type Page } from '@playwright/test';

async function unlock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (localStorage.getItem('wallbait.save.v2')) return;
    localStorage.setItem(
      'wallbait.save.v2',
      JSON.stringify({
        version: 2,
        campaign: 'foundry-v2',
        muted: true,
        reducedMotion: true,
        best: Object.fromEntries(
          Array.from({ length: 8 }, (_, i) => [
            i + 1,
            { stars: 1, timeMs: 1000, dodges: 0, beacons: 0 },
          ]),
        ),
      }),
    );
  });
}

test('第 5 关前首页展示解锁条件', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: '无尽挑战 · 第 5 关后解锁' }),
  ).toBeDisabled();
});

test('走位、贴墙投信标、原地进入第二波、暂停与本地纪录', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await unlock(page);
  await page.goto('/');
  await page.getByRole('button', { name: '无尽挑战', exact: true }).click();
  await expect(page.getByText('回环石园 · 39 × 45 格')).toBeVisible();
  await expect(page.getByRole('button', { name: /磁推/ })).toBeVisible();
  await page.getByRole('button', { name: '开始挑战' }).click();
  const canvas = page.locator('canvas');
  const original = await canvas.elementHandle();
  // 一次直冲仅持续 400ms，逐帧观察才能稳定抓住第一次。
  await page.waitForFunction(
    () => document.querySelector('#play-status')?.textContent?.includes('直冲'),
    null,
    { polling: 'raf', timeout: 8000 },
  );
  await page.waitForFunction(
    () => document.querySelector('#play-status')?.textContent === '',
    null,
    { polling: 'raf', timeout: 2000 },
  );
  await page.keyboard.down('ArrowDown');
  await page.keyboard.press('e');
  await page.keyboard.up('ArrowDown');
  await expect(page.locator('#mechanisms')).toContainText('信标');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  await expect(page.locator('#play-status')).toContainText('本波清空');
  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: '歇一口气' })).toBeVisible();
  await expect(page.getByText('完成 1 波 · 撞毁 1 条')).toBeVisible();
  await page.waitForTimeout(1300);
  await expect(page.locator('#round-label')).toHaveText('第 1 波');
  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect(page.locator('#round-label')).toHaveText('第 2 波');
  await expect(page.locator('#enemy-count')).toHaveText('剩余 2 条');
  expect(
    await original!.evaluate(
      (node) => node === document.querySelector('canvas'),
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('endless-wave-two.png') });
  await expect(
    page.getByRole('heading', { name: '新的无尽纪录！' }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: '重试同一局' }).click();
  await expect(page.locator('#round-label')).toHaveText('第 1 波');
  await expect(page.locator('#enemy-count')).toHaveText('剩余 1 条');
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText(/无尽纪录 · 完成 1 波 · 撞毁 [12] 条/),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

async function appleOnCanvas(
  page: Page,
): Promise<{ x: number; y: number; pixels: number }> {
  const image = (await page.locator('canvas').screenshot()).toString('base64');
  return page.evaluate(async (source) => {
    const img = new Image();
    img.src = `data:image/png;base64,${source}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
    let x = 0,
      y = 0,
      count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
      if (r < 150 || r < g * 1.6 || r < b * 1.5) continue;
      const point = i / 4;
      x += point % img.width;
      y += Math.floor(point / img.width);
      count++;
    }
    return {
      x: x / count / img.width,
      y: y / count / img.height,
      pixels: count,
    };
  }, image);
}

test('保持格子比例，移动穿过多个屏幕时镜头跟随并停在地图边界', async ({
  page,
}, info) => {
  await unlock(page);
  await page.goto('/');
  await page.getByRole('button', { name: '无尽挑战', exact: true }).click();
  await page.getByRole('button', { name: '开始挑战' }).click();
  const start = await appleOnCanvas(page);
  expect(start.pixels).toBeGreaterThan(60);
  expect(start.x).toBeCloseTo(0.5, 1);
  expect(start.y).toBeCloseTo(0.5, 1);
  // 先走到中部短墙东侧，再沿北侧开口走向外墙。
  for (const [key, time] of [
    ['ArrowLeft', 1050],
    ['ArrowUp', 1350],
    ['ArrowLeft', 1850],
  ] as const) {
    await page.keyboard.down(key);
    await page.waitForTimeout(time);
    await page.keyboard.up(key);
    if (key === 'ArrowUp') {
      const middle = await appleOnCanvas(page);
      expect(middle.x).toBeCloseTo(0.5, 1);
      expect(middle.y).toBeCloseTo(0.5, 1);
    }
  }
  const edge = await appleOnCanvas(page);
  expect(edge.pixels).toBeGreaterThan(60);
  expect(edge.x).toBeGreaterThan(0.06);
  expect(edge.x).toBeLessThan(0.17);
  expect(edge.y).toBeCloseTo(0.5, 1);
  const canvas = page.locator('canvas');
  await canvas.screenshot({ path: info.outputPath('endless-map-edge.png') });
  const view = (await canvas.boundingBox())!;
  const controls = (await page.locator('.controls').boundingBox())!;
  expect(view.height / view.width).toBeCloseTo(480 / 416, 2);
  expect(view.y + view.height).toBeLessThanOrEqual(controls.y + 1);
});
