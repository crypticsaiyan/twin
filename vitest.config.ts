import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Process glue only; everything behind it is tested through injected fakes.
      exclude: ['src/bin.ts', 'src/io.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
