import type { Unlocked } from '@cloudbox/core';
import { useNavigate } from 'react-router';
import { useUnlocked } from '../app/session.tsx';

/** Hands the unlocked account to the session and opens Photos. */
export function useFinish(): (u: Unlocked) => void {
  const { setUnlocked } = useUnlocked();
  const navigate = useNavigate();
  return (u) => {
    setUnlocked(u);
    void navigate('/photos', { replace: true });
  };
}
