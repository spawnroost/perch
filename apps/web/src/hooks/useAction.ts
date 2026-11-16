import { useCallback, useState } from 'react';

/** Run an async action, tracking pending state and a user-readable error. */
export function useAction<A extends unknown[]>(action: (...args: A) => Promise<void>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: A): Promise<boolean> => {
      setPending(true);
      setError(null);
      try {
        await action(...args);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
        return false;
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  return { run, pending, error };
}
