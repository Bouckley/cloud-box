// Renders three 640×480 JPEGs of different colours into e2e/fixtures/ with a
// canvas in Chromium. The output is committed; run again only to change it:
//   pnpm --filter @cloudbox/e2e fixtures
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const colours = [
  ['#C9B79C', '#7D8F96'],
  ['#8FA9A0', '#2E7D5B'],
  ['#E0B89B', '#A88E79'],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [i, [a, b]] of colours.entries()) {
  const dataUrl = await page.evaluate(
    ([a, b, n]) => {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 480;
      const ctx = c.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, 640, 480);
      g.addColorStop(0, a);
      g.addColorStop(1, b);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 120px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), 320, 240);
      return c.toDataURL('image/jpeg', 0.9);
    },
    [a!, b!, i + 1] as const,
  );
  const bytes = Buffer.from(dataUrl.split(',')[1]!, 'base64');
  await writeFile(join(out, `photo-${i + 1}.jpg`), bytes);
  console.log(`photo-${i + 1}.jpg ${bytes.length} bytes`);
}
await browser.close();
