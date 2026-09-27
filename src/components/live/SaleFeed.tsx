import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Gavel, XCircle } from 'lucide-react';
import { formatPrice } from '../../utils/format';

export interface SaleFeedItem {
  id: string;
  kind: 'sold' | 'unsold';
  playerName: string;
  teamShort?: string;
  teamColor?: string;
  price?: number;
}

function FeedCard({ item, onDismiss }: { item: SaleFeedItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), item.kind === 'sold' ? 3400 : 2400);
    return () => clearTimeout(t);
  }, [item.id, item.kind, onDismiss]);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className="pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-xl border border-line-strong bg-pitch/95 py-2.5 pl-4 pr-3 shadow-2xl backdrop-blur-md"
      onClick={() => onDismiss(item.id)}
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: item.kind === 'sold' ? item.teamColor || '#8390bd' : 'var(--color-danger)' }} aria-hidden />
      {item.kind === 'sold' ? <Gavel className="h-4 w-4 shrink-0 text-ipl-gold" aria-hidden /> : <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden />}
      <p className="min-w-0 flex-1 truncate text-sm text-ink">
        {item.kind === 'sold' ? (
          <>
            <span className="font-display font-bold tracking-wide">{item.teamShort}</span> bought <span className="font-semibold">{item.playerName}</span>
          </>
        ) : (
          <>
            <span className="font-semibold">{item.playerName}</span> <span className="text-ink-3">went unsold</span>
          </>
        )}
      </p>
      {item.kind === 'sold' && item.price != null && (
        <span className="whitespace-nowrap font-display text-base font-bold tabular text-ipl-gold">{formatPrice(item.price)}</span>
      )}
    </motion.li>
  );
}

// Other teams' results on the phone: short cards that slide in under the header.
export function SaleFeed({ items, onDismiss }: { items: SaleFeedItem[]; onDismiss: (id: string) => void }) {
  return (
    <ul aria-live="polite" className="pointer-events-none fixed inset-x-0 top-20 z-40 mx-auto flex max-w-md flex-col gap-2 px-4">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <FeedCard key={item.id} item={item} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </ul>
  );
}
