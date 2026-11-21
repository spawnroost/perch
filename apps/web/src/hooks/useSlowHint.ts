import { useEffect, useState } from 'react';

/** True once `active` has stayed true for `ms`; resets as soon as it goes false. */
export function useSlowHint(active: boolean, ms = 3000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return slow;
}
