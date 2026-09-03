// ADR 0002: the same replay must produce the same checksums in every engine.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { firefox } from 'playwright';
import type { Browser, Page } from 'playwright';
import type { Replay } from '../../src/sim/replay.ts';
import { validateReplay } from '../../src/sim/replay.ts';
import { serveStatic } from '../../tools/headless/serve.ts';

const root = path.resolve(new URL('../../', import.meta.url).pathname);
const goldens = fs
  .readdirSync(path.join(root, 'tests', 'replays'))
  .filter((f) => f.endsWith('.json'))
  .map(
    (f) => JSON.parse(fs.readFileSync(path.join(root, 'tests', 'replays', f), 'utf8')) as Replay,
  );

async function replayInPage(
  page: Page,
  url: string,
  replay: Replay,
  nogl = false,
): Promise<{ checksum: string; score: number }> {
  await page.goto(`${url}/?test=1&seed=${replay.seed}&w=160&h=90${nogl ? '&nogl=1' : ''}`);
  await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60000 });
  await page.evaluate(
    (r) => window.__game!.loadReplay(r),
    replay as unknown as Record<string, unknown>,
  );
  let snap: Record<string, number | string> = {};
  for (let done = 0; done < replay.ticks; done += 300) {
    snap = await page.evaluate((n) => window.__game!.step(n), Math.min(300, replay.ticks - done));
  }
  return { checksum: String(snap.checksum), score: Number(snap.score) };
}

for (const replay of goldens) {
  test(`golden seed ${replay.seed} replays bit-identically in Chromium`, async ({ page }) => {
    const server = await serveStatic(path.join(root, 'dist'));
    try {
      const node = validateReplay(replay);
      expect(node.verdict).toBe('ok');
      const browser = await replayInPage(page, server.url, replay);
      expect(browser.checksum).toBe(replay.finalChecksum);
      expect(browser.score).toBe(replay.finalScore);
    } finally {
      server.close();
    }
  });
}

// Headless Firefox has no GL on this machine, so the sim runs without a renderer (?nogl=1).
test('golden seed 1 replays bit-identically in Firefox, sim only (skipped when Firefox cannot launch)', async () => {
  let browser: Browser;
  try {
    browser = await firefox.launch({ headless: true });
  } catch (err) {
    test.skip(true, `firefox unavailable: ${String(err).slice(0, 120)}`);
    return;
  }
  const server = await serveStatic(path.join(root, 'dist'));
  try {
    const page = await browser.newPage({ viewport: { width: 160, height: 90 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const replay = goldens.find((r) => r.seed === 1)!;
    const result = await replayInPage(page, server.url, replay, true);
    expect(errors).toEqual([]);
    expect(result.checksum).toBe(replay.finalChecksum);
    expect(result.score).toBe(replay.finalScore);
  } finally {
    server.close();
    await browser.close();
  }
});

test('a replay recorded in the browser validates in Node', async ({ page }) => {
  const server = await serveStatic(path.join(root, 'dist'));
  try {
    await page.goto(`${server.url}/?test=1&seed=5&w=160&h=90`);
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60000 });
    await page.evaluate(() => window.__game!.step(400));
    const replay = (await page.evaluate(() => window.__game!.replay())) as Replay;
    expect(replay.ticks).toBe(400);
    const v = validateReplay(replay);
    expect(v.verdict).toBe('ok');
    if (v.verdict === 'ok') expect(v.score).toBe(replay.finalScore);
  } finally {
    server.close();
  }
});
