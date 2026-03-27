import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
    fileParallelism: false,
    setupFiles: ['src/server/__tests__/setup.ts'],
  },
});
