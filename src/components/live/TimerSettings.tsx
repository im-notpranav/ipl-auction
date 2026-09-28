import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Timer } from 'lucide-react';
import { AuctionSettings } from '../../types';
import { Button, ChoiceGroup, Switch } from '../ui';

export type TimerPatch = Partial<Pick<AuctionSettings, 'autoAdvance' | 'autoAdvanceDelaySeconds'>>;

interface TimerSettingsProps {
  settings: Pick<AuctionSettings, 'autoAdvance' | 'autoAdvanceDelaySeconds'>;
  onChange: (patch: TimerPatch) => void;
  // 'up' from the bottom control bar, 'down' from the top strip on phones.
  placement?: 'up' | 'down';
}

// Compact popover in the auctioneer bar: auto-advance and its pause, changeable mid-auction.
export function TimerSettings({ settings, onChange, placement = 'up' }: TimerSettingsProps) {
  const down = placement === 'down';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const summary = settings.autoAdvance ? `Auto next · ${settings.autoAdvanceDelaySeconds}s` : 'Manual next';

  return (
    <div ref={ref} className="relative">
      <Button size={down ? 'sm' : 'md'} icon={<Timer className="h-4 w-4" />} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" title="Next player settings">
        {summary}
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Next player settings"
            initial={{ opacity: 0, y: down ? -8 : 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: down ? -6 : 6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className={`absolute right-0 z-50 w-[min(20rem,calc(100vw-2rem))] space-y-4 rounded-2xl border border-line-strong bg-pitch p-4 shadow-2xl ${
              down ? 'top-full mt-2 origin-top-right' : 'bottom-full mb-2 origin-bottom-right'
            }`}
          >
            <Switch
              label="Auto-advance"
              hint="Bring up the next player after each sale"
              checked={settings.autoAdvance}
              onChange={(v) => onChange({ autoAdvance: v })}
            />
            {settings.autoAdvance && (
              <ChoiceGroup
                label="Pause between players"
                value={settings.autoAdvanceDelaySeconds}
                options={[3, 5, 8].map((v) => ({ value: v, label: `${v}s` }))}
                onChange={(v) => onChange({ autoAdvanceDelaySeconds: v })}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
