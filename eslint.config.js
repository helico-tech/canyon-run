import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Math members whose results are only "implementation-approximated" and differ across engines. */
const BANNED_MATH = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'hypot',
  'cbrt',
  'random',
  'round',
];

export default defineConfig([
  globalIgnores(['dist/', 'node_modules/', 'coverage/', 'runs/', '.playwright-cli/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['src/cli/**', 'scripts/**', 'tools/**'],
    rules: { 'no-console': 'off' },
  },
  {
    // Deterministic core: no transcendentals, no clocks, no platform globals (ADR 0002).
    files: ['src/sim/**/*.ts', 'src/terrain/**/*.ts'],
    ignores: ['**/*.test.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-properties': [
        'error',
        ...BANNED_MATH.map((property) => ({
          object: 'Math',
          property,
          message: `Math.${property} is not bit-identical across engines; see ADR 0002.`,
        })),
      ],
      'no-restricted-globals': [
        'error',
        'Date',
        'performance',
        'window',
        'document',
        'navigator',
        'requestAnimationFrame',
        'setTimeout',
        'setInterval',
        'crypto',
        'fetch',
        'localStorage',
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "BinaryExpression[operator='**']", message: '** is Math.pow; see ADR 0002.' },
        {
          selector: "AssignmentExpression[operator='**=']",
          message: '** is Math.pow; see ADR 0002.',
        },
      ],
    },
  },
]);
