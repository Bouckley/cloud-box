import { useEffect } from 'react';

/** Sets the document title: "{screen} – Cloud Box", or the given full title. */
export function useTitle(screen: string, full = false): void {
  useEffect(() => {
    document.title = full ? screen : `${screen} – Cloud Box`;
  }, [screen, full]);
}
