import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { BrandMark } from './ui';

/*
  Opening title card for the landing page: the crest lands, the wordmark wipes in,
  the gavel line strikes, then the card lifts away like a curtain to reveal the page.

  Plays once per browser session and only on "/", so join links and repeat visits
  go straight to the page. Any click or key skips it. Rendered in a portal because
  App.tsx's screen wrapper is transformed, which would re-anchor a fixed overlay.
*/

const EASE = [0.16, 1, 0.3, 1] as const;
const SEEN_KEY = 'aa:intro-seen';

/** Seconds from mount until the curtain starts to lift. Hero entrances start here too. */
export const INTRO_HOLD = 1.45;
const INTRO_HOLD_REDUCED = 0.6;

export function introHold(reduce: boolean | null) {
  return reduce ? INTRO_HOLD_REDUCED : INTRO_HOLD;
}

export function shouldPlayIntro(): boolean {
  if (typeof window === 'undefined' || window.location.pathname !== '/') return false;
  try {
    return sessionStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return false; // storage blocked: don't risk replaying it on every visit
  }
}

export function LandingIntro({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Storage unavailable; the intro just plays again next visit.
    }
    const t = setTimeout(onDone, introHold(reduce) * 1000);
    const skip = () => onDone();
    window.addEventListener('keydown', skip);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', skip);
    };
  }, [onDone, reduce]);

  // Reduced motion keeps the title card but drops every movement: it simply fades.
  const at = (delay: number, duration = 0.5) => ({ duration: reduce ? 0.2 : duration, delay: reduce ? 0 : delay, ease: EASE });

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[70] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-night"
      initial={false}
      exit={reduce ? { opacity: 0, transition: { duration: 0.25 } } : { clipPath: 'inset(0% 0% 100% 0%)', transition: { duration: 0.6, ease: EASE } }}
      style={{ clipPath: 'inset(0% 0% 0% 0%)' }}
      onClick={onDone}
      aria-hidden
    >
      {/* Floodlight coming up behind the crest */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(60% 50% at 50% 42%, rgb(53 99 216 / 0.45), transparent 70%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={at(0.05, 0.7)}
      />

      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(16px) scale(0.9)' }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px) scale(1)' }}
        transition={reduce ? at(0) : { type: 'spring', duration: 0.6, bounce: 0.2, delay: 0.1 }}
      >
        <BrandMark className="h-28 w-[100px] drop-shadow-[0_16px_40px_rgb(243_111_33/0.45)] sm:h-36 sm:w-[128px]" />
      </motion.div>

      <motion.p
        className="relative mt-6 font-display text-5xl font-extrabold uppercase italic tracking-wide text-ink sm:text-7xl"
        initial={reduce ? { opacity: 0 } : { clipPath: 'inset(0% 100% 0% 0%)' }}
        animate={reduce ? { opacity: 1 } : { clipPath: 'inset(0% 0% 0% 0%)' }}
        transition={at(0.35, 0.55)}
      >
        Auction <span className="text-ipl-orange">Arena</span>
      </motion.p>

      {/* The gavel line: strikes left to right under the wordmark */}
      <motion.span
        className="mt-3 block h-1 w-48 origin-left rounded-full bg-gradient-to-r from-ipl-orange to-ipl-gold sm:w-72"
        initial={reduce ? { opacity: 0 } : { transform: 'scaleX(0)' }}
        animate={reduce ? { opacity: 1 } : { transform: 'scaleX(1)' }}
        transition={at(0.75, 0.35)}
      />

      <motion.p
        className="mt-5 font-display text-sm font-bold uppercase tracking-[0.35em] text-ipl-gold sm:text-base"
        initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px)' }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' }}
        transition={at(0.9, 0.4)}
      >
        Your league. Your auction.
      </motion.p>
    </motion.div>,
    document.body,
  );
}
