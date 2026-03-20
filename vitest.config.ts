import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup/gas-stubs.ts'],
    coverage: {
      provider: 'v8',
      include: ['app/gas/src/**/*.ts'],
      exclude: [
        'app/gas/src/tests/**',
        'app/gas/src/types/**',
      ],
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
    },
  },
});
