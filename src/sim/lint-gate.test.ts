import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

const root = new URL('../../', import.meta.url).pathname;

async function ruleIdsFor(code: string, filePath: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'parse');
}

test('sim and terrain reject transcendental Math, clocks and ** (ADR 0002)', async () => {
  const code = [
    'export const a = Math.sin(1);',
    'export const b = 2 ** 3;',
    'export const c = Date.now();',
    'export const d = Math.round(1.5);',
    '',
  ].join('\n');
  const ids = await ruleIdsFor(code, `${root}src/sim/fixture.ts`);
  expect(ids).toContain('no-restricted-properties');
  expect(ids).toContain('no-restricted-syntax');
  expect(ids).toContain('no-restricted-globals');
  expect(ids.filter((id) => id === 'no-restricted-properties')).toHaveLength(2);
  const terrainIds = await ruleIdsFor(code, `${root}src/terrain/fixture.ts`);
  expect(terrainIds).toEqual(ids);
});

test('the same code is allowed outside the deterministic core', async () => {
  const ids = await ruleIdsFor(
    'export const a = Math.sin(1) + Date.now();\n',
    `${root}src/render/fixture.ts`,
  );
  expect(ids).toEqual([]);
});

test('deterministic operations stay allowed in the core', async () => {
  const code =
    'export const a = Math.sqrt(2) + Math.floor(1.5) + Math.imul(3, 4) + Math.abs(-1);\n';
  expect(await ruleIdsFor(code, `${root}src/sim/fixture.ts`)).toEqual([]);
});
