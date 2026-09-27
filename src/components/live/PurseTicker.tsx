import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Team } from '../../types';
import { formatPrice } from '../../utils/format';
import { CountUp, TeamLogo } from '../ui';

interface PurseTickerProps {
  teams: Team[];
  leaderId: string | null;
  maxSquadSize: number;
  maxOverseas: number;
}

// Flashes the card in the team's colour when its purse drops (a sale just landed there).
function useSpendFlash(purse: number) {
  const prev = useRef(purse);
  const [flashAt, setFlashAt] = useState<number | null>(null);
  useEffect(() => {
    if (purse < prev.current - 1e-9) setFlashAt(performance.now());
    prev.current = purse;
  }, [purse]);
  return [flashAt, () => setFlashAt(null)] as const;
}

function SpendFlash({ purse, color }: { purse: number; color: string }) {
  const [flashAt, clear] = useSpendFlash(purse);
  return (
    <AnimatePresence>
      {flashAt && (
        <motion.span
          key={flashAt}
          className="pointer-events-none absolute inset-0"
          style={{ background: `linear-gradient(90deg, ${color}66, transparent 80%)` }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          onAnimationComplete={clear}
          aria-hidden
        />
      )}
    </AnimatePresence>
  );
}

// Broadcast-style purse strip: every franchise's money, squad and overseas slots at a glance.
// Order stays fixed (join order) so eyes can find a team; the leader is lit up instead.
export function PurseTicker({ teams, leaderId, maxSquadSize, maxOverseas }: PurseTickerProps) {
  if (teams.length === 0) return null;
  return (
    <div className="border-t border-line bg-night/70">
      <ul className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-2.5 no-scrollbar sm:px-6" aria-label="Team purses">
        {teams.map((t) => {
          const leading = t.id === leaderId;
          const share = t.startingPurse > 0 ? t.remainingPurse / t.startingPurse : 0;
          return (
            <motion.li
              key={t.id}
              layout
              animate={{ scale: leading ? 1.03 : 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`relative min-w-[150px] shrink-0 overflow-hidden rounded-xl border px-3 py-2 ${
                leading ? 'border-live/60 bg-live/10' : 'border-line bg-pitch/80'
              }`}
            >
              <SpendFlash purse={t.remainingPurse} color={t.color || '#8390bd'} />
              <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: t.color || '#8390bd' }} aria-hidden />
              <div className="relative flex items-baseline justify-between gap-2 pl-1">
                <span className="inline-flex items-center gap-1.5 font-display text-base font-extrabold uppercase tracking-wider text-ink">
                  {leading && (
                    <span className="relative flex h-2 w-2" aria-label="Leading bid">
                      <span className="absolute inset-0 animate-ping rounded-full bg-live opacity-70" />
                      <span className="relative h-2 w-2 rounded-full bg-live" />
                    </span>
                  )}
                  <TeamLogo team={t} size={22} />
                  {t.shortName}
                </span>
                <CountUp
                  value={t.remainingPurse}
                  duration={0.9}
                  format={(n) => formatPrice(Math.round(n * 100) / 100)}
                  className="whitespace-nowrap font-display text-base font-bold tabular text-ipl-gold"
                />
              </div>
              {/* Purse left, drawn with scaleX so the drain on a sale is a transform, not a relayout */}
              <div className="relative ml-1 mt-1 h-1 overflow-hidden rounded-full bg-pitch-3" aria-hidden>
                <motion.div
                  className="h-full origin-left rounded-full bg-ipl-gold/80"
                  initial={false}
                  animate={{ scaleX: Math.max(0.02, share) }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <p className="relative mt-1 flex justify-between pl-1 text-xs tabular text-ink-3">
                <span>
                  Squad {t.squadSize}/{maxSquadSize}
                </span>
                <span>
                  OS {t.overseasCount}/{maxOverseas}
                </span>
              </p>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
