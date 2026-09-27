import React, { useMemo, useState } from 'react';
import { Search, Globe, ImageOff, ChevronRight, X, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { Player } from '../types';
import { ALL_PLAYERS } from '../data/players';
import { formatCategory, formatRole } from '../utils/format';
import { getPlayerRating } from '../services/playerRatings';
import { Button, Drawer, EmptyState, Panel, PlayerPhoto, Price, SectionTitle, Select, ratingColor } from './ui';
import { PlayerStats } from './PlayerStats';

const PAGE_SIZE = 60;

type SortKey = 'rating' | 'name' | 'price' | 'matches';
const SORTERS: Record<SortKey, (a: Player, b: Player) => number> = {
  rating: (a, b) => getPlayerRating(b).overall - getPlayerRating(a).overall,
  name: (a, b) => a.name.localeCompare(b.name),
  price: (a, b) => b.basePrice - a.basePrice || getPlayerRating(b).overall - getPlayerRating(a).overall,
  matches: (a, b) => b.batting.matches - a.batting.matches,
};

const SOURCE_LABELS: Record<string, { label: string; className: string }> = {
  IPL: { label: 'IPL', className: 'border-ipl-blue-bright/40 bg-ipl-blue-bright/10 text-ipl-blue-bright' },
  WIKIPEDIA: { label: 'Wikipedia', className: 'border-line-strong bg-pitch-2 text-ink-2' },
  MANUAL: { label: 'Your photo', className: 'border-live/40 bg-live/10 text-live' },
  UNAVAILABLE: { label: 'No photo', className: 'border-danger/40 bg-danger/10 text-danger' },
};

const ROLE_OPTIONS = [
  { value: 'ALL', label: 'All roles' },
  ...['BATSMAN', 'BOWLER', 'ALL_ROUNDER', 'WICKET_KEEPER'].map((r) => ({ value: r, label: `${formatRole(r)}s` })),
];
const ROUND_OPTIONS = [
  { value: 'ALL', label: 'All rounds' },
  ...['MARQUEE', 'BATSMEN', 'ALL_ROUNDERS', 'BOWLERS', 'WICKET_KEEPERS'].map((c) => ({ value: c, label: formatCategory(c) })),
];
const PHOTO_OPTIONS: { value: 'ALL' | 'WITH' | 'MISSING'; label: string }[] = [
  { value: 'ALL', label: 'Any photo' },
  { value: 'WITH', label: 'With photo' },
  { value: 'MISSING', label: 'Missing photo' },
];
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'rating', label: 'Sort: rating' },
  { value: 'price', label: 'Sort: base price' },
  { value: 'matches', label: 'Sort: IPL matches' },
  { value: 'name', label: 'Sort: name' },
];

function RatingBadge({ value, size = 'md' }: { value: number; size?: 'md' | 'lg' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border font-display font-extrabold tabular ${size === 'lg' ? 'h-11 w-12 text-2xl' : 'h-9 w-11 text-xl'}`}
      style={{ borderColor: ratingColor(value), color: ratingColor(value) }}
      aria-label={`Rating ${value}`}
    >
      {value}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_LABELS[source] ?? SOURCE_LABELS.UNAVAILABLE;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.className}`}>
      {source === 'UNAVAILABLE' && <ImageOff className="h-3 w-3" aria-hidden />}
      {meta.label}
    </span>
  );
}

