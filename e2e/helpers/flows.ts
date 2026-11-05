import { expect, type Browser, type Page } from '@playwright/test';
import type { RunningBox } from '../fixtures.ts';

/**
 * Collects Content-Security-Policy violations on the page from before its
 * first script runs. Read them with `cspViolations(page)`.
 */
export async function watchCsp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = seen;
    document.addEventListener('securitypolicyviolation', (e) => {
      seen.push(`${e.effectiveDirective} ${e.blockedURI}`);
    });
  });
}

export function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

export const PASSWORD = 'correct horse battery staple';

type Step = (page: Page) => Promise<void>;

/**
 * Sets the box up through the web UI (journey 1's first half) and returns the
 * 24 recovery words read from the screen. `eachStep` runs on every step.
 */
export async function setUpThroughUi(
  page: Page,
  box: RunningBox,
  opts: { name: string; password?: string; eachStep?: Step },
): Promise<string[]> {
  const password = opts.password ?? PASSWORD;
  const step = opts.eachStep ?? (async () => {});
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Set up your Cloud Box' }),
  ).toBeVisible();
  await expect(page.getByText(/Press the power button on the front of your box/)).toBeVisible();
  await step(page);
  await box.sim.pressButton();

  await page.getByLabel('New password').fill(password);
  await page.getByLabel('Type it again').fill(password);
  await step(page);
  await page.getByRole('button', { name: 'Continue' }).click();

  const name = page.getByLabel('Name this browser');
  // Prefilled from the user agent (Playwright's Desktop Chrome says Windows).
  await expect(name).toHaveValue(/^Chrome on \w+/);
  await name.fill(opts.name);
  await step(page);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Your recovery key' })).toBeVisible({
    timeout: 30_000,
  });
  const words = await page
    .getByRole('list', { name: 'Recovery key words' })
    .locator('.word')
    .allTextContents();
  await step(page);
  await page.getByRole('button', { name: "I've written it down" }).click();

  const inputs = page.getByLabel(/^Word \d+$/);
  await expect(inputs).toHaveCount(2);
  for (const input of await inputs.all()) {
    const label = await input.evaluate((el) => (el as HTMLInputElement).labels?.[0]?.textContent);
    const n = Number(/(\d+)/.exec(label ?? '')?.[1]);
    await input.fill(words[n - 1] ?? '');
  }
  await step(page);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible({
    timeout: 30_000,
  });
  return words;
}

/** On a signed-in page: Box › Add a device, returning the code as shown. */
export async function addDeviceCode(page: Page, eachStep?: Step): Promise<string> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Box/ }).click();
  await page.getByRole('button', { name: 'Add a device' }).click();
  const code = page.getByLabel('Pairing code', { exact: true });
  await expect(code).toBeVisible();
  if (eachStep) await eachStep(page);
  return ((await code.textContent()) ?? '').replace(/\s+/g, '');
}

/** A new browser joins with a code and the password, and lands on Photos. */
export async function connectNewBrowser(
  browser: Browser,
  box: RunningBox,
  code: string,
  name: string,
  eachStep?: Step,
): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: box.url, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Connect this browser' })).toBeVisible();
  if (eachStep) await eachStep(page);
  await page.getByLabel('Enter the code from another device').fill(code);
  await page.getByLabel('Name this browser').fill(name);
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByLabel('Password').fill(PASSWORD);
  if (eachStep) await eachStep(page);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Photos' })).toBeVisible({
    timeout: 30_000,
  });
  return page;
}

/** The names in Box › Devices, after the list has loaded. */
export async function deviceNames(page: Page): Promise<string[]> {
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Photos' }).click();
  await nav.getByRole('link', { name: /^Box/ }).click();
  const list = page.getByRole('list', { name: 'Devices' });
  await expect(list.getByRole('listitem').first()).toBeVisible();
  return list.locator('.device__name').allTextContents();
}
