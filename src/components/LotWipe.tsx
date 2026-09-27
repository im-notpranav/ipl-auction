import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, Variants } from 'motion/react';

/*
  Broadcast-style wipe when the next player comes up. Timed with the
  playerReveal sound: bands sweep in with the whoosh (~0.45s), the lot card
  holds on the impact, then everything clears to the right. It never blocks
  input (pointer-events: none) and is skipped entirely with reduced motion.
*/

interface LotWipeProps {
  playerId: string | null;
  lot: number;
  total: number;
  round: string;
}

const BANDS = ['bg-ipl-orange', 'bg-ipl-gold', 'bg-ipl-navy'];

const band: Variants = {
  hidden: { x: '-115%' },
  show: (i: number) => ({ x: '0%', transition: { duration: 0.42, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] } }),
  leave: (i: number) => ({ x: '115%', transition: { duration: 0.42, delay: (BANDS.length - 1 - i) * 0.05, ease: [0.7, 0, 0.84, 0] } }),
};

const card: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: { delay: 0.3, duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
  leave: { opacity: 0, scale: 1.04, transition: { duration: 0.15 } },
};

export function LotWipe({ playerId, lot, total, round }: LotWipeProps) {
  const [shownFor, setShownFor] = useState<string | null>(null);
  const previous = useRef<string | null>(playerId);

  useEffect(() => {
    const changed = !!playerId && previous.current !== playerId;
    previous.current = playerId;
    if (!changed || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    setShownFor(playerId);
    const t = setTimeout(() => setShownFor(null), 1100);
    return () => clearTimeout(t);
  }, [playerId]);

  return (
    <AnimatePresence>
      {shownFor && (
        <motion.div key={shownFor} className="pointer-events-none fixed inset-0 z-30 overflow-hidden" initial="hidden" animate="show" exit="leave" aria-hidden>
          {BANDS.map((color, i) => (
            <motion.div key={color} custom={i} variants={band} className={`absolute -inset-y-1/4 -left-[20%] w-[140%] -skew-x-[18deg] ${color}`} />
          ))}
          <motion.div variants={card} className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
            <p className="font-display text-2xl font-bold uppercase tracking-[0.4em] text-ipl-gold">{round} round</p>
            <p className="mt-2 font-display text-8xl font-extrabold uppercase italic leading-none text-ink sm:text-[10rem]">Lot {lot}</p>
            <p className="font-display text-2xl font-semibold uppercase tracking-[0.3em] text-ink-2">of {total}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
