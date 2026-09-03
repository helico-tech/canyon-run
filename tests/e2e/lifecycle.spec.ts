import path from 'node:path';
import { expect, test } from '@playwright/test';
import { serveStatic } from '../../tools/headless/serve.ts';

const root = path.resolve(new URL('../../', import.meta.url).pathname);

test('start screen, death, run-over panel and R restart', async ({ page }) => {
  const server = await serveStatic(path.join(root, 'dist'));
  try {
    await page.setViewportSize({ width: 480, height: 270 });
    await page.goto(`${server.url}/?debug=1&seed=1`);
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60000 });
    await expect(page.locator('.screen.start')).toBeVisible();
    expect(await page.evaluate(() => window.__game!.state().phase)).toBe('idle');
    await page.locator('.screen.start .cta').click();
    await expect(page.locator('.screen.start')).toBeHidden();
    await page.waitForFunction(() => Number(window.__game!.state().tick) > 5, undefined, {
      timeout: 30000,
    });
    // Fly into the wall: 200 u to the side of the start is rock.
    await page.evaluate(() => {
      const s = window.__game!.state();
      window.__game!.teleport(Number(s.x) + 200, Number(s.y), Number(s.z));
    });
    await page.waitForFunction(() => window.__game!.state().phase === 'dead', undefined, {
      timeout: 10000,
    });
    await expect(page.locator('.screen.over')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.screen.over .seed')).toHaveText(/0000-0001/);
    const deadTick = Number(await page.evaluate(() => window.__game!.state().tick));
    expect(deadTick).toBeGreaterThan(5);
    await page.keyboard.press('KeyR');
    await expect(page.locator('.screen.over')).toBeHidden();
    await page.waitForFunction(() => window.__game!.state().phase === 'running', undefined, {
      timeout: 5000,
    });
    const after = await page.evaluate(() => window.__game!.state());
    expect(Number(after.tick)).toBeLessThan(deadTick);
    expect(after.alive).toBe(1);
    expect(await page.evaluate(() => window.__errors ?? [])).toEqual([]);
  } finally {
    server.close();
  }
});

test('a test-API restart moves the HUD seed label and probe to the new world', async ({ page }) => {
  const server = await serveStatic(path.join(root, 'dist'));
  try {
    await page.goto(`${server.url}/?test=1&seed=1&nogl=1`);
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60000 });
    await expect(page.locator('.seed')).toHaveText(/0000-0001/);
    await page.evaluate(() => window.__game!.restart(2));
    await expect(page.locator('.seed')).toHaveText(/0000-0002/);
    await page.evaluate(() => window.__game!.step(5));
    expect(Number(await page.evaluate(() => window.__game!.state().tick))).toBe(5);
  } finally {
    await server.close();
  }
});

test('settings on the start screen do not start a run and persist across a reload', async ({
  page,
}) => {
  const server = await serveStatic(path.join(root, 'dist'));
  try {
    await page.goto(`${server.url}/?debug=1&seed=1`);
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60000 });
    await expect(page.locator('.screen.start')).toBeVisible();
    await page.locator('.screen.start .invert').check();
    await page.locator('.screen.start .sens').fill('1.5');
    await expect(page.locator('.screen.start')).toBeVisible();
    expect(await page.evaluate(() => window.__game!.state().phase)).toBe('idle');
    await page.reload();
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60000 });
    await expect(page.locator('.screen.start .invert')).toBeChecked();
    await expect(page.locator('.screen.start .sens')).toHaveValue('1.5');
    await expect(page.locator('.screen.start .sensv')).toHaveText('1.5');
  } finally {
    await server.close();
  }
});

test('debug mode shows a frame-rate readout once flying', async ({ page }) => {
  const server = await serveStatic(path.join(root, 'dist'));
  try {
    await page.goto(`${server.url}/?debug=1&seed=1`);
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60000 });
    await page.locator('.screen.start .cta').click();
    await expect(page.locator('#hud .fps')).toHaveText(/^\d+ fps$/, { timeout: 10000 });
    // Without debug the element exists but stays hidden (no test API on this page).
    await page.goto(`${server.url}/?seed=1`);
    await page.locator('#hud').waitFor({ state: 'attached', timeout: 60000 });
    await expect(page.locator('#hud .fps')).toBeHidden();
  } finally {
    await server.close();
  }
});
