import { ClientError } from '@cloudbox/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeUnlocked, renderWithBox } from '../test/fakeBox.tsx';
import { UnlockScreen } from './Unlock.tsx';

describe('UnlockScreen', () => {
  it('a wrong password says so on the field', async () => {
    const user = userEvent.setup();
    const unlock = vi.fn(async () => {
      throw new ClientError('wrong_password');
    });
    renderWithBox({ unlock }, '/unlock', <UnlockScreen />);
    await user.type(screen.getByLabelText('Password'), 'not it at all');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("That password isn't right.");
    const field = screen.getByLabelText('Password');
    expect(field.getAttribute('aria-describedby')).toContain(alert.id);
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('the right password opens Photos', async () => {
    const user = userEvent.setup();
    const unlock = vi.fn(async () => fakeUnlocked());
    renderWithBox({ unlock }, '/unlock', <UnlockScreen />);
    await user.type(screen.getByLabelText('Password'), 'the right one');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('Photos page')).toBeInTheDocument();
  });

  it('links to Forgot your password?', () => {
    renderWithBox({}, '/unlock', <UnlockScreen />);
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute(
      'href',
      '/forgot',
    );
  });
});
