import { expect, test, type Page } from '@playwright/test';

test('首波清空后全览出现两个进场区，走位切换并原地接战', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.getByText('回环石园 · 55 × 61 格')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: /磁推/ }),
  ).toBeVisible();
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
  const status = page.locator('#play-status');
  await expect(status).toContainText('可移向另一框换区');
  const waveHud = page.locator('#enemy-count');
  await expect(waveHud).toHaveText(/^下波 [0-2]\.\ds$/);
  const initialZones = await waveZonesOnCanvas(page);
  expect(initialZones[0]!.pixels).toBeGreaterThan(8);
  expect(initialZones[1]!.pixels).toBeGreaterThan(8);
  const dx = initialZones[1]!.x - initialZones[0]!.x;
  const dy = initialZones[1]!.y - initialZones[0]!.y;
  const direction =
    Math.abs(dx) > Math.abs(dy)
      ? dx < 0
        ? 'ArrowLeft'
        : 'ArrowRight'
      : dy < 0
        ? 'ArrowUp'
        : 'ArrowDown';
  await page.keyboard.down(direction);
  await expect(status).toContainText('已选转场区', { timeout: 1500 });
  await page.keyboard.up(direction);
  const changedZones = await waveZonesOnCanvas(page);
  expect(changedZones[0]!.x).toBeCloseTo(initialZones[1]!.x, 2);
  expect(changedZones[0]!.y).toBeCloseTo(initialZones[1]!.y, 2);
  await page.screenshot({ path: info.outputPath('endless-wave-choice.png') });
  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: '歇一口气' })).toBeVisible();
  await expect(page.getByText('完成 1 波 · 撞毁 1 条')).toBeVisible();
  const clock = await page.locator('#clock').textContent();
  const countdown = await waveHud.textContent();
  await page.waitForTimeout(600);
  await expect(page.locator('#clock')).toHaveText(clock!);
  await expect(waveHud).toHaveText(countdown!);
  await expect(page.locator('#round-label')).toHaveText('第 1 波');
  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect(page.locator('#round-label')).toHaveText('第 2 波');
  await expect(waveHud).toHaveText('剩余 2 条');
  expect((await waveZonesOnCanvas(page)).map((zone) => zone.pixels)).toEqual([
    0, 0,
  ]);
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

type Marker = { x: number; y: number; pixels: number };

async function waveZonesOnCanvas(page: Page): Promise<Marker[]> {
  const image = (await page.locator('canvas').screenshot()).toString('base64');
  return page.evaluate(async (source) => {
    const image = new Image();
    image.src = `data:image/png;base64,${source}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const width = Math.floor(image.width * 0.22);
    const height = Math.floor(image.height * 0.21);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    return [true, false].map((selected) => {
      let x = 0,
        y = 0,
        pixels = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        const [r, g, b] = [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!];
        // 桌面缩放会混合边缘像素，用色相区分粗紫框与细蓝框。
        const matches = selected
          ? b > r + 5 && r > g + 20 && g < 145
          : b > g + 4 && g > r + 8;
        if (!matches) continue;
        x += (i / 4) % width;
        y += Math.floor(i / 4 / width);
        pixels++;
      }
      return {
        x: x / pixels / image.width,
        y: y / pixels / image.height,
        pixels,
      };
    });
  }, image);
}

async function applesOnCanvas(
  page: Page,
): Promise<{ world: Marker; minimap: Marker }> {
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
    const world = { x: 0, y: 0, pixels: 0 };
    const minimap = { x: 0, y: 0, pixels: 0 };
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
      if (r < 150 || r < g * 1.6 || r < b * 1.5) continue;
      const point = i / 4;
      const x = (point % img.width) / img.width;
      const y = Math.floor(point / img.width) / img.height;
      const marker = x < 0.22 && y < 0.21 ? minimap : world;
      marker.x += x;
      marker.y += y;
      marker.pixels++;
    }
    for (const marker of [world, minimap]) {
      marker.x /= marker.pixels;
      marker.y /= marker.pixels;
    }
    return { world, minimap };
  }, image);
}

test('镜头跟随到地图边界，左上全览标出苹果的实际移动', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await page.getByRole('button', { name: '开始挑战' }).click();
  const start = await applesOnCanvas(page);
  expect(start.world.pixels).toBeGreaterThan(60);
  expect(start.world.x).toBeCloseTo(0.5, 1);
  expect(start.world.y).toBeCloseTo(0.5, 1);
  expect(start.minimap.pixels).toBeGreaterThan(8);
  expect(start.minimap.x).toBeGreaterThan(0.09);
  expect(start.minimap.x).toBeLessThan(0.14);
  expect(start.minimap.y).toBeGreaterThan(0.08);
  expect(start.minimap.y).toBeLessThan(0.13);
  // 先走到中部短墙东侧，再沿北侧开口走向外墙。
  for (const [key, time] of [
    ['ArrowLeft', 1050],
    ['ArrowUp', 1350],
    ['ArrowLeft', 2850],
  ] as const) {
    await page.keyboard.down(key);
    await page.waitForTimeout(time);
    await page.keyboard.up(key);
    if (key === 'ArrowUp') {
      const middle = await applesOnCanvas(page);
      expect(middle.world.x).toBeCloseTo(0.5, 1);
      expect(middle.world.y).toBeCloseTo(0.5, 1);
      expect(middle.minimap.x).toBeLessThan(start.minimap.x - 0.012);
      expect(middle.minimap.y).toBeLessThan(start.minimap.y - 0.012);
    }
  }
  const edge = await applesOnCanvas(page);
  expect(edge.world.pixels).toBeGreaterThan(60);
  expect(edge.world.x).toBeGreaterThan(0.06);
  expect(edge.world.x).toBeLessThan(0.17);
  expect(edge.world.y).toBeCloseTo(0.5, 1);
  expect(edge.minimap.pixels).toBeGreaterThan(8);
  expect(edge.minimap.x).toBeGreaterThan(0.025);
  expect(edge.minimap.x).toBeLessThan(0.045);
  const canvas = page.locator('canvas');
  await canvas.screenshot({ path: info.outputPath('endless-map-edge.png') });
  const view = (await canvas.boundingBox())!;
  const controls = (await page.locator('.controls').boundingBox())!;
  expect(view.height / view.width).toBeCloseTo(480 / 416, 2);
  expect(view.y + view.height).toBeLessThanOrEqual(controls.y + 1);

  // 苹果进入左上角时，透过变淡的全览仍能看清整颗苹果。
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2950);
  await page.keyboard.up('ArrowUp');
  const corner = await applesOnCanvas(page);
  expect(corner.minimap.pixels).toBeGreaterThan(edge.minimap.pixels * 5);
  expect(corner.minimap.x).toBeCloseTo(0.115, 1);
  expect(corner.minimap.y).toBeCloseTo(0.1, 1);
});
