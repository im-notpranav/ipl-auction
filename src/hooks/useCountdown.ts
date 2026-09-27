import { useEffect, useState } from 'react';

export interface Countdown {
  msLeft: number;
  secondsLeft: number; // whole seconds, rounded up (shows 1 until the very end)
}

// Server-authoritative countdown. `serverOffsetMs` is serverTime - Date.now() at the
// moment the last state arrived, so the deadline is read on the server's clock.
// Returns null when there is no deadline.
export function useCountdown(endsAt: string | null | undefined, serverOffsetMs: number): Countdown | null {
  const deadline = endsAt ? Date.parse(endsAt) : NaN;
  const read = (): Countdown | null => {
    if (!Number.isFinite(deadline)) return null;
    const msLeft = Math.max(0, deadline - (Date.now() + serverOffsetMs));
    return { msLeft, secondsLeft: Math.ceil(msLeft / 1000) };
  };
  const [state, setState] = useState<Countdown | null>(read);

  useEffect(() => {
    if (!Number.isFinite(deadline)) {
      setState(null);
      return;
    }
    // 100ms is smooth enough for rings and bars without burning a phone's battery on rAF.
    const tick = () => setState(read());
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
    // read() only depends on deadline and offset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, serverOffsetMs]);

  return state;
}
