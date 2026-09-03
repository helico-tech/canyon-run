import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
    // Terrain census tests build many chunks; CI runners are slower than the dev VM.
    testTimeout: 60000,
  },
});
