import { describe, expect, it } from 'vitest';
import { fitWidth, firstZoom, zoomIn, zoomOut, zoomText } from './pdf.ts';

describe('zoom', () => {
  it('steps through set sizes, stopping at the ends', () => {
    expect(zoomIn(1)).toBe(1.25);
    expect(zoomIn(1.1)).toBe(1.25);
    expect(zoomOut(1)).toBe(0.75);
    expect(zoomOut(0.8)).toBe(0.75);
    expect(zoomIn(4)).toBe(4);
    expect(zoomOut(0.25)).toBe(0.25);
  });

  it('fit width fills the frame, less its padding', () => {
    // A4 is 595 points wide; a 1,000 px frame with 24 px either side.
    expect(fitWidth(595, 1000)).toBeCloseTo((1000 - 48) / 595);
  });

  it('opens at fit width on a phone, but no bigger than 125% on a wide screen', () => {
    expect(firstZoom(595, 360)).toBeCloseTo((360 - 48) / 595);
    expect(firstZoom(595, 1400)).toBe(1.25);
  });

  it('says the zoom as a whole percentage', () => {
    expect(zoomText(1)).toBe('100%');
    expect(zoomText(0.5243)).toBe('52%');
  });
});
