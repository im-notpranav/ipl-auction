import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Pause } from 'lucide-react';
import { AuctionStatus } from '../../types';
import { useCountdown } from '../../hooks/useCountdown';
import { liveSounds } from './liveSounds';

/*
  The lot clock. Server-owned deadline (bidEndsAt), reset on every bid.
  Colour: gold while there is time, orange in the last 40%, red for the final 5 seconds.
  "Going once" at 5s and "Going twice" at 2s, each announced once per deadline.
  Before the opening bid there is nothing to be "going", so the last 5s read "Last call".
*/

export interface ClockInput {
  status: AuctionStatus;
  bidEndsAt: string | null;
  pausedRemainingMs: number | null;
  bidTimerSeconds: number;
  serverOffsetMs: number;
}

export interface ClockReading {
  active: boolean; // a timer is configured and relevant right now
  paused: boolean;
  msLeft: number;
  secondsLeft: number;
  fraction: number; // 1 = full, 0 = expired
  phase: 'calm' | 'warm' | 'urgent';
}

export function useLotClock({ status, bidEndsAt, pausedRemainingMs, bidTimerSeconds, serverOffsetMs }: ClockInput): ClockReading {
  const live = useCountdown(status === 'BIDDING' ? bidEndsAt : null, serverOffsetMs);
  const paused = status === 'PAUSED' && pausedRemainingMs != null;
  const totalMs = Math.max(1, bidTimerSeconds * 1000);
  const msLeft = paused ? Math.max(0, pausedRemainingMs ?? 0) : live?.msLeft ?? 0;
  const active = bidTimerSeconds > 0 && (paused || (status === 'BIDDING' && !!live));
  const secondsLeft = Math.ceil(msLeft / 1000);
  const fraction = Math.max(0, Math.min(1, msLeft / totalMs));
  const phase = secondsLeft <= 5 ? 'urgent' : fraction <= 0.4 ? 'warm' : 'calm';
  return { active, paused, msLeft, secondsLeft, fraction, phase };
}

const PHASE_COLOR = {
  calm: 'var(--color-ipl-gold)',
  warm: 'var(--color-ipl-orange)',
  urgent: 'var(--color-danger)',
} as const;

// Plays the last-five-seconds ticks and the two "going" calls, once per deadline.
function useClockCues(clock: ClockReading, deadlineKey: string | null, audible: boolean, hasBids: boolean) {
  const lastTick = useRef<number | null>(null);
  const called = useRef<{ key: string | null; once: boolean; twice: boolean }>({ key: null, once: false, twice: false });

  useEffect(() => {
    if (called.current.key !== deadlineKey) {
      called.current = { key: deadlineKey, once: false, twice: false };
      lastTick.current = null;
    }
    if (!audible || !clock.active || clock.paused || clock.msLeft <= 0) return;
    const s = clock.secondsLeft;
    if (s <= 5 && s !== lastTick.current) {
      lastTick.current = s;
      liveSounds.tick(s);
    }
    if (!hasBids) return;
    if (s <= 5 && s > 2 && !called.current.once) {
      called.current.once = true;
      liveSounds.going(1);
    }
    if (s <= 2 && !called.current.twice) {
      called.current.once = true;
      called.current.twice = true;
      liveSounds.going(2);
    }
  }, [clock.secondsLeft, clock.active, clock.paused, clock.msLeft, deadlineKey, audible, hasBids]);
}

interface BidClockProps extends ClockInput {
  bidVersion: number;
  audible?: boolean;
  size?: number;
  // False until someone opens the bidding; the lot then goes unsold at zero.
  hasBids?: boolean;
}

