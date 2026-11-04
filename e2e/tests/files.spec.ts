import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { expectAccessible } from '../helpers/axe.ts';
import { cspViolations, setUpThroughUi, watchCsp } from '../helpers/flows.ts';
import { expectNoSidewaysScroll } from '../helpers/layout.ts';

test.setTimeout(150_000);

const nav = (page: Page, name: string) => page.getByRole('link', { name }).first();
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** A small, valid PDF with one line of Helvetica on each page. */
function pdfWith(lines: string[]): string {
  const objs: string[] = [];
  const kids = lines.map((_, i) => `${3 + i * 2} 0 R`).join(' ');
  objs.push('<</Type/Catalog/Pages 2 0 R>>');
  objs.push(`<</Type/Pages/Kids[${kids}]/Count ${lines.length}>>`);
  const font = 3 + lines.length * 2;
  lines.forEach((line, i) => {
    const stream = `BT /F1 28 Tf 60 700 Td (${line}) Tj ET`;
    objs.push(
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents ${4 + i * 2} 0 R/Resources<</Font<</F1 ${font} 0 R>>>>>>`,
    );
    objs.push(`<</Length ${stream.length}>>stream\n${stream}\nendstream`);
  });
  objs.push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>');
  let out = '%PDF-1.4\n';
  const at: number[] = [];
  objs.forEach((o, i) => {
    at.push(out.length);
    out += `${i + 1} 0 obj${o}endobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

// Journey 16: a folder, a 9 MiB upload into it, download it back byte for
// byte, find it by name, move it to Files, then delete it to Trash.
test('files: make Taxes, upload there, download, search, move and delete', async ({
  page,
  box,
}) => {
  const dir = await mkdtemp(join(tmpdir(), 'cloudbox-files-'));
  const source = join(dir, 'Return 2025.bin');
  const bytes = randomBytes(9 * 2 ** 20);
  await writeFile(source, bytes);

  // Save through <a download>, as browsers without a save picker do.
  await page.addInitScript(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await watchCsp(page);
  await setUpThroughUi(page, box, { name: 'Laptop browser' });

  await nav(page, 'Files').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Files' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No files yet' })).toBeVisible();
  await expectAccessible(page);

  // New folder → Taxes, then go into it.
  await page.getByRole('button', { name: 'New folder' }).click();
  const create = page.getByRole('dialog', { name: 'New folder' });
  await create.getByRole('textbox', { name: 'Name' }).fill('Taxes');
  await create.getByRole('button', { name: 'Create' }).click();
  await expect(create).toBeHidden();
  await page.getByRole('link', { name: 'Taxes' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Taxes' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs.getByRole('link', { name: 'Files' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'This folder is empty' })).toBeVisible();

  // Upload into Taxes: the sheet says where.
  await page.getByRole('button', { name: 'Upload to Taxes' }).click();
  const sheet = page.getByRole('dialog', { name: 'Upload' });
  await expect(sheet.getByText('Saving to Files › Taxes')).toBeVisible();
  await expectAccessible(page);
  await sheet.getByLabel('Choose files').setInputFiles(source);
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Upload finished' })).toBeVisible({
    timeout: 60_000,
  });
  const row = page.getByRole('row', { name: /Return 2025\.bin/ });
  await expect(row).toContainText('9.4 MB');
  await expectAccessible(page);

  // Clicking a file the browser can't show opens its details; nothing downloads.
  let downloads = 0;
  page.on('download', () => downloads++);
  await row.getByRole('button', { name: 'Return 2025.bin', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Return 2025.bin' });
  await expect(details).toContainText("This can't be shown here. Download it to open it.");
  await expect(details).toContainText('In Files › Taxes');
  await expect(details.getByRole('button', { name: 'Close' })).toBeFocused();
  await expectAccessible(page);
  await details.getByRole('button', { name: 'Close' }).click();
  expect(downloads).toBe(0);

  // Download it from the row's menu; the bytes match.
  await row.getByRole('button', { name: 'More options for Return 2025.bin' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Download' })).toBeFocused();
  await expectAccessible(page);
  const download = page.waitForEvent('download');
  await menu.getByRole('menuitem', { name: 'Download' }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('Return 2025.bin');
  const path = await saved.path();
  expect(sha256(await readFile(path))).toBe(sha256(bytes));

  // From Files, a search finds it inside Taxes.
  await crumbs.getByRole('link', { name: 'Files' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Files' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search files' }).fill('return');
  await expect(page.getByRole('row', { name: /Return 2025\.bin/ })).toContainText(
    'In Files › Taxes',
  );
  await expect(page.getByRole('status').filter({ hasText: '1 found' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search files' }).fill('passport');
  await expect(page.getByRole('heading', { name: 'No files called "passport"' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '0 found' })).toBeVisible();
  await page.locator('.empty').getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search files' })).toBeFocused();
  await expect(page.getByRole('searchbox', { name: 'Search files' })).toHaveValue('');

  // A folder with something in it can't be deleted, and says why.
  await page.getByRole('button', { name: 'More options for Taxes' }).click();
  await expect(page.getByRole('menuitem', { name: "Folder isn't empty" })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'More options for Taxes' })).toBeFocused();

  // Move it from Taxes to Files.
  await page.getByRole('link', { name: 'Taxes' }).click();
  await page.getByRole('button', { name: 'More options for Return 2025.bin' }).click();
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  const move = page.getByRole('dialog', { name: 'Move "Return 2025.bin"' });
  await expect(move.getByRole('radio', { name: 'Taxes' })).toBeDisabled();
  await expect(move.getByRole('radio', { name: 'Files' })).toBeChecked();
  await expectAccessible(page);
  await move.getByRole('button', { name: 'Move' }).click();
  await expect(move).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Moved to Files' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'This folder is empty' })).toBeVisible();

  // In Files now; delete it to Trash.
  await crumbs.getByRole('link', { name: 'Files' }).click();
  await page.getByRole('button', { name: 'More options for Return 2025.bin' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const del = page.getByRole('dialog', { name: 'Delete this file?' });
  await expect(del.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await del.getByRole('button', { name: 'Move to Trash' }).click();
  await expect(del).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('row', { name: /Return 2025\.bin/ })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Taxes/ })).toBeVisible();

  // Clicking a photo's name shows it inside Cloud Box, decrypted here, and
  // Close goes back to its folder.
  const photo = join(dir, 'Passport scan.jpg');
  await writeFile(
    photo,
    await readFile(join(import.meta.dirname, '..', 'fixtures', 'photo-1.jpg')),
  );
  await page.getByRole('button', { name: 'Upload to Files' }).click();
  await page
    .getByRole('dialog', { name: 'Upload' })
    .getByLabel('Choose files')
    .setInputFiles(photo);
  const open = page.getByRole('button', { name: 'Passport scan.jpg', exact: true });
  await expect(open).toBeVisible({ timeout: 60_000 });
  await open.click();
  await expect(page).toHaveURL(/\/files\/open\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Passport scan.jpg' })).toBeFocused();
  await expect(page.getByRole('img', { name: 'Passport scan.jpg' })).toBeVisible();
  await expect(page.getByText('In Files ·')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Files' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Passport scan.jpg', exact: true })).toBeFocused();
  expect(downloads).toBe(1);

  // A PDF opens in Cloud Box's own frame, drawn here by pdf.js.
  const will = join(dir, 'Will.pdf');
  await writeFile(will, pdfWith(['Last will, page one', 'Page two: witnesses']));
  await page.getByRole('button', { name: 'Upload to Files' }).click();
  await page.getByRole('dialog', { name: 'Upload' }).getByLabel('Choose files').setInputFiles(will);
  await page.getByRole('button', { name: 'Will.pdf', exact: true }).click();
  const bar = page.getByRole('toolbar', { name: 'Pages and zoom' });
  await expect(bar).toContainText('Page 1 of 2');
  const first = page.getByRole('group', { name: 'Page 1 of 2' });
  await expect(first).toContainText('Last will, page one');
  // The page is painted: some of its canvas is dark (the words).
  await expect
    .poll(() =>
      first.locator('canvas').evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < d.length; i += 4) if (d[i]! < 100) return true;
        return false;
      }),
    )
    .toBe(true);
  const zoom = bar.getByText(/^\d+%$/);
  const before = await zoom.textContent();
  await bar.getByRole('button', { name: 'Zoom in' }).click();
  await expect(zoom).not.toHaveText(before ?? '');
  await bar.getByRole('button', { name: 'Next page' }).click();
  await expect(bar).toContainText('Page 2 of 2');
  await expect(bar.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Files' })).toBeVisible();

  // Phone width: list rows, nothing off the side.
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoSidewaysScroll(page);
  await expectAccessible(page);

  expect(await cspViolations(page)).toEqual([]);
});
