import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion } from 'motion/react';
import { celebrate } from '../../utils/celebrate';
import { Player } from '../../types';
import { formatPrice } from '../../utils/format';
import { PlayerPhoto, TeamLogo } from '../ui';
import { liveSounds } from './liveSounds';

/*
  "You bought him" moment on the winning owner's phone.
  0.0s  team-colour burst, photo springs in, confetti, haptic, sound
  1.4s  photo flies into the squad counter, which ticks n-1 -> n
        purse counts down from before to after
  3.6s  auto-dismiss (tap anywhere to close sooner)
*/

interface BuyCelebrationProps {
  player: Player;
  teamName: string;
  teamShortName?: string;
  teamColor: string;
  price: number;
  squadAfter: number;
  maxSquad: number;
  purseAfter: number;
  onDone: () => void;
}

const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Tween({ from, to, delay, format, className }: { from: number; to: number; delay: number; format: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduceMotion()) {
      node.textContent = format(to);
      return;
    }
    const c = animate(from, to, { duration: 1, delay, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => (node.textContent = format(v)) });
    return () => c.stop();
  }, [from, to, delay, format]);
  return (
    <span ref={ref} className={className}>
      {format(from)}
    </span>
  );
}

const fmtPrice = (n: number) => formatPrice(Math.round(n * 100) / 100);

export function BuyCelebration({ player, teamName, teamShortName, teamColor, price, squadAfter, maxSquad, purseAfter, onDone }: BuyCelebrationProps) {
  const [phase, setPhase] = useState<'reveal' | 'fly'>('reveal');
  const [flyTo, setFlyTo] = useState({ x: 0, y: -260 });
  const photoRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    navigator.vibrate?.([60, 40, 140]);
    liveSounds.youBought();
    const colors = [teamColor, '#f2c14e', '#ffffff'];
    celebrate([
      { particleCount: 110, spread: 80, origin: { y: 0.45 }, colors, scalar: 0.9 },
      { particleCount: 60, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors, delay: 250 },
      { particleCount: 60, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors, delay: 250 },
    ]);
    const fly = setTimeout(() => setPhase('fly'), 1400);
    const close = setTimeout(() => doneRef.current(), 3600);
    return () => {
      clearTimeout(fly);
      clearTimeout(close);
    };
  }, [teamColor]);

  // Aim the photo at the squad counter.
  useLayoutEffect(() => {
    if (phase !== 'fly') return;
    const a = photoRef.current?.getBoundingClientRect();
    const b = counterRef.current?.getBoundingClientRect();
    if (a && b) setFlyTo({ x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2) });
  }, [phase]);

  const squadShown = phase === 'fly' ? squadAfter : squadAfter - 1;

  return (
    <motion.div
      className="fixed inset-0 z-[45] flex flex-col items-center overflow-hidden bg-night/95 px-6 pt-[max(1.5rem,env(safe-area-inset-top))] text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      onClick={() => doneRef.current()}
      role="alertdialog"
      aria-label={`You bought ${player.name} for ${formatPrice(price)}`}
    >
      {/* Team-colour burst */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-[42%] h-[140vmax] w-[140vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: `radial-gradient(circle, ${teamColor}66 0%, ${teamColor}22 30%, transparent 60%)` }}
        initial={{ scale: 0.1, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        aria-hidden
      />

      {/* Squad counter the photo flies into */}
      <motion.div
        ref={counterRef}
        className="relative z-10 flex items-center gap-2 rounded-full border border-white/15 bg-pitch/90 px-4 py-1.5"
        animate={phase === 'fly' ? { scale: [1, 1.18, 1] } : { scale: 1 }}
        transition={{ delay: 0.45, duration: 0.4 }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: teamColor }} aria-hidden />
        <span className="font-display text-sm font-bold uppercase tracking-widest text-ink-2">Squad</span>
        <span className="relative inline-flex h-7 w-7 justify-center overflow-hidden font-display text-xl font-extrabold leading-7 tabular text-ink">
          {/* Odometer tick n-1 -> n as the photo lands: the old digit rolls out while the new one rolls in, never a blank */}
          <AnimatePresence initial={false}>
            <motion.span
              key={squadShown}
              className="absolute inset-x-0 text-center"
              initial={{ y: 22, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -22, opacity: 0, transition: { delay: 0.45, duration: 0.2 } }}
              transition={{ delay: phase === 'fly' ? 0.45 : 0, type: 'spring', stiffness: 500, damping: 28 }}
            >
              {squadShown}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="font-display text-base font-bold text-ink-3">/ {maxSquad}</span>
      </motion.div>

      <div className="relative z-10 mt-8 flex flex-1 flex-col items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.4, rotate: -12 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 16, delay: 0.05 }}
        >
          <TeamLogo team={{ name: teamName, shortName: teamShortName ?? teamName.slice(0, 3), color: teamColor }} size={64} className="mb-2" />
        </motion.div>
        <motion.p
          className="font-display text-lg font-bold uppercase tracking-[0.35em] text-ipl-gold"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          {teamName}
        </motion.p>
        <motion.p
          className="mt-1 font-display text-5xl font-extrabold uppercase italic leading-none text-ink"
          initial={{ scale: 1.8, opacity: 0, rotate: -6 }}
          animate={{ scale: 1, opacity: 1, rotate: -2 }}
          transition={{ type: 'spring', stiffness: 480, damping: 20, delay: 0.1 }}
        >
          You bought
        </motion.p>

        <motion.div
          ref={photoRef}
          className="mt-5 h-44 w-36 overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-[#2a54c4] via-ipl-blue to-ipl-navy shadow-[0_30px_60px_-20px_rgb(0_0_0/0.8)]"
          initial={{ scale: 0.3, opacity: 0, y: 40 }}
          animate={phase === 'fly' ? { x: flyTo.x, y: flyTo.y, scale: 0.12, opacity: 0.2 } : { scale: 1, opacity: 1, y: 0, x: 0 }}
          transition={phase === 'fly' ? { duration: 0.55, ease: [0.55, 0, 0.8, 0.2] } : { type: 'spring', stiffness: 260, damping: 18, delay: 0.2 }}
        >
          <PlayerPhoto player={player} eager className="h-full w-full object-contain object-bottom" />
        </motion.div>

        <motion.h2
          className="mt-5 font-display text-4xl font-extrabold uppercase italic leading-none text-ink"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          {player.name}
        </motion.h2>
        <motion.p className="mt-2 font-display text-5xl font-extrabold tabular text-ipl-gold" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
          {formatPrice(price)}
        </motion.p>

        <motion.div
          className="mt-6 rounded-2xl border border-line bg-pitch/80 px-5 py-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <p className="text-sm text-ink-3">Purse left</p>
          <Tween from={purseAfter + price} to={purseAfter} delay={1.3} format={fmtPrice} className="font-display text-3xl font-bold tabular text-ink" />
        </motion.div>

        <p className="mt-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-ink-3">Tap anywhere to continue</p>
      </div>
    </motion.div>
  );
}
