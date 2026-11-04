import { expect, test } from '../fixtures.ts';
import { expectAccessible } from '../helpers/axe.ts';
import { addDeviceCode, connectNewBrowser, deviceNames, setUpThroughUi } from '../helpers/flows.ts';

// Argon2id runs in the browser at full strength: allow for three of them.
test.setTimeout(120_000);

test('journey 1: set up the box, then pair a second browser', async ({ page, box, browser }) => {
  const words = await setUpThroughUi(page, box, {
    name: 'Laptop browser',
    eachStep: expectAccessible,
  });
  expect(words).toHaveLength(24);

  await expect(page.getByText('No photos yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload photos' })).toBeVisible();
  await expectAccessible(page);

  const code = await addDeviceCode(page, expectAccessible);
  expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);

  const second = await connectNewBrowser(browser, box, code, 'Kitchen computer', expectAccessible);
  await expectAccessible(second);

  const names = await deviceNames(page);
  expect(names.sort()).toEqual(['Kitchen computer', 'Laptop browser']);
  await expectAccessible(page);
});
