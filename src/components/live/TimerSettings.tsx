import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Timer } from 'lucide-react';
import { AuctionSettings } from '../../types';
import { Button, ChoiceGroup, Switch } from '../ui';

export type TimerPatch = Partial<Pick<AuctionSettings, 'bidTimerSeconds' | 'autoAdvance' | 'autoAdvanceDelaySeconds'>>;

interface TimerSettingsProps {
  settings: Pick<AuctionSettings, 'bidTimerSeconds' | 'autoAdvance' | 'autoAdvanceDelaySeconds'>;
  onChange: (patch: TimerPatch) => void;
}

// Compact popover in the auctioneer bar: lot timer length and auto-advance, changeable mid-auction.
export function TimerSettings({ settings, onChange }: TimerSettingsProps) {
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

  const summary = `${settings.bidTimerSeconds > 0 ? `${settings.bidTimerSeconds}s` : 'No timer'}${settings.autoAdvance ? ' · Auto' : ''}`;

  return (
    <div ref={ref} className="relative">
      <Button size="md" icon={<Timer className="h-4 w-4" />} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" title="Timer settings">
        {summary}
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Timer settings"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute bottom-full right-0 z-50 mb-2 w-80 origin-bottom-right space-y-4 rounded-2xl border border-line-strong bg-pitch p-4 shadow-2xl"
          >
            <ChoiceGroup
              label="Lot timer (resets on every bid)"
              value={settings.bidTimerSeconds}
              options={[0, 10, 15, 20, 30].map((v) => ({ value: v, label: v === 0 ? 'Off' : `${v}s` }))}
              onChange={(v) => onChange({ bidTimerSeconds: v })}
            />
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
