import { expect, test } from 'vitest';
import { SIM_VERSION } from './version.ts';

test('sim version is semver', () => {
  expect(SIM_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});
