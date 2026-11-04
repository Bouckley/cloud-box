import { expect, test } from '../fixtures.ts';
import { expectAccessible } from '../helpers/axe.ts';
import { PASSWORD, setUpThroughUi } from '../helpers/flows.ts';

test.setTimeout(120_000);

const NEW_PASSWORD = 'a brand new password';

test('journey 8: forgot password, with words typed carelessly', async ({ page, box }) => {
  const words = await setUpThroughUi(page, box, { name: 'Laptop browser' });

  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Unlock your Cloud Box' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Forgot your password?' }),
  ).toBeVisible();
  await expectAccessible(page);

  const careless = words.map((w, i) => (i % 2 ? w.toUpperCase() : ` ${w}  `)).join('  \n ');
  await page.getByLabel('Recovery key').fill(careless);
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByLabel('Type it again').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible({
    timeout: 30_000,
  });

  await page.reload();
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toHaveText("That password isn't right.", {
    timeout: 30_000,
  });
  await expectAccessible(page);

  await page.getByLabel('Password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible({
    timeout: 30_000,
  });
});
