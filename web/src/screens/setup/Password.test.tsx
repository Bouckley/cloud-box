import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasswordStep } from './Password.tsx';

function show() {
  const onDone = vi.fn();
  render(<PasswordStep onDone={onDone} />);
  return {
    onDone,
    first: screen.getByLabelText('New password'),
    second: screen.getByLabelText('Type it again'),
    go: screen.getByRole('button', { name: 'Continue' }),
  };
}

describe('PasswordStep', () => {
  it('9 characters is too short, and says so on the field', async () => {
    const user = userEvent.setup();
    const { onDone, first, second, go } = show();
    await user.type(first, '123456789');
    await user.type(second, '123456789');
    await user.click(go);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Use at least 10 characters.');
    expect(first).toHaveAttribute('aria-invalid', 'true');
    expect(first.getAttribute('aria-describedby')).toContain(alert.id);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('the two must match', async () => {
    const user = userEvent.setup();
    const { onDone, first, second, go } = show();
    await user.type(first, 'long enough 1');
    await user.type(second, 'long enough 2');
    await user.click(go);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("The passwords don't match.");
    expect(second.getAttribute('aria-describedby')).toContain(alert.id);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('10 characters that match carry on, with no other rules', async () => {
    const user = userEvent.setup();
    const { onDone, first, second, go } = show();
    await user.type(first, 'aaaaaaaaaa');
    await user.type(second, 'aaaaaaaaaa');
    await user.click(go);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onDone).toHaveBeenCalledWith('aaaaaaaaaa');
  });

  it('the error stays until the field changes', async () => {
    const user = userEvent.setup();
    const { first, go } = show();
    await user.type(first, 'short');
    await user.click(go);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.type(first, 'x');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
