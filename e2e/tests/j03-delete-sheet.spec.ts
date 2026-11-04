import { join } from 'node:path';
import { expect, test } from '../fixtures.ts';
import { expectAccessible } from '../helpers/axe.ts';
import { cspViolations, PASSWORD, setUpThroughUi, watchCsp } from '../helpers/flows.ts';

test.setTimeout(120_000);

const fixture = (n: number) => join(import.meta.dirname, '..', 'fixtures', `photo-${n}.jpg`);

// Journey 3, web form (scope ruling S5): the delete sheet never removes anything
// until "Move to Trash" is chosen; Cancel and Esc both keep the photo.
test('journey 3: the delete sheet keeps the photo unless you choose Trash', async ({
  page,
  box,
}) => {
  await watchCsp(page);
  await setUpThroughUi(page, box, { name: 'Laptop browser' });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload photos' }).click();
  await (await chooser).setFiles([fixture(1)]);
  await expect(page.getByRole('heading', { name: 'Upload finished' })).toBeVisible({
    timeout: 60_000,
  });
  const tile = page.getByRole('link', { name: /^Photo, / });
  await expect(tile).toHaveCount(1);

  await tile.click();
  const del = page.getByRole('button', { name: 'Delete' });
  await del.click();
  const sheet = page.getByRole('dialog', { name: 'Delete this photo?' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('It stays safe on your box until you choose.');
  await expect(sheet).toContainText('You can restore it from Trash for 30 days.');
  await expect(sheet.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expectAccessible(page);

  // Esc closes the sheet, not the viewer, and focus goes back to Delete.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/photos\/[^/]+$/);
  await expect(del).toBeFocused();

  await del.click();
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toBeHidden();

  // Still on the box: a fresh load (which syncs /v1/items from scratch) shows it.
  await page.reload();
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('link', { name: /^Photo, / })).toHaveCount(1, { timeout: 30_000 });

  expect(await cspViolations(page)).toEqual([]);
});
