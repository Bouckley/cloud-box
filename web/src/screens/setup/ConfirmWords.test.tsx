import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmWords } from './ConfirmWords.tsx';

const WORDS = Array.from({ length: 24 }, (_, i) => `word${String.fromCharCode(97 + i)}x`);
WORDS[2] = 'abandon';
WORDS[16] = 'zebra';

function show() {
  const onConfirmed = vi.fn();
  const onBack = vi.fn();
  render(<ConfirmWords words={WORDS} pick={[3, 17]} onConfirmed={onConfirmed} onBack={onBack} />);
  return { onConfirmed, onBack };
}

describe('ConfirmWords', () => {
  it('asks for the two chosen words by number', () => {
    show();
    expect(screen.getByLabelText('Word 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Word 17')).toBeInTheDocument();
  });

  it('a wrong word blocks continuing and says which word', async () => {
    const user = userEvent.setup();
    const { onConfirmed } = show();
    await user.type(screen.getByLabelText('Word 3'), 'abandon');
    await user.type(screen.getByLabelText('Word 17'), 'zebro');
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(onConfirmed).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Word 17 doesn't match. Check what you wrote down.");
    expect(alert).not.toHaveTextContent('Word 3');
    expect(screen.getByLabelText('Word 17')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Word 3')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('accepts any case and spaces, and carries on', async () => {
    const user = userEvent.setup();
    const { onConfirmed } = show();
    await user.type(screen.getByLabelText('Word 3'), '  ABANDON ');
    await user.type(screen.getByLabelText('Word 17'), 'Zebra');
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(onConfirmed).toHaveBeenCalled();
  });

  it('Back goes back to the words', async () => {
    const user = userEvent.setup();
    const { onBack } = show();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });
});
