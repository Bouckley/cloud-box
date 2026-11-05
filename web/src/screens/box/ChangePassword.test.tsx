import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChangePassword } from './ChangePassword.tsx';

function open() {
  const props = { onChange: vi.fn(() => Promise.resolve()), onClose: vi.fn() };
  render(<ChangePassword {...props} />);
  const type = (label: string, v: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value: v } });
  return { props, type };
}

describe('ChangePassword', () => {
  it('asks for the new password twice; focus starts in the first field', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Change password' })).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveFocus();
    expect(screen.getByLabelText('Type it again')).toBeInTheDocument();
  });

  it('at least 10 characters, typed the same twice', () => {
    const { props, type } = open();
    type('New password', 'short');
    type('Type it again', 'short');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument();
    type('New password', 'long enough now');
    type('Type it again', 'long enough not');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByText("The passwords don't match.")).toBeInTheDocument();
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it('changes it, then closes', async () => {
    const { props, type } = open();
    type('New password', 'long enough now');
    type('Type it again', 'long enough now');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(props.onChange).toHaveBeenCalledWith('long enough now');
    await vi.waitFor(() => expect(props.onClose).toHaveBeenCalled());
  });

  it('a failure says so and keeps the dialog open', async () => {
    const { props, type } = open();
    props.onChange.mockImplementation(() => Promise.reject(new Error('offline')));
    type('New password', 'long enough now');
    type('Type it again', 'long enough now');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText("Couldn't change the password. Try again.")).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
