import confetti from 'canvas-confetti';

/*
  One place for confetti. Rapid sales used to stack bursts into a storm that
  covered the next lot, so every burst clears what is still falling, and bursts
  closer together than COOLDOWN_MS are skipped. Respects reduced motion.
*/

const COOLDOWN_MS = 2500;
let lastBurstAt = 0;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Each entry fires after its `delay` (ms). Returns false when the burst was skipped.
export function celebrate(bursts: Array<confetti.Options & { delay?: number }>): boolean {
  const now = Date.now();
  if (prefersReducedMotion() || now - lastBurstAt < COOLDOWN_MS) return false;
  lastBurstAt = now;
  try {
    confetti.reset();
    for (const { delay = 0, ...opts } of bursts) {
      const fire = () => confetti({ disableForReducedMotion: true, ticks: 160, ...opts });
      if (delay) setTimeout(fire, delay);
      else fire();
    }
  } catch {
    // Decoration only.
  }
  return true;
}

// Clear anything still falling, e.g. when the results screen opens.
export function clearCelebration() {
  try {
    confetti.reset();
  } catch {
    // Decoration only.
  }
}
