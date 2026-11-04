import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Replay } from '../replay-search';

const replays = JSON.parse(
  readFileSync(
    new URL('../fixtures/chip-solutions.json', import.meta.url),
    'utf8',
  ),
) as Replay[];
const keys = {
  up: 'ArrowUp',
  right: 'ArrowRight',
  down: 'ArrowDown',
  left: 'ArrowLeft',
};
for (const id of [7, 11, 18]) {
  test(`第${id}关芯片携带、通关归档和刷新恢复，保持双技能与竖屏布局`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(
      (id) =>
        localStorage.setItem(
          'wallbait.save.v2',
          JSON.stringify({
            version: 2,
            campaign: 'foundry-v2',
            muted: true,
            reducedMotion: true,
            best: Object.fromEntries(
              Array.from({ length: id - 1 }, (_, i) => [
                String(i + 1),
                { timeMs: 10000, dodges: 0, beacons: 0, stars: 1 },
              ]),
            ),
          }),
        ),
      id,
    );
    await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') });
    await page.clock.pauseAt(new Date('2026-11-04T04:00:01Z'));
    await page.goto('/');
    await page
      .getByRole('button', { name: `继续挑战 · 第 ${id} 关` })
      .click({ force: true });
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('dialog')).toContainText('通关后保存');
    await page.getByRole('button', { name: '进入试验' }).click({ force: true });
    await page.clock.runFor(16);
    await expect(page.locator('.skills button')).toHaveCount(2);
    await expect(page.locator('#field-notes')).toContainText('待回收');
    const canvas = (await page.locator('canvas').boundingBox())!;
    const controls = (await page.locator('.controls').boundingBox())!;
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(controls.y);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (id === 11)
      await page.screenshot({
        path: `test-results/enrichment-map-${info.project.name}.png`,
      });
    const replay = replays.find((r) => r.level === id)!;
    const send = async (c: Replay['commands'][number]): Promise<void> => {
      if (c.direction) await page.keyboard.down(keys[c.direction]);
      if (c.dodge) await page.keyboard.press('Space');
      if (c.beacon) await page.keyboard.press('KeyE');
      await page.clock.runFor(120);
      if (c.direction) await page.keyboard.up(keys[c.direction]);
    };
    // 先验证携带时暂停和重开；固定时序回放在新一局连续执行，避免把暂停重置的帧余量混入命令时间表。
    let checkedCarry = false;
    for (const c of replay.commands) {
      await send(c);
      if (
        (await page.locator('#field-notes').textContent())?.includes(
          '已携带',
        ) &&
        (await page.locator('dialog').count()) === 0
      ) {
        checkedCarry = true;
        break;
      }
    }
    expect(checkedCarry).toBe(true);
    const saved = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('wallbait.save.v2')!).collections ?? {},
    );
    expect(saved[String(id)]).toBeUndefined();
    await page.getByRole('button', { name: '暂停游戏' }).click({ force: true });
    const notes = await page.locator('#field-notes').textContent();
    const clock = await page.locator('#clock').textContent();
    await page.clock.runFor(3200);
    expect(await page.locator('#field-notes').textContent()).toBe(notes);
    expect(await page.locator('#clock').textContent()).toBe(clock);
    await page.getByRole('button', { name: '重新挑战' }).click({ force: true });
    await expect(page.locator('canvas')).toBeVisible();
    await page.clock.runFor(16);
    await expect(page.locator('#field-notes')).toContainText('待回收');
    for (const c of replay.commands) await send(c);
    await page.clock.runFor(120);
    await expect(
      page.getByRole('heading', { name: '撞墙了吧！' }),
    ).toBeVisible();
    await expect(page.locator('.chip-note')).toContainText('芯片已归档');
    if (id !== 7)
      await expect(page.locator('.result-highlights')).toContainText(
        '借尸筑墙',
      );
    expect(checkedCarry).toBe(true);
    if (id === 11)
      await page.screenshot({
        path: `test-results/enrichment-win-${info.project.name}.png`,
      });
    // 初始化夹具只在本次加载种入旧进度，刷新必须读取真实通关写入的存档。
    const stored = await page.evaluate(() =>
      localStorage.getItem('wallbait.save.v2'),
    );
    await page.getByRole('button', { name: '返回选关' }).click({ force: true });
    await expect(
      page.locator(`[data-action="level:${id}"] .chip-label`),
    ).toHaveText('芯片 ✓');
    // addInitScript 每次刷新会执行：用独立页面验证，不带解锁夹具。
    const restored = await page.context().newPage();
    await restored.goto('/');
    await restored.reload();
    expect(
      await restored.evaluate(() => localStorage.getItem('wallbait.save.v2')),
    ).toBe(stored);
    await restored.getByRole('button', { name: '选择关卡' }).click();
    await expect(
      restored.locator(`[data-action="level:${id}"] .chip-label`),
    ).toHaveText('芯片 ✓');
    await expect(
      restored.getByRole('region', { name: '试验档案' }),
    ).toContainText('芯片 1 / 3');
    if (id === 11) {
      await restored.locator('.collection-notes').scrollIntoViewIfNeeded();
      await restored.screenshot({
        path: `test-results/enrichment-archive-${info.project.name}.png`,
      });
    }
    await restored.close();
    expect(errors).toEqual([]);
  });
}
