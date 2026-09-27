import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SkipForward, Hand, Repeat } from 'lucide-react';
import { AuctionStatus } from '../../types';
import { useCountdown } from '../../hooks/useCountdown';
import { Button } from '../ui';

interface NextPlayerBeatProps {
  status: AuctionStatus;
  nextPlayerAt: string | null;
  autoAdvance: boolean;
  delaySeconds: number;
  serverOffsetMs: number;
  compact?: boolean;
  // Auctioneer only. Omit on view-only screens and phones.
  controls?: {
    onNextNow: () => void;
    onHold: () => void;
    onResumeAuto: () => void;
  };
}

// The beat between lots: "Next player in 4…" with a draining bar, or a hold notice.
export function NextPlayerBeat({ status, nextPlayerAt, autoAdvance, delaySeconds, serverOffsetMs, compact = false, controls }: NextPlayerBeatProps) {
  const between = status === 'SOLD' || status === 'UNSOLD';
  const countdown = useCountdown(between ? nextPlayerAt : null, serverOffsetMs);
  const running = between && !!countdown && autoAdvance;
  const fraction = running ? Math.max(0, Math.min(1, countdown.msLeft / Math.max(1, delaySeconds * 1000))) : 0;
  const show = between && (running || !!controls || !autoAdvance);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="beat"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.25 }}
          className={`relative overflow-hidden rounded-2xl border border-line-strong bg-pitch/90 ${compact ? 'px-3 py-2.5' : 'px-5 py-4'}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`font-display font-bold uppercase tracking-wide text-ink ${compact ? 'text-base' : 'text-2xl'}`}>
              {running ? (
                <>
                  Next player in <span className="tabular text-ipl-orange">{countdown.secondsLeft}</span>
                </>
              ) : autoAdvance ? (
                'Bringing up the next player'
              ) : (
                <span className="text-ink-2">Auto-advance is off</span>
              )}
            </p>
            {controls && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" icon={<SkipForward className="h-4 w-4" />} onClick={controls.onNextNow}>
                  Next now
                </Button>
                {autoAdvance ? (
                  <Button size="sm" icon={<Hand className="h-4 w-4" />} onClick={controls.onHold}>
                    Hold
                  </Button>
                ) : (
                  <Button size="sm" icon={<Repeat className="h-4 w-4" />} onClick={controls.onResumeAuto}>
                    Auto on
                  </Button>
                )}
              </div>
            )}
          </div>
          {running && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-pitch-3" aria-hidden>
              <div className="h-full stripe-ipl" style={{ width: `${fraction * 100}%`, transition: 'width 120ms linear' }} />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
