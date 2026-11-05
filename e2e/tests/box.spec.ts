import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { expectAccessible } from '../helpers/axe.ts';
import {
  addDeviceCode,
  connectNewBrowser,
  cspViolations,
  PASSWORD,
  setUpThroughUi,
  watchCsp,
} from '../helpers/flows.ts';
import { expectNoSidewaysScroll } from '../helpers/layout.ts';

// Argon2id runs in the browser at full strength several times.
test.setTimeout(180_000);

const NEW_PASSWORD = 'a much longer new password';
const toBox = (page: Page) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Box/ }).click();

// Journey 17: read Box, pair a second browser with its code (and QR), change
// the password, lock and unlock with the new one, then remove the second browser.
test('box: storage, copies, add a device, change password, lock, revoke', async ({
  page,
  box,
  browser,
}) => {
  await watchCsp(page);
  await setUpThroughUi(page, box, { name: 'Laptop browser' });
  await toBox(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Box' })).toBeVisible();

  // The status card leads; Storage and Copies follow.
  await expect(page.locator('[data-banner] .banner--large')).toBeVisible();
  const storage = page.getByRole('region', { name: 'Storage' });
  await expect(storage).toContainText(/of .* used/);
  await expect(storage.getByRole('img')).toHaveAccessibleName(/free$/);
  const copies = page.getByRole('region', { name: 'Copies' });
  await expect(copies.getByRole('listitem', { name: 'Main drive' })).toContainText('Connected');
  await expect(copies.getByRole('listitem', { name: 'Backup copy' })).toContainText(
    'Not copied yet',
  );
  await expect(page.getByText(/healthy/i)).toHaveCount(0);
  // Only one device: its Revoke is disabled and says why.
  await expect(page.getByRole('button', { name: 'Revoke Laptop browser' })).toBeDisabled();
  await expectAccessible(page);
  await expectNoSidewaysScroll(page);

  // Add a device: the code in groups of four, a QR of it, and how long it lasts.
  const code = await addDeviceCode(page);
  await expect(page.getByRole('img', { name: 'QR code for the pairing code' })).toBeVisible();
  await expect(page.getByText(/^Valid until /)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make a new code' })).toBeVisible();
  await expectAccessible(page);
  const second = await connectNewBrowser(browser, box, code, 'Kitchen computer');

  // Change the password.
  await toBox(page);
  await page.getByRole('button', { name: 'Change password' }).click();
  const change = page.getByRole('dialog', { name: 'Change password' });
  await expect(change.getByLabel('New password')).toBeFocused();
  await expectAccessible(page);
  await change.getByLabel('New password').fill(NEW_PASSWORD);
  await change.getByLabel('Type it again').fill(NEW_PASSWORD);
  await change.getByRole('button', { name: 'Change password' }).click();
  await expect(change).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Password changed' })).toBeVisible();

  // Lock: the keys go, and Unlock wants the new password.
  await page.getByRole('button', { name: 'Lock' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Unlock your Cloud Box' }),
  ).toBeVisible();
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText("That password isn't right.")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible({
    timeout: 30_000,
  });

  // Remove the second browser; it is told so when it next loads.
  await toBox(page);
  await page.getByRole('button', { name: 'Revoke Kitchen computer' }).click();
  const revoke = page.getByRole('dialog', { name: 'Remove Kitchen computer?' });
  await expect(revoke).toContainText('It will need to be added again.');
  await expect(revoke.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expectAccessible(page);
  await revoke.getByRole('button', { name: 'Remove' }).click();
  await expect(revoke).toBeHidden({ timeout: 30_000 });
  await expect(
    page.getByRole('list', { name: 'Devices' }).getByRole('listitem', { name: 'Kitchen computer' }),
  ).toHaveCount(0);
  await second.reload();
  await expect(second.getByText('This browser was removed from your box.')).toBeVisible({
    timeout: 30_000,
  });

  // Phone width: one column, nothing off the side.
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoSidewaysScroll(page);
  await expectAccessible(page);
  expect(await cspViolations(page)).toEqual([]);
});
