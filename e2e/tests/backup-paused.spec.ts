import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { expectAccessible } from '../helpers/axe.ts';
import { setUpThroughUi } from '../helpers/flows.ts';

test.setTimeout(180_000);

const fixture = (n: number) => join(import.meta.dirname, '..', 'fixtures', `photo-${n}.jpg`);
const nav = (page: Page, name: RegExp) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click();
const banner = (page: Page) => page.locator('[data-banner]');
// The app asks the box every 30 s; allow one poll and a little more.
const POLL = { timeout: 45_000 };

// Review Focus 5: the backup drive unplugged after everything was safe.
test('backup paused: every screen says so, and nothing reads Safe until it is back', async ({
  page,
  box,
}) => {
  await setUpThroughUi(page, box, { name: 'Laptop browser' });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload photos' }).click();
  await (await chooser).setFiles([fixture(1)]);
  await expect(page.getByRole('heading', { name: 'Upload finished' })).toBeVisible({
    timeout: 60_000,
  });
  await box.sim.runJob('replicate');
  await expect(banner(page)).toContainText(/are safe|Everything is safe/, POLL);
  await page
    .getByRole('link', { name: /^Photo, / })
    .first()
    .click();
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(page.getByText('Safe: on your box and the backup copy')).toBeVisible();
  await page.keyboard.press('Escape');

  // Unplug the backup drive.
  await box.sim.setBackupPresent(false);
  await expect(banner(page)).toContainText('Backup copy paused', POLL);
  await expect(banner(page)).toContainText(
    "The backup drive isn't connected. Your photos are on the main drive only.",
  );
  await expectAccessible(page);
  for (const [tab, h1] of [
    [/^Albums/, 'Albums'],
    [/^Files/, 'Files'],
    [/^Box/, 'Box'],
  ] as const) {
    await nav(page, tab);
    await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
    await expect(banner(page)).toContainText('Backup copy paused');
  }
  // On Box the copies say which one.
  await expect(
    page.getByRole('region', { name: 'Copies' }).getByRole('listitem', { name: 'Backup copy' }),
  ).toContainText('Not connected');
  await expectAccessible(page);

  // The viewer no longer says Safe.
  await nav(page, /^Photos/);
  await page
    .getByRole('link', { name: /^Photo, / })
    .first()
    .click();
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(page.getByText('On your box. Backup copy pending.')).toBeVisible();
  await expect(page.getByText(/^Safe/)).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Plug it back in and copy: safe again.
  await box.sim.setBackupPresent(true);
  await box.sim.runJob('replicate');
  await nav(page, /^Box/);
  await expect(banner(page)).toContainText('Everything is safe', POLL);
  await expect(
    page.getByRole('region', { name: 'Copies' }).getByRole('listitem', { name: 'Backup copy' }),
  ).toContainText('Updated');
});
