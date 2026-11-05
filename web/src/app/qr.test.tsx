import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QrCode } from './qr.tsx';

describe('QrCode', () => {
  it('draws the code as SVG squares, named for screen readers', () => {
    render(<QrCode text="cloudbox://pair?code=ABCDEFGHJKMN" />);
    const img = screen.getByRole('img', { name: 'QR code for the pairing code' });
    expect(img.tagName.toLowerCase()).toBe('svg');
    expect(img.querySelectorAll('rect').length).toBeGreaterThan(50);
  });

  it('different text, different squares', () => {
    const { container: a } = render(<QrCode text="cloudbox://pair?code=AAAA" />);
    const { container: b } = render(<QrCode text="cloudbox://pair?code=BBBB" />);
    expect(a.innerHTML).not.toBe(b.innerHTML);
  });
});
