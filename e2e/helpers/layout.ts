import { expect, type Page } from '@playwright/test';

/** No sideways page scroll. */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
}

/** Each nav label fits its tab on one line, and no two tabs overlap. */
export async function expectTabLabelsFit(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const links = [...document.querySelectorAll<HTMLElement>('nav[aria-label="Main"] a')];
    const boxes = links.map((a) => a.getBoundingClientRect());
    links.forEach((a, i) => {
      const label = a.querySelector<HTMLElement>('.nav-link__label');
      const name = a.textContent?.trim() ?? String(i);
      if (label && label.scrollWidth > label.clientWidth + 1) out.push(`${name}: label clipped`);
      if (label) {
        const range = document.createRange();
        range.selectNodeContents(label);
        const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        if (lines.size > 1) out.push(`${name}: label wraps`);
      }
      const next = boxes[i + 1];
      const box = boxes[i];
      if (next && box && box.right > next.left + 1 && box.top === next.top) {
        out.push(`${name}: overlaps the next tab`);
      }
    });
    return out;
  });
  expect(problems).toEqual([]);
}
