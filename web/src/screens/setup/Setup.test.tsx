import { BoxError, type Unlocked } from '@cloudbox/core';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeUnlocked, renderWithBox } from '../../test/fakeBox.tsx';
import { SetupScreen } from './Setup.tsx';

const WORDS = Array.from({ length: 24 }, (_, i) => `w${i + 1}x`);
const PASSWORD = 'a good long password';

function fakeSetupBox() {
  const commit = vi.fn<(name: string) => Promise<Unlocked>>(async () => fakeUnlocked());
  const setPassword = vi.fn<(password: string) => Promise<void>>(async () => {});
  const prepareSetup = vi.fn(async () => ({ recoveryWords: [...WORDS], commit, setPassword }));
  const info = vi.fn(async () => ({ setUp: false, setupOpen: true, version: 't' }));
  return { commit, prepareSetup, info, setPassword };
}

async function toRecovery(user: ReturnType<typeof userEvent.setup>, name = 'Kitchen laptop') {
  await user.type(await screen.findByLabelText('New password'), PASSWORD);
  await user.type(screen.getByLabelText('Type it again'), PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  const field = await screen.findByLabelText('Name this browser');
  await user.clear(field);
  await user.type(field, name);
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { name: 'Your recovery key' });
}

const shownWords = () =>
  within(screen.getByRole('list', { name: 'Recovery key words' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.word')?.textContent);

describe('SetupScreen', () => {
  it('waits for the button press without a timer, then asks for a password', async () => {
    const box = fakeSetupBox();
    box.info.mockResolvedValueOnce({ setUp: false, setupOpen: false, version: 't' });
    renderWithBox(box, '/setup', <SetupScreen pollMs={10} />);
    expect(
      await screen.findByText(/Press the power button on the front of your box/),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
  });

  it('shows 24 numbered words, and Back then forward keeps the same words', async () => {
    const user = userEvent.setup();
    const box = fakeSetupBox();
    renderWithBox(box, '/setup', <SetupScreen pollMs={10} />);
    await toRecovery(user);
    expect(screen.getByText(/these 24 words are the only way back in/)).toBeInTheDocument();
    const first = shownWords();
    expect(first).toEqual(WORDS);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    const field = await screen.findByLabelText('Name this browser');
    await user.type(field, ' 2');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Your recovery key' });
    expect(shownWords()).toEqual(first);
    expect(box.prepareSetup).toHaveBeenCalledTimes(1);
  });

  it('sends nothing to the box until the two words check, then lands on Photos', async () => {
    const user = userEvent.setup();
    const box = fakeSetupBox();
    renderWithBox(box, '/setup', <SetupScreen pollMs={10} />);
    await toRecovery(user, 'Kitchen laptop');
    await user.click(screen.getByRole('button', { name: "I've written it down" }));

    const inputs = await screen.findAllByLabelText(/^Word \d+$/);
    expect(inputs).toHaveLength(2);
    for (const input of inputs) await user.type(input, 'wrong');
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(box.commit).not.toHaveBeenCalled();

    for (const input of inputs) {
      const n = Number(
        /Word (\d+)/.exec((input as HTMLInputElement).labels?.[0]?.textContent ?? '')?.[1],
      );
      await user.clear(input);
      await user.type(input, WORDS[n - 1]!);
    }
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(await screen.findByText('Photos page')).toBeInTheDocument();
    expect(box.commit).toHaveBeenCalledWith('Kitchen laptop');
  });

  it('a new password after seeing the words keeps the same words', async () => {
    const user = userEvent.setup();
    const box = fakeSetupBox();
    renderWithBox(box, '/setup', <SetupScreen pollMs={10} />);
    await toRecovery(user);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByLabelText('Name this browser');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.type(await screen.findByLabelText('New password'), 'a different password');
    await user.type(screen.getByLabelText('Type it again'), 'a different password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Your recovery key' });
    expect(shownWords()).toEqual(WORDS);
    expect(box.prepareSetup).toHaveBeenCalledTimes(1);
    expect(box.setPassword).toHaveBeenCalledWith('a different password');
  });

  it('moves focus to the new heading at each step', async () => {
    const user = userEvent.setup();
    renderWithBox(fakeSetupBox(), '/setup', <SetupScreen pollMs={10} />);
    await user.type(await screen.findByLabelText('New password'), PASSWORD);
    await user.type(screen.getByLabelText('Type it again'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Which browser is this?',
    });
    expect(heading).toHaveFocus();
  });

  it('setup closed while writing: one more press, then it finishes with the same words', async () => {
    const user = userEvent.setup();
    const box = fakeSetupBox();
    box.commit.mockRejectedValueOnce(
      new BoxError(409, { code: 'press_button', message: 'Setup is not open yet.', action: 'x' }),
    );
    renderWithBox(box, '/setup', <SetupScreen pollMs={10} />);
    await toRecovery(user);
    await user.click(screen.getByRole('button', { name: "I've written it down" }));
    for (const input of await screen.findAllByLabelText(/^Word \d+$/)) {
      const n = Number(
        /Word (\d+)/.exec((input as HTMLInputElement).labels?.[0]?.textContent ?? '')?.[1],
      );
      await user.type(input, WORDS[n - 1]!);
    }
    box.info.mockResolvedValueOnce({ setUp: false, setupOpen: false, version: 't' });
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(
      await screen.findByText(/Press the power button on the front of your box once more/),
    ).toBeInTheDocument();
    expect(await screen.findByText('Photos page')).toBeInTheDocument();
    expect(box.commit).toHaveBeenCalledTimes(2);
    expect(box.prepareSetup).toHaveBeenCalledTimes(1);
  });
});
