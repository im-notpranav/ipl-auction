import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Star } from 'lucide-react';
import { ALL_PLAYERS } from '../../data/players';
import { getPlayerRating } from '../../services/playerRatings';
import { formatPrice, formatRole } from '../../utils/format';
import { Drawer, EmptyState, PlayerPhoto, ratingColor } from '../ui';

// Per-room shortlist kept on this phone only (a convenience, not shared state).
export function useWishlist(roomId: string) {
  const key = `ipl_wishlist_${roomId}`;
  const [ids, setIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(ids));
    } catch {
      // Storage unavailable; the list still works for this session.
    }
  }, [key, ids]);

  const toggle = useCallback((id: string) => setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])), []);
  const has = useCallback((id: string) => ids.includes(id), [ids]);
  return { ids, toggle, has };
}

const PAGE = 40;

interface WishlistDrawerProps {
  open: boolean;
  onClose: () => void;
  auctionedIds: string[];
  wishlist: ReturnType<typeof useWishlist>;
}

export function WishlistDrawer({ open, onClose, auctionedIds, wishlist }: WishlistDrawerProps) {
  const [q, setQ] = useState('');
  const done = useMemo(() => new Set(auctionedIds), [auctionedIds]);

  const pool = useMemo(() => {
    const query = q.trim().toLowerCase();
    return ALL_PLAYERS.filter((p) => !done.has(p.id))
      .filter((p) => !query || p.name.toLowerCase().includes(query) || p.nationality.toLowerCase().includes(query))
      .map((p) => ({ p, r: getPlayerRating(p).overall, starred: wishlist.has(p.id) }))
      .sort((a, b) => Number(b.starred) - Number(a.starred) || b.r - a.r);
  }, [q, done, wishlist]);

  const starredLeft = wishlist.ids.filter((id) => !done.has(id)).length;

  return (
    <Drawer open={open} onClose={onClose} title={`Wishlist (${starredLeft})`}>
      <p className="text-sm text-ink-2">Star players you want. Your phone buzzes and highlights them when they come up.</p>
      <label htmlFor="wishlist-search" className="sr-only">
        Search players still to be auctioned
      </label>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          id="wishlist-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search players still to come"
          className="h-11 w-full rounded-xl border border-line bg-night pl-10 pr-3 text-base text-ink placeholder:text-ink-3 outline-none focus:border-ipl-orange focus:ring-2 focus:ring-ipl-orange/25"
        />
      </div>
      {pool.length === 0 ? (
        <EmptyState icon={<Search className="h-8 w-8" />} title="No players found">
          Everyone matching that search has already been auctioned.
        </EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {pool.slice(0, PAGE).map(({ p, r, starred }) => (
            <li key={p.id}>
              <button
                onClick={() => wishlist.toggle(p.id)}
                aria-pressed={starred}
                className="flex w-full items-center gap-3 py-2.5 text-left"
              >
                <PlayerPhoto player={p} className="h-11 w-9 shrink-0 rounded-lg bg-pitch-2" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{p.name}</span>
                  <span className="block text-xs text-ink-3">
                    {formatRole(p.role)} · Base {formatPrice(p.basePrice)}
                    {p.isOverseas ? ' · Overseas' : ''}
                  </span>
                </span>
                <span className="w-7 text-right font-display text-lg font-bold tabular" style={{ color: ratingColor(r) }}>
                  {r}
                </span>
                <Star className={`h-5 w-5 shrink-0 transition-colors ${starred ? 'fill-ipl-gold text-ipl-gold' : 'text-ink-3'}`} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {pool.length > PAGE && <p className="mt-3 text-center text-xs text-ink-3">Showing the top {PAGE} of {pool.length}. Search to find others.</p>}
    </Drawer>
  );
}
