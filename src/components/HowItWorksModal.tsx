import React from 'react';
import { Tv, Smartphone, Gavel, Timer, Wallet, Globe, ListChecks, ArrowRight } from 'lucide-react';
import { MAX_IMPACT_SUBS, MAX_OVERSEAS_IN_XI, MIN_BOWLING_OPTIONS, XI_SIZE } from '../services/playingXIRules';
import { Button, Modal } from './ui';

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLES = [
  { icon: Tv, title: 'The big screen', text: 'One laptop on the TV or projector is the auction stage: the player, the live bid, the clock and the leading team.' },
  { icon: Smartphone, title: 'A paddle per team', text: 'Every franchise owner bids from their phone with one tap and always sees their purse, squad and overseas count.' },
  { icon: Gavel, title: 'The auctioneer', text: 'Starts the auction, can pause, add time, call Sold or Unsold early, and undo a sale made by mistake.' },
];

// One lot, left to right.
const LOT_FLOW = [
  { label: 'Player on the block', detail: 'Opens at the base price' },
  { label: 'Bids come in', detail: 'Each bid resets the clock' },
  { label: 'Going once, going twice', detail: 'Final seconds count down' },
  { label: 'Sold or unsold', detail: 'Highest bid wins when time runs out' },
  { label: 'Next player', detail: 'Comes up by itself after a short pause' },
];

const RULES = [
  { icon: Wallet, title: 'Purse reserve', text: 'Keep ₹0.20 Cr for every squad slot you still need to fill. Bids that break this are blocked.' },
  { icon: Globe, title: 'Overseas cap', text: 'Up to 8 overseas players in a squad. Your paddle locks for overseas players once you hit it.' },
  { icon: Timer, title: 'Bid increments', text: '+₹0.20 Cr up to ₹5 Cr, +₹0.25 Cr to ₹10 Cr, +₹0.50 Cr to ₹20 Cr, then +₹1 Cr. The paddle always shows the next legal bid.' },
];

const XI_RULES = [
  `Exactly ${XI_SIZE} players from your squad`,
  `At most ${MAX_OVERSEAS_IN_XI} overseas players`,
  'A wicket-keeper who keeps wicket',
  'A captain and a different vice-captain',
  `At least ${MIN_BOWLING_OPTIONS} bowling options (20 overs, 4 each)`,
  'A full batting order',
  `Up to ${MAX_IMPACT_SUBS} impact substitutes from the bench`,
];

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display text-sm font-bold uppercase tracking-[0.25em] text-ipl-orange">{children}</h3>;
}

export const HowItWorksModal: React.FC<HowItWorksModalProps> = ({ isOpen, onClose }) => (
  <Modal
    open={isOpen}
    onClose={onClose}
    size="lg"
    title="How an auction night works"
    description="Everyone is in the same room. Every screen stays in sync, live."
    footer={<Button variant="primary" onClick={onClose}>Got it</Button>}
  >
    <div className="space-y-7">
      <section className="grid gap-4 sm:grid-cols-3">
        {ROLES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border border-line bg-night/40 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ipl-orange/10 text-ipl-orange">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h4 className="mt-3 font-display text-lg font-bold uppercase tracking-wide text-ink">{title}</h4>
            <p className="mt-1 text-sm text-ink-2">{text}</p>
          </div>
        ))}
      </section>

      <section>
        <Heading>One lot, start to finish</Heading>
        <ol className="mt-3 grid gap-2 sm:grid-cols-5">
          {LOT_FLOW.map((step, i) => (
            <li key={step.label} className="relative flex gap-3 rounded-xl border border-line bg-night/40 p-3 sm:flex-col sm:gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ipl-blue font-display text-sm font-bold text-ink tabular">{i + 1}</span>
              <span>
                <span className="block font-display text-base font-bold uppercase leading-tight text-ink">{step.label}</span>
                <span className="mt-0.5 block text-xs text-ink-3">{step.detail}</span>
              </span>
              {i < LOT_FLOW.length - 1 && (
                <ArrowRight className="absolute -right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-line-strong sm:block" aria-hidden />
              )}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm text-ink-3">The clock length and automatic next player are set when the auction is created. With the clock off, the auctioneer calls every lot.</p>
      </section>

      <section>
        <Heading>Squad rules while bidding</Heading>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {RULES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3 sm:flex-col sm:gap-2">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ipl-gold" aria-hidden />
              <div>
                <h4 className="font-semibold text-ink">{title}</h4>
                <p className="mt-0.5 text-sm text-ink-2">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-ipl-orange/30 bg-ipl-orange/5 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-ipl-orange" aria-hidden />
          <Heading>After the hammer: pick your Playing XI</Heading>
        </div>
        <p className="mt-2 text-sm text-ink-2">When the auction ends, every owner builds and submits an XI. It has to follow IPL playing rules:</p>
        <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {XI_RULES.map((rule) => (
            <li key={rule} className="flex gap-2 text-sm text-ink">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ipl-orange" aria-hidden />
              {rule}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-3">Then compare squads and team ratings, and download the PDF report.</p>
      </section>
    </div>
  </Modal>
);
