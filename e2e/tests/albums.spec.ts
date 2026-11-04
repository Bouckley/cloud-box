import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { expectAccessible } from '../helpers/axe.ts';
import { cspViolations, setUpThroughUi, watchCsp } from '../helpers/flows.ts';
import { expectNoSidewaysScroll } from '../helpers/layout.ts';

test.setTimeout(150_000);

const fixture = (n: number) => join(import.meta.dirname, '..', 'fixtures', `photo-${n}.jpg`);
const tiles = (page: Page) => page.getByRole('link', { name: /^(Photo|Video), / });
const nav = (page: Page, name: string) => page.getByRole('link', { name }).first();

// Journey 15: make an album, add photos, favourite one, move one to a second
// album (confirming the move), delete the first album keeping the photos.
test('albums: make Garden, add two photos, favourite one, delete it keeping them', async ({
  page,
  box,
}) => {
  await watchCsp(page);
  await setUpThroughUi(page, box, { name: 'Laptop browser' });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload photos' }).click();
  await (await chooser).setFiles([fixture(1), fixture(2), fixture(3)]);
  await expect(page.getByRole('heading', { name: 'Upload finished' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(tiles(page)).toHaveCount(3);

  // Albums: nothing yet, then New album → Garden, which opens empty.
  await nav(page, 'Albums').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Albums' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No albums yet' })).toBeVisible();
  await page.getByRole('button', { name: 'New album' }).click();
  const create = page.getByRole('dialog', { name: 'New album' });
  await expect(create.getByRole('textbox', { name: 'Name' })).toBeFocused();
  await expectAccessible(page);
  await create.getByRole('textbox', { name: 'Name' }).fill('Garden');
  await create.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Garden' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No photos in this album yet' })).toBeVisible();

  // Photos: select two, Add to album → Garden.
  await nav(page, 'Photos').click();
  await page.getByRole('button', { name: 'Select' }).click();
  await page.getByRole('checkbox').nth(0).check();
  await page.getByRole('checkbox').nth(1).check();
  await page.locator('.select-bar').getByRole('button', { name: 'Add to album' }).click();
  const picker = page.getByRole('dialog', { name: 'Add to album' });
  await expect(picker.getByRole('radio', { name: 'Garden' })).toBeChecked();
  await expectAccessible(page);
  await picker.getByRole('button', { name: 'Add' }).click();
  await expect(picker).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Added to Garden' })).toBeVisible();
  // One collection per item, but Photos still shows every photo.
  await expect(tiles(page)).toHaveCount(3);

  // Garden holds the two, and its viewer stays inside the album.
  await nav(page, 'Albums').click();
  const garden = page.getByRole('link', { name: /^Garden/ });
  await expect(garden).toContainText('2 photos');
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);
  await garden.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Garden' })).toBeVisible();
  await expect(tiles(page)).toHaveCount(2);
  await expectAccessible(page);

  // Favourite one from inside the album; it shows in Favourites.
  await tiles(page).first().click();
  await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
  await page.getByRole('button', { name: 'Favourite' }).click();
  await expect(page.getByRole('button', { name: 'Favourite' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Next' }).click();
  // The second of two in Garden: no Next, though Photos has three.
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { level: 1, name: 'Garden' })).toBeVisible();
  await page.getByRole('link', { name: 'Albums', exact: true }).first().click();
  await page.getByRole('link', { name: 'Favourites' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Favourites' })).toBeVisible();
  await expect(tiles(page)).toHaveCount(1);

  // Videos counts videos, not photos.
  await nav(page, 'Albums').click();
  await page.getByRole('link', { name: 'Videos' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Videos' })).toBeVisible();
  await expect(page.getByText('0 videos')).toBeVisible();

  // From inside Garden, select a photo and move it to a new album: the move is
  // shown first, Cancel goes back.
  await nav(page, 'Albums').click();
  await page.getByRole('link', { name: /^Garden/ }).click();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Selection' })).toContainText('Choose photos');
  await page.getByRole('checkbox').nth(0).check();
  // Inside an album the photos move, so the button says so.
  await expect(
    page.locator('.select-bar').getByRole('button', { name: 'Add to album' }),
  ).toHaveCount(0);
  await page.locator('.select-bar').getByRole('button', { name: 'Move to album' }).click();
  const pick = page.getByRole('dialog', { name: 'Add to album' });
  await expect(pick.getByRole('radio', { name: 'New album' })).toBeChecked();
  await pick.getByRole('textbox', { name: 'Album name' }).fill('Trips');
  await pick.getByRole('button', { name: 'Add' }).click();
  const confirm = page.getByRole('dialog', { name: 'Move this photo?' });
  await expect(confirm.getByRole('region', { name: 'Leaving' })).toContainText('Garden');
  await expect(confirm.getByRole('region', { name: 'Moving to' })).toContainText('Trips');
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expectAccessible(page);
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(pick).toBeVisible();
  await expect(pick.getByRole('textbox', { name: 'Album name' })).toHaveValue('Trips');
  await pick.getByRole('button', { name: 'Add' }).click();
  await confirm.getByRole('button', { name: 'Move photo' }).click();
  await expect(confirm).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Moved to Trips' })).toBeVisible();
  // It left Garden, and Select mode ended.
  await expect(tiles(page)).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Selection' })).toHaveCount(0);
  await expectAccessible(page);
  await nav(page, 'Albums').click();
  await expect(page.getByRole('link', { name: /^Garden/ })).toContainText('1 photo');
  await expect(page.getByRole('link', { name: /^Trips/ })).toContainText('1 photo');

  // Delete Garden, keeping the photos (the default).
  await nav(page, 'Albums').click();
  await page.getByRole('link', { name: /^Garden/ }).click();
  await page.getByRole('button', { name: 'Delete album' }).click();
  const del = page.getByRole('dialog', { name: 'Delete "Garden"?' });
  // Garden holds one photo now (the other moved to Trips).
  await expect(del.getByRole('radio', { name: 'Keep the photo' })).toBeChecked();
  await expect(del.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expectAccessible(page);
  await del.getByRole('button', { name: 'Delete album' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Albums' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('link', { name: /^Garden/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Trips/ })).toBeVisible();
  await nav(page, 'Photos').click();
  await expect(tiles(page)).toHaveCount(3);

  expect(await cspViolations(page)).toEqual([]);
});
