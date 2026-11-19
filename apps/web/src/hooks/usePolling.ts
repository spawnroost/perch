import { useEffect, useRef } from 'react';

/** Calls `tick` every `everyMs` while `active`, at most `maxTicks` times; stops when `active` ends. */
export function usePolling(active: boolean, tick: () => void, everyMs: number, maxTicks: number) {
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  });
  useEffect(() => {
    if (!active) return;
    let ticks = 0;
    const id = setInterval(() => {
      ticks += 1;
      latest.current();
      if (ticks >= maxTicks) clearInterval(id);
    }, everyMs);
    return () => clearInterval(id);
  }, [active, everyMs, maxTicks]);
}
