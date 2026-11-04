import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '../fixtures.ts';
import { cspViolations, setUpThroughUi, watchCsp } from '../helpers/flows.ts';
import { pdfWith } from '../helpers/pdf.ts';

test.setTimeout(120_000);

/**
 * Firefox 141 (and other browsers a year or so old) lack the newest built-ins
 * pdf.js's modern build calls, such as Map.prototype.getOrInsertComputed.
 * There the pages drew but the words didn't. Take them away, in the page and
 * in pdf.js's worker, and the words must still be drawn.
 */
const forget = `for (const M of [Map, WeakMap]) { delete M.prototype.getOrInsertComputed; delete M.prototype.getOrInsert; }\n`;

test('a PDF draws its words in a browser without the newest built-ins', async ({ page, box }) => {
  await page.addInitScript(forget);
  await page.route(/pdf\.worker[^/]*\.m?js(\?.*)?$/, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: forget + (await res.text()) });
  });
  await watchCsp(page);
  await setUpThroughUi(page, box, { name: 'Laptop browser' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const dir = await mkdtemp(join(tmpdir(), 'cloudbox-pdf-'));
  const file = join(dir, 'Letter.pdf');
  await writeFile(file, pdfWith(['Dear Jordan, thank you']));
  await page.getByRole('link', { name: 'Files' }).first().click();
  await page.getByRole('button', { name: 'Upload to Files' }).click();
  await page.getByRole('dialog', { name: 'Upload' }).getByLabel('Choose files').setInputFiles(file);
  await page.getByRole('button', { name: 'Letter.pdf', exact: true }).click();

  const first = page.getByRole('group', { name: 'Page 1 of 1' });
  await expect(first.locator('canvas')).toBeVisible();
  // The words are painted: some of the canvas is dark.
  await expect
    .poll(
      () =>
        first.locator('canvas').evaluate((c: HTMLCanvasElement) => {
          const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
          // Drawn ink, not the transparent black of a canvas nothing was drawn on.
          for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 200 && d[i]! < 100) return true;
          return false;
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
  expect(errors).toEqual([]);
  expect(await cspViolations(page)).toEqual([]);
});
