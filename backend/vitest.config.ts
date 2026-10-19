import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Database-backed tests share one schema, so they must not run in parallel.
    fileParallelism: false,
    setupFiles: ['tests/setup.ts'],
  },
});
