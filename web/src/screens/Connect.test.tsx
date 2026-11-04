import { BoxError } from '@cloudbox/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithBox } from '../test/fakeBox.tsx';
import { ConnectScreen, ResetScreen } from './Connect.tsx';

const CODE = 'obDKswUFwQnaKHBoe4VggxWP-8pksHyxDS7HNFSHE_Y';

describe('ConnectScreen', () => {
  it('sends the code as shown, without its spaces, but keeps - and _', async () => {
    const user = userEvent.setup();
    const pair = vi.fn(async () => {});
    renderWithBox({ pair }, '/connect', <ConnectScreen revoked={false} />, [
      { path: '/unlock', element: <h1>Unlock page</h1> },
    ]);
    const grouped = CODE.match(/.{1,4}/g)!.join(' ');
    await user.type(screen.getByLabelText('Enter the code from another device'), grouped);
    await user.clear(screen.getByLabelText('Name this browser'));
    await user.type(screen.getByLabelText('Name this browser'), 'Kitchen computer');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(pair).toHaveBeenCalledWith(CODE, 'Kitchen computer');
    // Connected: the password comes next, on Unlock (so Forgot works from there).
    expect(await screen.findByText('Unlock page')).toBeInTheDocument();
  });

  it('a used or expired code says what to do', async () => {
    const user = userEvent.setup();
    const pair = vi.fn(async () => {
      throw new BoxError(401, { code: 'unauthorized', message: 'x', action: 'y' });
    });
    renderWithBox({ pair }, '/connect', <ConnectScreen revoked={false} />);
    await user.type(screen.getByLabelText('Enter the code from another device'), CODE);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That code didn't work. A code works once, for 10 minutes.",
    );
  });

  it('a removed browser is told so', () => {
    renderWithBox({}, '/connect', <ConnectScreen revoked />);
    expect(screen.getByText('This browser was removed from your box.')).toBeInTheDocument();
  });

  it('Reset says why it waits for I understand, and sends nothing until then', async () => {
    const user = userEvent.setup();
    const resetWithRecovery = vi.fn();
    renderWithBox({ resetWithRecovery }, '/reset', <ResetScreen />);
    await user.type(screen.getByLabelText('Recovery key'), 'the words');
    await user.type(screen.getByLabelText('New password'), 'a long password');
    await user.type(screen.getByLabelText('Type it again'), 'a long password');
    await user.click(screen.getByRole('button', { name: 'Reset and connect' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Tick I understand to carry on.');
    expect(resetWithRecovery).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText('I understand'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