// Projector ring with the going-once / going-twice callout beside it.
export function BidClock({ bidVersion, audible = false, size = 112, hasBids = true, ...input }: BidClockProps) {
  const clock = useLotClock(input);
  useClockCues(clock, input.bidEndsAt, audible, hasBids);
  if (!clock.active) return null;

  const stroke = Math.round(size / 11);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = clock.paused ? 'var(--color-ink-3)' : PHASE_COLOR[clock.phase];
  const closing = !clock.paused && clock.msLeft > 0;
  const callout = !closing
    ? null
    : !hasBids
      ? clock.secondsLeft <= 5 ? 'Last call' : null
      : clock.secondsLeft <= 2 ? 'Going twice' : clock.secondsLeft <= 5 ? 'Going once' : null;

  return (
    <div className="flex items-center gap-4">
      <motion.div
        key={bidVersion}
        className="relative shrink-0"
        style={{ width: size, height: size }}
        initial={{ scale: 1.08 }}
        animate={{ scale: clock.phase === 'urgent' && !clock.paused ? [1, 1.04, 1] : 1 }}
        transition={clock.phase === 'urgent' ? { duration: 1, repeat: Infinity } : { type: 'spring', stiffness: 400, damping: 18 }}
        role="timer"
        aria-label={clock.paused ? `Paused with ${clock.secondsLeft} seconds left` : `${clock.secondsLeft} seconds left on this lot`}
      >
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-pitch-3)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - clock.fraction)}
            style={{ transition: 'stroke-dashoffset 120ms linear, stroke 300ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {clock.paused ? (
            <Pause className="mb-0.5 h-5 w-5 text-ink-3" aria-hidden />
          ) : null}
          <span className="font-display font-extrabold leading-none tabular" style={{ color, fontSize: Math.round(size * 0.36) }}>
            {clock.secondsLeft}
          </span>
          <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-ink-3">{clock.paused ? 'Paused' : 'sec'}</span>
        </div>
      </motion.div>

      {/* Fixed-height slot: calm status text, replaced by the going calls. No layout shift. */}
      <div className="relative flex min-h-12 min-w-0 flex-1 items-center" aria-live="assertive">
        <AnimatePresence mode="popLayout" initial={false}>
          {callout ? (
            <motion.span
              key={callout}
              className={`-skew-x-12 whitespace-nowrap px-4 py-1.5 font-display text-3xl font-extrabold uppercase italic tracking-wide text-night xl:text-4xl ${
                callout === 'Going once' ? 'bg-ipl-orange' : 'bg-danger'
              }`}
              initial={{ x: -40, opacity: 0, scale: 0.9 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: 30, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 26 }}
            >
              <span className="inline-block skew-x-12">{callout}…</span>
            </motion.span>
          ) : (
            <motion.p key="calm" className="text-ink-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="block font-display text-xl font-bold uppercase tracking-wide text-ink">
                {clock.paused ? 'Clock stopped' : clock.msLeft <= 0 ? (hasBids ? 'Hammer coming down' : 'No bids') : hasBids ? 'Lot closing' : 'Open for bids'}
              </span>
              <span className="text-sm">
                {clock.paused ? 'Resumes where it left off.' : hasBids ? 'Every new bid resets the clock.' : 'Goes unsold if nobody bids.'}
              </span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Thin draining bar for phones and compact spots.
export function ClockBar({ bidVersion, className = '', ...input }: ClockInput & { bidVersion: number; className?: string }) {
  const clock = useLotClock(input);
  if (!clock.active) return null;
  const color = clock.paused ? 'var(--color-ink-3)' : PHASE_COLOR[clock.phase];
  return (
    <div className={`flex items-center gap-2 ${className}`} role="timer" aria-label={`${clock.secondsLeft} seconds left`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-pitch-3">
        <motion.div
          key={bidVersion}
          className="h-full rounded-full"
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          style={{ width: `${clock.fraction * 100}%`, backgroundColor: color, transition: 'width 120ms linear, background-color 300ms ease' }}
        />
      </div>
      <span className="inline-flex w-10 items-center justify-end gap-0.5 font-display text-lg font-bold tabular" style={{ color }}>
        {clock.paused && <Pause className="h-3.5 w-3.5" aria-hidden />}
        {clock.secondsLeft}s
      </span>
    </div>
  );
}
