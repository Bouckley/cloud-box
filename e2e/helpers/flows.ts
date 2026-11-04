import type { Page } from '@playwright/test';

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
