import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { expectAccessible } from '../helpers/axe.ts';
import { setUpThroughUi } from '../helpers/flows.ts';
import { expectNoSidewaysScroll } from '../helpers/layout.ts';

test.setTimeout(150_000);

const fixture = (n: number) => join(import.meta.dirname, '..', 'fixtures', `photo-${n}.jpg`);
const tiles = (page: Page) => page.getByRole('link', { name: /^Photo, / });

async function openTrash(page: Page, count: number) {
  await page.getByRole('link', { name: 'Albums' }).first().click();
  await page.getByRole('link', { name: `Trash · ${count}` }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Trash' })).toBeVisible();
}

async function moveToTrash(page: Page) {
  const sheet = page.getByRole('dialog', { name: /^Delete / });
  await sheet.getByRole('button', { name: 'Move to Trash' }).click();
  await expect(sheet).toBeHidden({ timeout: 30_000 });
}

// Journey 4: delete, find it in Trash with its days left, restore it, delete
// it for good, and let the 30-day purge take another.
test('journey 4: Trash, restore, delete forever and the 30-day purge', async ({ page, box }) => {
  await setUpThroughUi(page, box, { name: 'Laptop browser' });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload photos' }).click();
  await (await chooser).setFiles([fixture(1), fixture(2)]);
  await expect(page.getByRole('heading', { name: 'Upload finished' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(tiles(page)).toHaveCount(2);

  // Delete one from the viewer: it shows the other photo next.
  await tiles(page).first().click();
  const viewerUrl = page.url();
  await page.getByRole('button', { name: 'Delete' }).click();
  await moveToTrash(page);
  await expect(page).not.toHaveURL(viewerUrl);
  // Focus goes to the next photo's heading (announcing it), not to the page.
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(tiles(page)).toHaveCount(1);

  await openTrash(page, 1);
  const row = page.getByRole('listitem');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('30 days left');
  const name = (await row.locator('.trash-row__name').textContent()) ?? '';
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);

  // Restore: the row goes and a status line says so.
  await page.getByRole('button', { name: `Restore ${name}` }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Restored' })).toHaveText(
    `Restored ${name}`,
  );
  await expect(page.getByRole('heading', { name: 'Trash is empty' })).toBeVisible();
  await page.getByRole('link', { name: 'Photos' }).first().click();
  await expect(tiles(page)).toHaveCount(2);

  // Delete it again from Select mode, then Delete forever with its confirm.
  await page.getByRole('button', { name: 'Select' }).click();
  await page.getByRole('checkbox').first().check();
  await page.locator('.select-bar').getByRole('button', { name: 'Delete' }).click();
  await moveToTrash(page);
  await expect(tiles(page)).toHaveCount(1);
  // The select bar's Delete went with the selection: focus lands on Select.
  await expect(page.getByRole('button', { name: 'Select' })).toBeFocused();
  await openTrash(page, 1);
  await page.getByRole('button', { name: /^Delete forever / }).click();
  const confirm = page.getByRole('dialog', { name: "Delete forever? This can't be undone." });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expectAccessible(page);
  await confirm.getByRole('button', { name: 'Delete forever' }).click();
  await expect(page.getByRole('heading', { name: 'Trash is empty' })).toBeVisible();

  // The other one: trashed, then the box's 30-day purge removes it.
  await page.getByRole('link', { name: 'Photos' }).first().click();
  await tiles(page).first().click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await moveToTrash(page);
  await expect(page.getByText('No photos yet')).toBeVisible();
  await openTrash(page, 1);
  await expect(page.getByRole('button', { name: 'Empty Trash' })).toBeVisible();
  await page.getByRole('button', { name: 'Empty Trash' }).click();
  const empty = page.getByRole('dialog', { name: 'Empty Trash?' });
  await expect(empty).toContainText("Delete 1 item forever? This can't be undone.");
  await expectAccessible(page);
  await empty.getByRole('button', { name: 'Cancel' }).click();

  await box.sim.advanceClock(31 * 86_400);
  await box.sim.runJob('purge');
  await page.reload();
  await page.getByLabel('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Unlock' }).click();
  // Every load asks for the password (scope ruling S3), so move around in the app.
  await expect(page.getByText('No photos yet')).toBeVisible({ timeout: 30_000 });
  await openTrash(page, 0);
  await expect(page.getByRole('heading', { name: 'Trash is empty' })).toBeVisible();
});
