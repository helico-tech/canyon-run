import path from 'node:path';
import { expect, test } from '@playwright/test';
import { serveStatic } from '../../tools/headless/serve.ts';

const root = path.resolve(new URL('../../', import.meta.url).pathname);

test('the real-time loop runs and keyboard input reaches the sim', async ({ page }) => {
  const server = await serveStatic(path.join(root, 'dist'));
  try {
    await page.setViewportSize({ width: 480, height: 270 });
    await page.goto(`${server.url}/?debug=1&seed=1`);
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60000 });
    await page.waitForFunction(() => Number(window.__game!.state().tick) > 10, undefined, {
      timeout: 30000,
    });
    await page.mouse.click(240, 135);
    const before = await page.evaluate(() => window.__game!.state());
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(400);
    const during = await page.evaluate(() => window.__game!.state());
    await page.keyboard.up('KeyS');
    expect(Number(during.tick)).toBeGreaterThan(Number(before.tick));
    expect(Number(during.pitchRate)).toBeGreaterThan(0.2);
    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(400);
    const throttled = await page.evaluate(() => window.__game!.state());
    await page.keyboard.up('ShiftLeft');
    expect(Number(throttled.throttle)).toBeGreaterThan(Number(during.throttle));
    const errors = await page.evaluate(() => window.__errors ?? []);
    expect(errors).toEqual([]);
  } finally {
    server.close();
  }
});
