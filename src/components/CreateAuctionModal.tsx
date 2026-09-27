import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Gavel, Timer, Wallet, Eye } from 'lucide-react';
import { AuctionSettings } from '../types';
import { Button, ChoiceGroup, Modal, Notice, Switch, TextField } from './ui';

interface CreateAuctionModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Resolves when the room exists; rejects with a user-facing message otherwise.
  onCreateRoom: (data: { name: string; auctioneerName: string; settings: Partial<AuctionSettings> }) => Promise<void>;
}

const PURSE_OPTIONS = [100, 120, 150].map((value) => ({ value, label: `₹${value} Cr` }));
const SQUAD_OPTIONS = [15, 18, 25].map((value) => ({ value, label: `${value}` }));
const TIMER_OPTIONS = [0, 10, 15, 20, 30].map((value) => ({ value, label: value === 0 ? 'Off' : `${value}s` }));
const DELAY_OPTIONS = [3, 5, 8].map((value) => ({ value, label: `${value}s` }));

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-2xl border border-line bg-night/40 p-4 sm:p-5">
      <legend className="flex items-center gap-2 px-1 font-display text-base font-bold uppercase tracking-wider text-ink">
        <span className="text-ipl-orange">{icon}</span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

export const CreateAuctionModal: React.FC<CreateAuctionModalProps> = ({ isOpen, onClose, onCreateRoom }) => {
  // Hooks must run on every render. They used to sit after `if (!isOpen) return null`,
  // which made React throw the moment the dialog opened and blanked the whole app.
  const [name, setName] = useState('IPL Mega Auction 2026');
  const [auctioneerName, setAuctioneerName] = useState('');
  const [startingPurse, setStartingPurse] = useState(120);
  const [maxSquadSize, setMaxSquadSize] = useState(18);
  const [bidTimerSeconds, setBidTimerSeconds] = useState(20);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [autoAdvanceDelaySeconds, setAutoAdvanceDelaySeconds] = useState(5);
  const [reauctionUnsold, setReauctionUnsold] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; auctioneerName?: string; submit?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const auctioneerRef = useRef<HTMLInputElement>(null);

  const validate = (field?: 'name' | 'auctioneerName') => {
    const found: typeof errors = {};
    if (!name.trim()) found.name = 'Give the auction a name.';
    if (!auctioneerName.trim()) found.auctioneerName = 'Enter your name so teams know who is running the room.';
    // On blur only touch the field that was left; on submit check everything.
    setErrors((prev) => (field ? { ...prev, [field]: found[field] } : found));
    return found;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate();
    if (found.name) return nameRef.current?.focus();
    if (found.auctioneerName) return auctioneerRef.current?.focus();

    setSubmitting(true);
    try {
      await onCreateRoom({
        name: name.trim(),
        auctioneerName: auctioneerName.trim(),
        settings: {
          startingPurse,
          maxSquadSize,
          maxOverseas: 8,
          isPublic,
          bidTimerSeconds,
          autoAdvance,
          autoAdvanceDelaySeconds,
          reauctionUnsold,
        },
      });
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : 'Could not create the auction. Try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const timerHint =
    bidTimerSeconds === 0
      ? 'No clock. A lot stays open until you call Sold or Unsold.'
      : `Each bid resets a ${bidTimerSeconds}s clock. When it runs out the lot is sold to the highest bidder, or goes unsold.`;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      title="New auction"
      description="You run the room as auctioneer. Teams join from their phones."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="create-auction-form" variant="primary" icon={<Gavel className="h-4 w-4" />} loading={submitting}>
            Create auction
          </Button>
        </>
      }
    >
      <form id="create-auction-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {errors.submit && <Notice tone="error">{errors.submit}</Notice>}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            ref={nameRef}
            label="Auction name"
            required
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => validate('name')}
            error={errors.name}
          />
          <TextField
            ref={auctioneerRef}
            label="Your name"
            required
            placeholder="e.g. Arjun"
            autoComplete="name"
            value={auctioneerName}
            maxLength={40}
            onChange={(e) => setAuctioneerName(e.target.value)}
            onBlur={() => auctioneerName && validate('auctioneerName')}
            error={errors.auctioneerName}
            hint="You run the big screen and call the hammer. The auctioneer doesn't own a team."
          />
        </div>

        <Section icon={<Wallet className="h-4 w-4" />} title="Purse & squad">
          <ChoiceGroup label="Starting purse per team" value={startingPurse} options={PURSE_OPTIONS} onChange={setStartingPurse} />
          <ChoiceGroup
            label="Maximum squad size"
            value={maxSquadSize}
            options={SQUAD_OPTIONS}
            onChange={setMaxSquadSize}
            hint={`Up to 8 overseas per squad. Teams must keep ₹0.20 Cr for every empty slot, so a ₹${startingPurse} Cr purse can't all go on one star.`}
          />
        </Section>

        <Section icon={<Timer className="h-4 w-4" />} title="Bidding">
          <ChoiceGroup label="Bid timer" value={bidTimerSeconds} options={TIMER_OPTIONS} onChange={setBidTimerSeconds} hint={timerHint} />
          <Switch
            label="Bring up the next player automatically"
            hint={autoAdvance ? `After Sold or Unsold, the next lot opens after ${autoAdvanceDelaySeconds}s.` : 'You press Next player after every lot.'}
            checked={autoAdvance}
            onChange={setAutoAdvance}
          />
        </Section>

        <div>
          <button
            type="button"
            aria-expanded={showAdvanced}
            aria-controls="create-advanced"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-left text-sm font-semibold text-ink-2 transition-colors hover:text-ink"
          >
            More options
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          <AnimatePresence initial={false}>
            {showAdvanced && (
              <motion.div
                id="create-advanced"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-5 pt-2">
                  <Section icon={<Timer className="h-4 w-4" />} title="Pacing">
                    <ChoiceGroup
                      label="Pause between lots"
                      value={autoAdvanceDelaySeconds}
                      options={DELAY_OPTIONS}
                      onChange={setAutoAdvanceDelaySeconds}
                      hint={autoAdvance ? 'Time for the room to react before the next player.' : 'Only used when automatic advance is on.'}
                    />
                    <Switch
                      label="Re-auction unsold players"
                      hint="When the pool runs out, unsold players come back once in a quick final round."
                      checked={reauctionUnsold}
                      onChange={setReauctionUnsold}
                    />
                  </Section>
                  <Section icon={<Eye className="h-4 w-4" />} title="Visibility">
                    <Switch label="List in public auctions" hint="Anyone on the home page can find and join this room." checked={isPublic} onChange={setIsPublic} />
                  </Section>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="rounded-xl bg-pitch-2/70 px-4 py-3 text-sm text-ink-2">
          <span className="font-semibold text-ink">Summary:</span> ₹{startingPurse} Cr purses, {maxSquadSize}-player squads,{' '}
          {bidTimerSeconds === 0 ? 'no bid timer' : `${bidTimerSeconds}s bid timer`}, {autoAdvance ? 'automatic' : 'manual'} next player
          {reauctionUnsold ? ', unsold players re-auctioned' : ''}, {isPublic ? 'public' : 'private'} room.
        </p>
      </form>
    </Modal>
  );
};
