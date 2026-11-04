import { ClientError } from '@cloudbox/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeUnlocked, renderWithBox } from '../test/fakeBox.tsx';
import { ForgotScreen } from './Forgot.tsx';

const PASSWORD = 'a new password';

async function attempt(error: unknown) {
  const user = userEvent.setup();
  const unlockWithRecovery = vi.fn(async () => {
    throw error;
  });
  renderWithBox({ unlockWithRecovery }, '/forgot', <ForgotScreen />);
  await user.type(screen.getByLabelText('Recovery key'), 'some words');
  await user.type(screen.getByLabelText('New password'), PASSWORD);
  await user.type(screen.getByLabelText('Type it again'), PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Set new password' }));
  return { unlockWithRecovery };
}

describe('ForgotScreen', () => {
  it.each([
    [new ClientError('recovery_words', { reason: 'count' }), 'Enter all 24 words.'],
    [
      new ClientError('recovery_words', { reason: 'unknown_word', index: 5 }),
      "Word 5 isn't a recovery word.",
    ],
    [
      new ClientError('recovery_words', { reason: 'checksum' }),
      "Those words don't match this box.",
    ],
    [new ClientError('wrong_recovery_key'), "Those words don't match this box."],
  ])('%s shows the Copy-table words on the field', async (error, text) => {
    await attempt(error);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    const field = screen.getByLabelText('Recovery key');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field.getAttribute('aria-describedby')).toContain(alert.id);
  });

  it('checks the new password before asking the box', async () => {
    const user = userEvent.setup();
    const unlockWithRecovery = vi.fn();
    renderWithBox({ unlockWithRecovery }, '/forgot', <ForgotScreen />);
    await user.type(screen.getByLabelText('Recovery key'), 'some words');
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Type it again'), 'short');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Use at least 10 characters.');
    expect(unlockWithRecovery).not.toHaveBeenCalled();
  });

  it('the right words and a new password open Photos', async () => {
    const user = userEvent.setup();
    const unlockWithRecovery = vi.fn(async () => fakeUnlocked());
    renderWithBox({ unlockWithRecovery }, '/forgot', <ForgotScreen />);
    await user.type(screen.getByLabelText('Recovery key'), 'the words');
    await user.type(screen.getByLabelText('New password'), PASSWORD);
    await user.type(screen.getByLabelText('Type it again'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText('Photos page')).toBeInTheDocument();
    expect(unlockWithRecovery).toHaveBeenCalledWith('the words', PASSWORD);
  });

  it('a browser removed from the box is sent back to Connect', async () => {
    const user = userEvent.setup();
    const unlockWithRecovery = vi.fn(async () => {
      throw new ClientError('revoked');
    });
    const login = vi.fn(async () => 'revoked' as const);
    renderWithBox({ unlockWithRecovery, login }, '/forgot', <ForgotScreen />);
    await user.type(screen.getByLabelText('Recovery key'), 'some words');
    await user.type(screen.getByLabelText('New password'), PASSWORD);
    await user.type(screen.getByLabelText('Type it again'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    await vi.waitFor(() => expect(login.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
