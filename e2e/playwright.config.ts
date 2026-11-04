import { defineConfig, devices } from '@playwright/test';

// Every test gets its own boxd (sim hardware, fresh data dir) serving the
// production web build, so tests never share state. Chromium only in M2
// (Firefox and WebKit join at the M5 gate). Traces and videos are never kept:
// pages show decrypted photos and recovery words.
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ignoreHTTPSErrors: true,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