export const DataHealthView: React.FC = () => {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [photo, setPhoto] = useState<'ALL' | 'WITH' | 'MISSING'>('ALL');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [sort, setSort] = useState<SortKey>('rating');
  const [openPlayer, setOpenPlayer] = useState<Player | null>(null);

  const stats = useMemo(() => {
    const withPhoto = ALL_PLAYERS.filter((p) => p.imageVerified).length;
    return {
      total: ALL_PLAYERS.length,
      withPhoto,
      fromIpl: ALL_PLAYERS.filter((p) => p.imageSource === 'IPL').length,
      overseas: ALL_PLAYERS.filter((p) => p.isOverseas).length,
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ALL_PLAYERS.filter((p) => {
      const matchesSearch = !q || [p.name, p.shortName, p.nationality, p.previousIPLTeam].some((field) => field.toLowerCase().includes(q));
      const matchesPhoto = photo === 'ALL' || (photo === 'WITH' ? p.imageVerified : !p.imageVerified);
      return matchesSearch && matchesPhoto && (role === 'ALL' || p.role === role) && (category === 'ALL' || p.category === category);
    }).sort(SORTERS[sort]);
  }, [search, role, category, photo, sort]);

  const resetPaging = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setVisible(PAGE_SIZE);
  };
  const filtersActive = !!search || role !== 'ALL' || category !== 'ALL' || photo !== 'ALL';
  const clearFilters = () => {
    setSearch('');
    setRole('ALL');
    setCategory('ALL');
    setPhoto('ALL');
    setVisible(PAGE_SIZE);
  };
  const shown = filtered.slice(0, visible);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <SectionTitle as="h1" eyebrow="Auction pool" title="Player database">
        Every player in the pool with IPL career stats. Select a player for the full breakdown.
      </SectionTitle>

      <div className="flex items-start gap-3 rounded-2xl border border-line bg-pitch-2/60 p-4 text-sm text-ink-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-ipl-blue-bright" aria-hidden />
        <p>
          <span className="font-semibold text-ink">How ratings work:</span> 40 to 99, ranked against the pool. Batting uses Batting Index (average × strike rate), bowling uses
          Combined Bowling Rate (average, economy and strike rate together). Short IPL records are pulled towards a typical squad player, so a few good games can't outrank a long career.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          ['Players', stats.total],
          ['With a photo', `${stats.withPhoto} (${Math.round((stats.withPhoto / stats.total) * 100)}%)`],
          ['Official IPL headshots', stats.fromIpl],
          ['Overseas', stats.overseas],
        ].map(([label, value]) => (
          <Panel key={label as string} className="p-4">
            <dt className="text-sm text-ink-3">{label}</dt>
            <dd className="mt-0.5 font-display text-3xl font-bold tabular text-ink">{value}</dd>
          </Panel>
        ))}
      </dl>

      {/* Filters: stick under the navbar so they stay reachable while scrolling a long list */}
      <Panel className="sticky top-16 z-20 grid grid-cols-2 gap-3 bg-pitch/95 p-4 backdrop-blur-md md:flex md:flex-wrap md:items-end">
        <div className="relative col-span-2 md:min-w-[240px] md:flex-1">
          <label htmlFor="player-search" className="sr-only">Search players</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            id="player-search"
            type="search"
            placeholder="Search by name, country or IPL team"
            value={search}
            onChange={(e) => resetPaging(setSearch)(e.target.value)}
            className="h-11 w-full rounded-xl border border-line bg-night pl-10 pr-3 text-base text-ink placeholder:text-ink-3 outline-none transition-[border-color,box-shadow] hover:border-line-strong focus:border-ipl-orange focus:ring-2 focus:ring-ipl-orange/25"
          />
        </div>
        <Select hideLabel label="Role" value={role} options={ROLE_OPTIONS} onChange={resetPaging(setRole)} />
        <Select hideLabel label="Auction round" value={category} options={ROUND_OPTIONS} onChange={resetPaging(setCategory)} />
        <Select hideLabel label="Photo" value={photo} options={PHOTO_OPTIONS} onChange={resetPaging(setPhoto)} />
        <Select hideLabel label="Sort by" value={sort} options={SORT_OPTIONS} onChange={resetPaging(setSort)} />
        <div className="col-span-2 flex items-center justify-between gap-3 md:w-full">
          <p className="text-sm tabular text-ink-3" aria-live="polite">
            {filtered.length} of {stats.total} players
          </p>
          {filtersActive && (
            <button onClick={clearFilters} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-ipl-orange hover:underline sm:min-h-0">
              <X className="h-4 w-4" aria-hidden /> Clear filters
            </button>
          )}
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={<Search />} title="No players match" action={filtersActive ? <Button onClick={clearFilters}>Clear filters</Button> : undefined}>
            Try a different name or clear a filter.
          </EmptyState>
        ) : (
          <>
            {/* Phones: one card per player */}
            <ul className="divide-y divide-line md:hidden">
              {shown.map((p) => {
                const rating = getPlayerRating(p);
                return (
                  <li key={p.id}>
                    <button onClick={() => setOpenPlayer(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-pitch-2">
                      <PlayerPhoto player={p} className="h-14 w-11 shrink-0 rounded-lg bg-pitch-2" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-semibold text-ink">
                          <span className="truncate">{p.name}</span>
                          {p.isOverseas && <Globe className="h-3.5 w-3.5 shrink-0 text-ipl-blue-bright" aria-label="Overseas" />}
                        </span>
                        <span className="block truncate text-sm text-ink-3">
                          {formatRole(p.role)} · {p.batting.matches} matches
                        </span>
                        <span className="mt-0.5 block text-sm">
                          <Price value={p.basePrice} className="text-sm" />
                        </span>
                      </span>
                      <RatingBadge value={rating.overall} />
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Tablet and up: full table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-night/50 text-ink-3">
                    {['Rating', 'Player', 'Role', 'Country', 'Base price', 'Matches', 'Runs (avg / SR)', 'Wickets (econ)', 'Photo'].map((h) => (
                      <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((p) => {
                    const rating = getPlayerRating(p);
                    return (
                      <tr key={p.id} onClick={() => setOpenPlayer(p)} className="group cursor-pointer transition-colors hover:bg-pitch-2/60">
                        <td className="px-4 py-2.5">
                          <RatingBadge value={rating.overall} />
                        </td>
                        <th scope="row" className="px-4 py-2.5 font-normal">
                          <div className="flex items-center gap-3">
                            <PlayerPhoto player={p} className="h-12 w-10 shrink-0 rounded-lg bg-pitch-2" />
                            <div className="min-w-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenPlayer(p);
                                }}
                                className="inline-flex items-center gap-1 text-left font-semibold text-ink group-hover:text-ipl-orange"
                              >
                                {p.name}
                                <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                              </button>
                              <p className="truncate text-ink-3">{p.previousIPLTeam}</p>
                            </div>
                          </div>
                        </th>
                        <td className="px-4 py-2.5">
                          <p className="text-ink">{formatRole(p.role)}</p>
                          <p className="text-ink-3">{formatCategory(p.category)}</p>
                        </td>
                        <td className="px-4 py-2.5 text-ink-2">
                          <span className="inline-flex items-center gap-1.5">
                            {p.isOverseas && <Globe className="h-3.5 w-3.5 text-ipl-blue-bright" aria-label="Overseas" />}
                            {p.nationality}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Price value={p.basePrice} />
                        </td>
                        <td className="px-4 py-2.5 tabular text-ink-2">{p.batting.matches}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 tabular text-ink-2">
                          <span className="text-ink">{p.batting.runs}</span>
                          {p.batting.runs > 0 && <> ({p.batting.average.toFixed(1)} / {p.batting.strikeRate.toFixed(1)})</>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 tabular text-ink-2">
                          <span className="text-ink">{p.bowling.wickets}</span>
                          {p.bowling.wickets > 0 && <> ({p.bowling.economy.toFixed(2)})</>}
                        </td>
                        <td className="px-4 py-2.5">
                          <SourceBadge source={p.imageSource} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {filtered.length > visible && (
          <div className="flex justify-center border-t border-line p-4">
            <Button onClick={() => setVisible((v) => v + PAGE_SIZE)}>Show more ({filtered.length - visible} left)</Button>
          </div>
        )}
      </Panel>

      <Drawer open={!!openPlayer} onClose={() => setOpenPlayer(null)} title={openPlayer?.name ?? 'Player'}>
        {openPlayer && (
          <motion.div key={openPlayer.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="flex items-end gap-4">
              <PlayerPhoto player={openPlayer} eager className="h-36 w-28 shrink-0 rounded-xl bg-gradient-to-b from-ipl-blue to-pitch object-contain object-bottom" />
              <div className="min-w-0 pb-1">
                <p className="font-display text-sm font-bold uppercase tracking-widest text-ipl-orange">{formatRole(openPlayer.role)}</p>
                <p className="text-sm text-ink-2">
                  {openPlayer.nationality} · {openPlayer.previousIPLTeam}
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  Base <Price value={openPlayer.basePrice} />
                </p>
                <div className="mt-2">
                  <SourceBadge source={openPlayer.imageSource} />
                </div>
              </div>
            </div>
            <PlayerStats player={openPlayer} variant="compact" />
          </motion.div>
        )}
      </Drawer>
    </div>
  );
};
