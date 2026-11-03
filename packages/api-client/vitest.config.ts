import { defineConfig } from 'vitest/config';

// The contract test builds and runs boxd; it has its own config (test:contract).
export default defineConfig({
  test: { exclude: ['**/node_modules/**', 'test/contract/**'] },
});
