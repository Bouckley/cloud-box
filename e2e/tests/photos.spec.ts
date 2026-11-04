import { join } from 'node:path';
import { expect, test } from '../fixtures.ts';
import { expectAccessible } from '../helpers/axe.ts';
import { setUpThroughUi } from '../helpers/flows.ts';
import { expectNoSidewaysScroll } from '../helpers/layout.ts';

// Argon2id at full strength, and one status poll (30 s) after replication.
test.setTimeout(150_000);

const fixture = (n: number) => join(import.meta.dirname, '..', 'fixtures', `photo-${n}.jpg`);

async function upload(page: import('@playwright/test').Page, files: string[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload photos' }).click();
  await (await chooser).setFiles(files);
}

test('photos: upload, safe after the backup copy, viewer, duplicates', async ({ page, box }) => {
  const violations: string[] = [];
  await page.exposeFunction('cspViolation', (d: string) => violations.push(d));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { cspViolation(d: string): void }).cspViolation(
        `${e.violatedDirective} ${e.blockedURI}`,
      ),
    );
  });

  await setUpThroughUi(page, box, { name: 'Laptop browser' });
  await expect(page.getByText('No photos yet')).toBeVisible();

  await upload(page, [fixture(1), fixture(2), fixture(3)]);
  const panel = page.getByRole('region', { name: /Uploading|Upload finished/ });
  await expect(panel).toBeVisible();
  await expectAccessible(page);
  await expect(page.getByRole('heading', { name: 'Upload finished' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole('link', { name: /^Photo, / })).toHaveCount(3);
  // Thumbnails were made on this computer and decrypt back into the tiles.
  await expect(page.locator('.tile img')).toHaveCount(3);

  const banner = page.getByRole('status').filter({ hasText: /backup copy|safe/ });
  await expect(banner).toContainText('3 waiting for the backup copy');

  await box.sim.runJob('replicate');
  await expect(banner).toContainText('All 3 photos are safe', { timeout: 35_000 });
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);

  // Viewer: open the first, ←/→ move, Esc closes and focus goes back to the tile.
  const first = page.getByRole('link', { name: /^Photo, / }).first();
  const firstHref = await first.getAttribute('href');
  await first.click();
  await expect(page).toHaveURL(/\/photos\/[^/]+$/);
  const viewerUrl = page.url();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.viewer__media').first()).toBeVisible();
  await expectAccessible(page);
  await page.keyboard.press('ArrowRight');
  await expect(page).not.toHaveURL(viewerUrl);
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(viewerUrl);
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(page.getByText('Safe: on your box and the backup copy')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/photos$/);
  await expect(page.locator(`a.tile[href="${firstHref}"]`)).toBeFocused();

  // The same photo again: not uploaded twice.
  await upload(page, [fixture(1)]);
  await expect(page.getByText('Already on your box')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: /^Photo, / })).toHaveCount(3);
  await expectAccessible(page);

  // Grouping changes the rows, not the photos.
  await page.getByRole('button', { name: 'Months' }).click();
  await expect(page.getByRole('button', { name: 'Months' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('link', { name: /^Photo, / })).toHaveCount(3);

  expect(violations).toEqual([]);
});
