import { BoxError, type PreparedSetup } from '@cloudbox/core';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { defaultDeviceName } from '../../app/deviceName.ts';
import { useBox, useEntry, useUnlocked } from '../../app/session.tsx';
import { Actions, Solo } from '../Solo.tsx';
import { Field, generalProblem } from '../forms.tsx';
import { ConfirmWords, pickTwo } from './ConfirmWords.tsx';
import { Creating } from './Creating.tsx';
import { PasswordStep } from './Password.tsx';
import { PressButton } from './PressButton.tsx';
import { RecoveryKey } from './RecoveryKey.tsx';

type Step = 'press' | 'password' | 'name' | 'recovery' | 'confirm' | 'creating' | 'press-again';

/**
 * First-time setup, one question per page: press → password → name → words →
 * check two words → creating. The keys and words are made once the password
 * is chosen and kept while the person moves back and forth; nothing reaches
 * the box until the two words check.
 */
export function SetupScreen({ pollMs }: { pollMs?: number }) {
  const box = useBox();
  const { recheck } = useEntry();
  const { setUnlocked } = useUnlocked();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('press');
  const [name, setName] = useState(() => defaultDeviceName(navigator.userAgent));
  const [nameError, setNameError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [words, setWords] = useState<string[]>([]);
  const [pick] = useState<[number, number]>(pickTwo);
  const [createError, setCreateError] = useState<string | null>(null);
  // The keys and words, made once from the first password. A later password
  // re-wraps the same keys, so the words never change once made. The
  // password itself is not kept.
  const prepared = useRef<Promise<PreparedSetup> | null>(null);
  const made = useRef<PreparedSetup | null>(null);

  const applyPassword = (pw: string) => {
    const before = prepared.current;
    const next = (async () => {
      if (before) await before.catch(() => {});
      if (made.current) {
        await made.current.setPassword(pw);
        return made.current;
      }
      made.current = await box.prepareSetup({ password: pw });
      return made.current;
    })();
    next.catch(() => {});
    prepared.current = next;
  };

  // Once the words exist, leaving the page would lose them: ask first.
  const holdsWords = words.length > 0 && step !== 'press';
  useEffect(() => {
    if (!holdsWords) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [holdsWords]);

  const send = useCallback(async () => {
    setCreateError(null);
    setStep('creating');
    try {
      const setup = await prepared.current!;
      const unlocked = await setup.commit(name.trim());
      setUnlocked(unlocked);
      navigate('/photos', { replace: true });
    } catch (e) {
      if (e instanceof BoxError && e.code === 'press_button') return setStep('press-again');
      if (e instanceof BoxError && e.code === 'already_set_up') return recheck();
      setCreateError(generalProblem(e));
    }
  }, [name, navigate, recheck, setUnlocked]);

  const toPassword = useCallback(() => setStep('password'), []);

  switch (step) {
    case 'press':
    case 'press-again':
      return (
        <PressButton
          again={step === 'press-again'}
          pollMs={pollMs}
          onPressed={step === 'press' ? toPassword : () => void send()}
          onSetUpElsewhere={recheck}
        />
      );
    case 'password':
      return (
        <PasswordStep
          onDone={(pw) => {
            applyPassword(pw);
            setStep('name');
          }}
        />
      );
    case 'name': {
      const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return setNameError('Give this browser a name.');
        setPreparing(true);
        try {
          const setup = await prepared.current!;
          setWords(setup.recoveryWords);
          setStep('recovery');
        } catch (err) {
          // The keys could not be made (or re-wrapped): choose the password
          // again, which tries once more.
          setNameError(`${generalProblem(err)} Go back and choose your password again.`);
        } finally {
          setPreparing(false);
        }
      };
      return (
        <Solo
          title="Which browser is this?"
          lede="The name helps you recognise it later, in Box › Devices."
          busy={preparing}
        >
          <form className="solo__form" onSubmit={(e) => void submit(e)} noValidate>
            <Field
              label="Name this browser"
              autoComplete="off"
              maxLength={60}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              error={nameError}
            />
            <Actions step={3}>
              <button type="submit" className="button button--primary" disabled={preparing}>
                {preparing ? 'Making your recovery key…' : 'Continue'}
              </button>
              <button type="button" className="button" onClick={() => setStep('password')}>
                Back
              </button>
            </Actions>
          </form>
        </Solo>
      );
    }
    case 'recovery':
      return (
        <RecoveryKey
          words={words}
          onDone={() => setStep('confirm')}
          onBack={() => setStep('name')}
        />
      );
    case 'confirm':
      return (
        <ConfirmWords
          words={words}
          pick={pick}
          onConfirmed={() => void send()}
          onBack={() => setStep('recovery')}
        />
      );
    case 'creating':
      return <Creating error={createError} onRetry={() => void send()} />;
  }
}
