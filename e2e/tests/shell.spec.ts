import { expect, test } from '../fixtures.ts';
import { expectAccessible } from '../helpers/axe.ts';
import { cspViolations, watchCsp } from '../helpers/flows.ts';
import { expectNoSidewaysScroll, expectTabLabelsFit } from '../helpers/layout.ts';

test('fresh box shows setup', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Set up your Cloud Box' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page).toHaveTitle(/Set up your Cloud Box/);
  await expectAccessible(page);
});

test('CSP holds', async ({ page }) => {
  await watchCsp(page);
  const res = await page.goto('/');
  expect(res?.headers()['content-security-policy']).toContain("default-src 'self'");
  // The setup page renders only after libsodium (WebAssembly) has loaded.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Set up your Cloud Box' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-crypto', 'ready');
  expect(await cspViolations(page)).toEqual([]);
});

test('sim page absent in production build', async ({ page }) => {
  await page.goto('/sim');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Set up your Cloud Box' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /simulator/i })).toHaveCount(0);
});

test.describe('at 200% text', () => {
  // The test injects a style to double the text size; the app's CSP would
  // (rightly) block that, so only this test bypasses it.
  test.use({ bypassCSP: true, viewport: { width: 320, height: 640 } });

  test('a phone-width screen has no sideways scroll', async ({ page }) => {
    await page.goto('/');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoSidewaysScroll(page);
  });

  // The shell is reachable only once unlocked; Task 12 brings the unlock flow.
  test.fixme('the tab labels fit and do not overlap', async ({ page }) => {
    await page.goto('/photos');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expectNoSidewaysScroll(page);
    await expectTabLabelsFit(page);
  });
});
