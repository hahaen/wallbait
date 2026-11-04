import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Replay } from '../replay-search';

const replays = JSON.parse(
  readFileSync(new URL('../fixtures/solutions.json', import.meta.url), 'utf8'),
) as Replay[];
const keys = {
  up: 'ArrowUp',
  right: 'ArrowRight',
  down: 'ArrowDown',
  left: 'ArrowLeft',
};

test('合法闯到信标教学：踏板开门、双技能触控、电量与暂停恢复', async ({
  page,
  context,
  browserName,
}, info) => {
  test.skip(
    browserName !== 'chromium',
    '此项用 Chromium CDP 验证真实多指；WebKit 输入边界另测',
  );
  test.setTimeout(240000);
  if (info.project.name === 'mobile')
    await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-04T04:00:01Z'));
  await page.goto('/');
  await page.screenshot({
    path: `docs/testing/evidence/advanced-home-${info.project.name}.png`,
  });
  await page
    .getByRole('button', { name: '开始游戏', exact: true })
    .click({ force: true });
  let sawOpenGate = false;
  for (const replay of replays.slice(0, 4)) {
    await expect(page.locator('canvas')).toBeVisible();
    await page
      .getByRole('button', { name: '进入试验', exact: true })
      .click({ force: true });
    await page.clock.runFor(16);
    for (const command of replay.commands) {
      if (command.direction) await page.keyboard.down(keys[command.direction]);
      if (command.dodge) await page.keyboard.press('Space');
      if (command.beacon) await page.keyboard.press('KeyE');
      await page.clock.runFor(120);
      if (command.direction) await page.keyboard.up(keys[command.direction]);
      if (
        replay.level === 4 &&
        !sawOpenGate &&
        (await page.locator('#mechanisms').textContent())?.includes('A 开')
      ) {
        sawOpenGate = true;
        await page.screenshot({
          path: `docs/testing/evidence/advanced-gate-${info.project.name}.png`,
        });
      }
    }
    await page.clock.runFor(120);
    await expect(
      page.getByRole('heading', { name: '撞墙了吧！' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: '下一关', exact: true })
      .click({ force: true });
  }
  expect(sawOpenGate).toBe(true);
  // 第五关由真实前四关通关解锁。未改存档、坐标、敌人或胜负。
  await expect(
    page.getByRole('heading', { name: '送它一个信号' }),
  ).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await page
    .getByRole('button', { name: '进入试验', exact: true })
    .click({ force: true });
  await page.clock.runFor(16);
  const client = await context.newCDPSession(page);
  const touch = async (selector: string, id: number) => {
    const box = (await page.locator(selector).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
  };
  const left = await touch('[data-direction="left"]', 1);
  const beacon = await touch('[data-beacon]', 2);
  const dodge = await touch('[data-dodge]', 3);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [left],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [left, beacon],
  });
  await page.clock.runFor(40);
  await expect(page.locator('#cooldown')).toContainText('▰▱');
  await expect(page.locator('#mechanisms')).toContainText('信标 2.');
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [left],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [left, dodge],
  });
  await page.clock.runFor(40);
  await expect(page.locator('#cooldown')).toContainText('▱▱');
  await expect(page.locator('[data-direction="left"]')).toHaveClass(/pressed/);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  await expect(page.locator('.pressed')).toHaveCount(0);
  await page.screenshot({
    path: `docs/testing/evidence/advanced-skills-${info.project.name}.png`,
  });
  await page.keyboard.press('p');
  const clock = await page.locator('#clock').textContent();
  const mechanisms = await page.locator('#mechanisms').textContent();
  const energy = await page.locator('#cooldown').textContent();
  await page.clock.runFor(1600);
  expect(await page.locator('#clock').textContent()).toBe(clock);
  expect(await page.locator('#mechanisms').textContent()).toBe(mechanisms);
  expect(await page.locator('#cooldown').textContent()).toBe(energy);
  await page.getByRole('button', { name: '继续游戏' }).click({ force: true });
  await page.clock.runFor(1200);
  await expect(page.locator('#mechanisms')).toContainText('信标 1.');
  await page.keyboard.press('p');
  await page.getByRole('button', { name: '重新挑战' }).click({ force: true });
  await page.clock.runFor(16);
  await expect(page.locator('#cooldown')).toContainText('▰▰');
  await expect(page.locator('#mechanisms')).toHaveText('闪避 / 信标共用电量');
  await expect(page.getByRole('heading', { name: '试验准备' })).toHaveCount(0);
});
