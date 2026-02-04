import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test-integration/cjs/**/*.test.mjs'],
    coverage: {
      enabled: false,
    },
  },
});
