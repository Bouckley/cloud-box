import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** The WCAG 2.2 AA rule sets from the M2 Global Constraints. */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Fails on any axe violation. Prints rule ids and element targets only, never
 * page text: pages can show decrypted names or recovery words.
 */
export async function expectAccessible(page: Page): Promise<void> {
  // A dialog fading in reads as low contrast until it is opaque: let it land.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );
  const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const found = violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(found, 'axe violations').toEqual([]);
}
