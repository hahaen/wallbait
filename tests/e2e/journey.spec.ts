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
test('原生键盘输入从第一关连续闯到 20 关通关，刷新后自由重玩', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    '连续关卡使用桌面原生键盘；移动流程独立验证',
  );
  test.setTimeout(600000);
  await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-04T04:00:01Z'));
  await page.goto('/');
  await page
    .getByRole('button', { name: '开始游戏', exact: true })
    .click({ force: true });
  let capturedMultiWarning = false;
  for (const replay of replays) {
    await expect(page.locator('canvas')).toBeVisible();
    await page
      .getByRole('button', { name: '进入试验', exact: true })
      .click({ force: true });
    // Phaser 在首帧初始化场景；随后与规则回放同为 120ms 一个输入段。
    await page.clock.runFor(16);
    for (const command of replay.commands) {
      if (command.direction) await page.keyboard.down(keys[command.direction]);
      if (command.dodge) await page.keyboard.press('Space');
      if (command.beacon) await page.keyboard.press('KeyE');
      await page.clock.runFor(120);
      if (!capturedMultiWarning && replay.level >= 6) {
        const status = await page.locator('#play-status').textContent();
        if ((status?.match(/蓄力|冲刺/g)?.length ?? 0) >= 2) {
          await page.screenshot({
            path: 'test-results/usability-multi-warning.png',
          });
          capturedMultiWarning = true;
        }
      }
      if (command.direction) await page.keyboard.up(keys[command.direction]);
    }
    await page.clock.runFor(120);
    await expect(
      page.getByRole('heading', {
        name: replay.level === 20 ? '墙都记住你了！' : '撞墙了吧！',
      }),
      `第 ${replay.level} 关`,
    ).toBeVisible();
    if (replay.level < 20)
      await page
        .getByRole('button', { name: '下一关', exact: true })
        .click({ force: true });
  }
  expect(capturedMultiWarning).toBe(true);
  await page.screenshot({ path: 'test-results/all-clear.png' });
  await page.getByRole('button', { name: '自由重玩' }).click({ force: true });
  await expect(page.locator('.level:enabled')).toHaveCount(20);
  await page.reload();
  await expect(page.getByText('20 关已通关，自由重玩')).toBeVisible();
});
