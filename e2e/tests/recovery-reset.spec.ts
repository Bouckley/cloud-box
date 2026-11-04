import { expect, test } from '../fixtures.ts';
import { expectAccessible } from '../helpers/axe.ts';
import { addDeviceCode, connectNewBrowser, deviceNames, setUpThroughUi } from '../helpers/flows.ts';

test.setTimeout(150_000);

test('every device lost: reset with the words signs out the others', async ({
  page: a,
  box,
  browser,
}) => {
  const words = await setUpThroughUi(a, box, { name: 'Browser A' });
  const b = await connectNewBrowser(browser, box, await addDeviceCode(a), 'Browser B');

  const ctx = await browser.newContext({ baseURL: box.url, ignoreHTTPSErrors: true });
  const c = await ctx.newPage();
  await c.goto('/');
  await c.getByRole('link', { name: 'Lost all your devices? Use your recovery key' }).click();
  await expect(
    c.getByText(
      "This signs out every phone and computer connected to your box. You'll need to add them again.",
    ),
  ).toBeVisible();
  await expectAccessible(c);
  await c.getByLabel('Recovery key').fill(words.join(' '));
  await c.getByLabel('Name this browser').fill('Browser C');
  await c.getByLabel('New password').fill('the reset password');
  await c.getByLabel('Type it again').fill('the reset password');
  const go = c.getByRole('button', { name: 'Reset and connect' });
  await go.click();
  await expect(c.getByRole('alert')).toHaveText('Tick I understand to carry on.');
  await c.getByLabel('I understand').check();
  await go.click();
  await expect(c.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible({
    timeout: 30_000,
  });

  for (const old of [a, b]) {
    await old.reload();
    await expect(old.getByText('This browser was removed from your box.')).toBeVisible();
    await expect(
      old.getByRole('heading', { level: 1, name: 'Connect this browser' }),
    ).toBeVisible();
  }
  await expectAccessible(a);

  expect(await deviceNames(c)).toEqual(['Browser C']);
});
