// Shared Playwright helpers for headless runs.
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';

export interface ConsoleRecord {
  errors: string[];
  warnings: string[];
}

/** SwiftShader emits this on every readback; it is noise, not an error. */
const IGNORED = [/GPU stall due to ReadPixels/, /Automatic fallback to software WebGL/];

export async function openPage(
  url: string,
  opts: { width: number; height: number; initScript?: string } = { width: 640, height: 360 },
): Promise<{ browser: Browser; page: Page; console: ConsoleRecord }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
  });
  if (opts.initScript) await context.addInitScript(opts.initScript);
  const page = await context.newPage();
  const record: ConsoleRecord = { errors: [], warnings: [] };
  page.on('console', (msg) => {
    const text = msg.text();
    if (IGNORED.some((re) => re.test(text))) return;
    if (msg.type() === 'error') record.errors.push(text);
    else if (msg.type() === 'warning') record.warnings.push(text);
  });
  page.on('pageerror', (err) => record.errors.push(`pageerror: ${err.message}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60000 });
  return { browser, page, console: record };
}
