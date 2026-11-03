import { defineConfig } from 'vitest/config';

// Core tests run against a real boxd (built with the sim tag by @cloudbox/testbox).
export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
