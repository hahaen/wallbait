import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Replay } from '../replay-search';

const fixture = new URL('../fixtures/skill-solutions.json', import.meta.url);
const keys = {
  up: 'ArrowUp',
  right: 'ArrowRight',
  down: 'ArrowDown',
  left: 'ArrowLeft',
};
async function send(
  page: Page,
  c: Replay['commands'][number],
  button = false,
  touch = false,
): Promise<void> {
  if (c.direction) await page.keyboard.down(keys[c.direction]);
  if (c.dodge) {
    if (!button) await page.keyboard.press('Space');
    else if (touch) await page.locator('[data-dodge]').tap({ force: true });
    else await page.locator('[data-dodge]').click({ force: true });
  }
  if (c.beacon) await page.keyboard.press('KeyE');
  await page.clock.runFor(120);
  if (c.direction) await page.keyboard.up(keys[c.direction]);
}
for (const example of [
  { id: 6, utility: 'pulse', name: '脉冲' },
  { id: 11, utility: 'magnet', name: '磁推' },
] as const) {
  test(`第${example.id}关选${example.name}、正常使用通关、换装重开及偏好恢复`, async ({
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
                { timeMs: 10000, dodges: 0, beacons: 0, stars: 3 },
              ]),
            ),
          }),
        ),
      example.id,
    );
    await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') });
    await page.clock.pauseAt(new Date('2026-11-04T04:00:01Z'));
    await page.goto('/');
    await page
      .getByRole('button', { name: `继续挑战 · 第 ${example.id} 关` })
      .click({ force: true });
    await expect(page.locator('canvas')).toBeVisible();
    const selected = page.locator(`[data-action="equip:${example.utility}"]`);
    await selected.click({ force: true });
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-dodge]')).toHaveAttribute(
      'aria-label',
      example.name,
    );
    await expect(page.locator('.skills button')).toHaveCount(2);
    const before = await page.locator('#clock').textContent();
    await page.clock.runFor(2000);
    expect(await page.locator('#clock').textContent()).toBe(before);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const optionBox = (await selected.boundingBox())!;
    expect(optionBox.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: '进入试验' }).click({ force: true });
    await page.clock.runFor(16);
    const canvas = (await page.locator('canvas').boundingBox())!,
      controls = (await page.locator('.controls').boundingBox())!;
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(controls.y);
    const replay = (
      JSON.parse(readFileSync(fixture, 'utf8')) as (Replay & { goal: string })[]
    ).find(
      (r) =>
        r.level === example.id &&
        r.utility === example.utility &&
        r.goal === 'loadout',
    )!;
    let captured = false;
    for (const c of replay.commands) {
      await send(page, c, true, info.project.name !== 'desktop');
      if (c.dodge && !captured) {
        captured = true;
        await page.screenshot({
          path: `test-results/skills-${example.utility}-${info.project.name}.png`,
        });
      }
    }
    await page.clock.runFor(1400);
    await expect(
      page.getByRole('heading', { name: '撞墙了吧！' }),
    ).toBeVisible();
    await expect(page.locator('.result-stats')).toContainText(
      `${example.name} / 信标`,
    );
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('wallbait.save.v2')!),
    );
    expect(saved.utility).toBe(example.utility);
    expect(saved.best[String(example.id)].scoring).toBe('chase-v2');
    await page.locator('.result-options summary').click({ force: true });
    await page
      .getByRole('button', { name: '更换装备', exact: true })
      .click({ force: true });
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#clock')).toHaveText('0.0s');
    await page.locator('[data-action="equip:dodge"]').click({ force: true });
    await expect(page.locator('[data-dodge]')).toHaveAttribute(
      'aria-label',
      '闪避',
    );
    const restored = await page.context().newPage();
    await restored.goto('/');
    expect(
      await restored.evaluate(
        () => JSON.parse(localStorage.getItem('wallbait.save.v2')!).utility,
      ),
    ).toBe('dodge');
    await restored.close();
    expect(errors).toEqual([]);
    expect(captured).toBe(true);
  });
}

test('早期关卡保留基础装备，旧星级标历史且不计入新战术星', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'wallbait.save.v2',
      JSON.stringify({
        version: 2,
        campaign: 'foundry-v2',
        utility: 'magnet',
        best: { 1: { timeMs: 1000, dodges: 0, beacons: 0, stars: 3 } },
      }),
    ),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '选择关卡' }).click();
  await expect(page.locator('[data-action="level:1"]')).toContainText(
    '历史 ★★★',
  );
  await page.locator('[data-action="level:1"]').click();
  await expect(page.locator('.loadout-options button')).toHaveCount(0);
  await expect(page.locator('[data-dodge]')).toHaveAttribute(
    'aria-label',
    '闪避',
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('wallbait.save.v2')!).utility,
    ),
  ).toBe('magnet');
});

for (const example of [
  { id: 12, warning: '2号截击蛇预告侧切', kind: 'sidestep' },
  { id: 14, warning: '1号侦察蛇预告干扰', kind: 'interference' },
]) {
  test(`第${example.id}关强化能力先预告、正常通关与暂停冻结`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
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
      example.id,
    );
    await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') });
    await page.clock.pauseAt(new Date('2026-11-04T04:00:01Z'));
    await page.goto('/');
    await page
      .getByRole('button', { name: `继续挑战 · 第 ${example.id} 关` })
      .click({ force: true });
    await expect(page.locator('canvas')).toBeVisible();
    await page.screenshot({
      path: `test-results/skills-prepare-${example.id}-${info.project.name}.png`,
    });
    await page.getByRole('button', { name: '进入试验' }).click({ force: true });
    await page.clock.runFor(16);
    const replay = (
      JSON.parse(
        readFileSync(
          new URL('../fixtures/ability-solutions.json', import.meta.url),
          'utf8',
        ),
      ) as Replay[]
    ).find((r) => r.level === example.id)!;
    let warned = false;
    for (const c of replay.commands) {
      await send(page, c);
      if (
        !warned &&
        (await page.locator('#play-status').textContent())?.includes(
          example.warning,
        )
      ) {
        warned = true;
        await page.screenshot({
          path: `test-results/skills-${example.kind}-${info.project.name}.png`,
        });
      }
    }
    await page.clock.runFor(1400);
    await expect(
      page.getByRole('heading', { name: '撞墙了吧！' }),
    ).toBeVisible();
    expect(warned).toBe(true);
    // 重新开局后等待能力预告，暂停必须连计时和地图提示一起冻结。
    await page.getByRole('button', { name: '重试本关' }).click({ force: true });
    await expect(page.locator('canvas')).toBeVisible();
    await page.clock.runFor(16);
    let frozen = false;
    for (const c of replay.commands) {
      await send(page, c);
      if (
        (await page.locator('#play-status').textContent())?.includes(
          example.warning,
        )
      ) {
        await page
          .getByRole('button', { name: '暂停游戏' })
          .click({ force: true });
        const clock = await page.locator('#clock').textContent(),
          status = await page.locator('#play-status').textContent();
        await page.clock.runFor(3000);
        expect(await page.locator('#clock').textContent()).toBe(clock);
        expect(await page.locator('#play-status').textContent()).toBe(status);
        frozen = true;
        break;
      }
    }
    expect(frozen).toBe(true);
  });
}
