// vitest.config.ts — configuration for the Vitest test runner.
//
// Vitest transpiles TypeScript on the fly (via esbuild), so tests run
// straight from src/ with no build step — the same tsx-style ergonomics we
// use in dev. This config is intentionally minimal.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node, not jsdom: this is a backend. No browser globals to emulate.
    environment: 'node',
    // Test files live next to the code they test, named *.test.ts.
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Report on the SOURCE, not the tests or config — measuring the tests'
      // own coverage is meaningless.
      include: ['src/**/*.ts'],
      // Exclude tests, the server bootstrap (no logic, just wiring + listen),
      // and .d.ts files (type-only, no runtime code to cover).
      exclude: ['src/**/*.test.ts', 'src/server.ts', 'src/**/*.d.ts'],
      reporter: ['text', 'html'],
    },
  },
});
