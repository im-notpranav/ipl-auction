import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Gavel, HelpCircle, ArrowRight, RefreshCw, Play, FileText, Database, Radio, Trophy, Tv, Smartphone, BarChart3, QrCode } from 'lucide-react';
import { ALL_PLAYERS } from '../data/players';
import { FRANCHISES, Franchise, findFranchise } from '../data/franchises';
import { getPlayerRating } from '../services/playerRatings';
import { formatPrice, formatRole } from '../utils/format';
import { Player } from '../types';
import { BrandMark, Button, CountUp, EmptyState, IconButton, Notice, Panel, PlayerPhoto, RatingRing, StatusBadge, TabBar, TextField } from './ui';

export interface PublicRoomItem {
  id: string;
  roomCode?: string;
  name: string;
  status: string;
  auctioneerName: string;
  teamsCount: number;
  soldCount?: number;
  totalSpent?: number;
  createdAt: string;
  completedAt?: string | null;
}

interface DashboardViewProps {
  onOpenCreate: () => void;
  onOpenHowItWorks: () => void;
  onNavigate: (view: string, roomId?: string) => void;
  onJoinRoomDirect: (roomId: string) => void;
  recentRoomId: string | null;
  recentRole: string | null;
}

const EASE = [0.16, 1, 0.3, 1] as const;
const FALLBACK_TEAM: Franchise = { name: 'IPL', short: 'IPL', color: '#4f78e6', logo: '' };

// The headline acts of the pool, hand-picked so the landing page shows faces
// every fan knows. Each is shown in the colours of their last IPL team.
const STAR_NAMES = [
  'Virat Kohli',
  'Rohit Sharma',
  'MS Dhoni',
  'Jasprit Bumrah',
  'Hardik Pandya',
  'Suryakumar Yadav',
  'Rishabh Pant',
  'Ravindra Jadeja',
  'Rashid Khan',
  'Shubman Gill',
  'Pat Cummins',
  'Jos Buttler',
];

interface Star {
  p: Player;
  team: Franchise;
  rating: number;
}

const STARS: Star[] = STAR_NAMES.map((name) => ALL_PLAYERS.find((p) => p.name === name))
  .filter((p): p is Player => !!p)
  .map((p) => ({ p, team: findFranchise(p.previousIPLTeam) ?? FALLBACK_TEAM, rating: getPlayerRating(p).overall }));

// Hero rotation: the eight biggest names.
const HERO_STARS = STARS.slice(0, 8);

const fmtInt = (n: number) => n.toLocaleString('en-IN');

// Two numbers that sum up a player's IPL career, in plain words.
function careerLine(p: Player): Array<{ value: string; label: string }> {
  const runs = { value: fmtInt(p.batting.runs), label: 'runs' };
  const wkts = { value: fmtInt(p.bowling.wickets), label: 'wickets' };
  if (p.role === 'BOWLER') return [wkts, { value: p.bowling.economy.toFixed(2), label: 'economy' }];
  if (p.role === 'ALL_ROUNDER') return [runs, wkts];
  return [runs, { value: p.batting.strikeRate.toFixed(1), label: 'strike rate' }];
}

const STEPS = [
  { icon: Tv, title: 'Put it on the big screen', body: 'Create a room on the laptop driving the TV or projector. It becomes the auction stage.' },
  { icon: Smartphone, title: 'Every team joins by phone', body: 'Owners scan the QR code, pick a franchise and get a bid paddle with their live purse.' },
  { icon: Gavel, title: 'Bid, sell, build the XI', body: 'The clock calls going once, going twice. Squads, ratings and XIs are ready when it ends.' },
];

function Reveal({ children, delay = 0, className, as = 'div' }: { children: React.ReactNode; delay?: number; className?: string; as?: 'div' | 'li' }) {
  const Tag = as === 'li' ? motion.li : motion.div;
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </Tag>
  );
}

/* ── Hero: the star on the block ───────────────────────────────────────────
   One superstar at a time in their team's colours, crest behind them.
   Rotates every few seconds (paused on hover/focus and under reduced motion);
   the thumbnails below jump straight to a player. */
const ROTATE_MS = 4200;

function StarStage() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const star = HERO_STARS[index];

  useEffect(() => {
    if (reduce || paused || HERO_STARS.length < 2) return;
    const t = setTimeout(() => {
      setDir(1);
      setIndex((n) => (n + 1) % HERO_STARS.length);
    }, ROTATE_MS);
    return () => clearTimeout(t);
  }, [index, paused, reduce]);

  if (!star) return null;
  const { p, team, rating } = star;
  const pick = (n: number) => {
    setDir(n > index ? 1 : -1);
    setIndex(n);
  };

  return (
    <div
      className="relative mx-auto w-full max-w-[440px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* Team-colour floodlight behind the card */}
      <motion.div
        className="absolute -inset-8 rounded-[3rem] blur-3xl"
        animate={{ backgroundColor: `${team.color}40` }}
        transition={{ duration: 0.8 }}
        aria-hidden
      />

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-ipl-navy shadow-[0_40px_80px_-30px_rgb(0_0_0/0.85)]">
        {/* Background wash in the team colour, cross-faded per player */}
        <AnimatePresence initial={false}>
          <motion.div
            key={team.short}
            className="absolute inset-0"
            style={{ background: `radial-gradient(110% 80% at 70% 15%, ${team.color}d0, ${team.color}40 45%, transparent 75%), linear-gradient(180deg, #11225f, var(--color-night))` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
            aria-hidden
          />
        </AnimatePresence>

        {/* Giant crest watermark */}
        <AnimatePresence initial={false}>
          {team.logo && (
            <motion.img
              key={team.logo}
              src={team.logo}
              alt=""
              className="pointer-events-none absolute -right-16 top-6 h-80 w-80 object-contain"
              initial={{ opacity: 0, scale: 0.8, rotate: -12 }}
              animate={{ opacity: 0.22, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.8, ease: EASE }}
              aria-hidden
            />
          )}
        </AnimatePresence>

        <span className="absolute left-4 top-4 z-10 -skew-x-12 bg-ipl-orange px-2.5 py-0.5 font-display text-sm font-extrabold uppercase tracking-wider text-night">
          <span className="inline-block skew-x-12">On the block</span>
        </span>
        <div className="absolute right-4 top-4 z-10 rounded-full bg-night/60 p-1 backdrop-blur-sm">
          <RatingRing key={p.id} value={rating} size={60} />
        </div>

        <div className="relative aspect-[4/5]">
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={p.id}
              custom={dir}
              className="absolute inset-0"
              variants={{
                // The outgoing player clears in 0.2s before the next one lands, so two faces never overlap.
                enter: (d: number) => ({ opacity: 0, x: d * 80, scale: 0.94 }),
                center: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 170, damping: 24, delay: 0.12 } },
                exit: (d: number) => ({ opacity: 0, x: d * -60, scale: 0.96, transition: { duration: 0.2, ease: 'easeIn' } }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <PlayerPhoto player={p} eager className="h-full w-full object-contain object-bottom drop-shadow-[0_24px_30px_rgb(0_0_0/0.55)]" />
            </motion.div>
          </AnimatePresence>
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-night via-night/70 to-transparent" aria-hidden />
        </div>

        <div className="relative -mt-24 px-5 pb-5">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }} transition={{ duration: 0.35, ease: EASE }}>
              <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-ink-2">
                {team.logo && <img src={team.logo} alt="" className="h-6 w-6 object-contain" />}
                {team.name}
              </p>
              <p className="mt-1 pb-1 font-display text-4xl font-extrabold uppercase italic leading-[1.05] tracking-tight text-ink sm:text-5xl">{p.name}</p>
              <dl className="mt-2 flex items-end gap-6">
                {careerLine(p).map((s) => (
                  <div key={s.label}>
                    <dd className="font-display text-2xl font-extrabold leading-none tabular text-ipl-gold">{s.value}</dd>
                    <dt className="mt-1 text-xs uppercase tracking-wider text-ink-3">IPL {s.label}</dt>
                  </div>
                ))}
                <div className="ml-auto text-right">
                  <dd className="font-display text-2xl font-extrabold leading-none tabular text-ink">{formatPrice(p.basePrice)}</dd>
                  <dt className="mt-1 text-xs uppercase tracking-wider text-ink-3">Base price</dt>
                </div>
              </dl>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Thumbnail rail: jump to any star; the active one shows time to the next */}
      <div className="relative mx-auto mt-5 grid max-w-[440px] grid-cols-8 gap-1.5 sm:gap-2.5" role="group" aria-label="Choose a featured player">
        {HERO_STARS.map((s, n) => {
          const active = n === index;
          return (
            <button
              key={s.p.id}
              type="button"
              onClick={() => pick(n)}
              aria-label={`Show ${s.p.name}`}
              aria-pressed={active}
              className="group relative aspect-square w-full max-w-12 justify-self-center overflow-hidden rounded-full border-2 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 active:scale-95"
              style={{ borderColor: active ? s.team.color : 'rgb(255 255 255 / 0.12)', background: `linear-gradient(160deg, ${s.team.color}90, #0b1433 70%)` }}
            >
              <img src={s.p.imageUrl} alt="" loading="lazy" className={`h-full w-full scale-[1.6] object-cover object-[50%_18%] transition-opacity ${active ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`} />
              {active && !reduce && !paused && (
                <motion.span
                  key={`${index}-progress`}
                  className="absolute inset-x-0 bottom-0 h-1 origin-left"
                  style={{ backgroundColor: s.team.color }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: ROTATE_MS / 1000, ease: 'linear' }}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Franchise crests ───────────────────────────────────────────────────── */
function CrestWall() {
  return (
    <section aria-labelledby="franchises-title" className="border-b border-line bg-night">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h2 id="franchises-title" className="text-center font-display text-lg font-bold uppercase tracking-[0.25em] text-ink-2">
          Bid as any of the ten franchises
        </h2>
        <ul className="mt-6 grid grid-cols-5 gap-3 sm:gap-4 lg:grid-cols-10">
          {FRANCHISES.map((f, i) => (
            <motion.li
              key={f.short}
              initial={{ opacity: 0, y: 16, scale: 0.9 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ type: 'spring', stiffness: 260, damping: 20, delay: i * 0.04 }}
              className="flex justify-center"
            >
              <div className="group relative flex flex-col items-center" title={f.name}>
                <span
                  className="absolute top-1 h-12 w-12 rounded-full opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-80 sm:h-16 sm:w-16"
                  style={{ backgroundColor: f.color }}
                  aria-hidden
                />
                <img
                  src={f.logo}
                  alt={f.name}
                  loading="lazy"
                  className="relative h-14 w-14 object-contain transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-110 sm:h-20 sm:w-20"
                />
                <span className="mt-1.5 font-display text-sm font-bold tracking-wider text-ink-3 transition-colors group-hover:text-ink">{f.short}</span>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ── Star bento ─────────────────────────────────────────────────────────────
   12 players, 16 cells: Kohli 2x2, Rohit 1x2, then singles. Exact on 2 and 4 columns. */
const TILE_SPAN = ['col-span-2 row-span-2', 'row-span-2'];

function StarTile({ star, big }: { star: Star; big: boolean }) {
  const { p, team, rating } = star;
  const [lead] = careerLine(p);
  return (
    <div
      className="group relative h-full overflow-hidden rounded-2xl border border-white/10"
      style={{ background: `radial-gradient(120% 90% at 85% 5%, ${team.color}c0, ${team.color}30 45%, transparent 75%), linear-gradient(180deg, #10205a, var(--color-night))` }}
    >
      {team.logo && (
        <img
          src={team.logo}
          alt=""
          loading="lazy"
          className={`pointer-events-none absolute object-contain opacity-15 transition-transform duration-700 ease-out group-hover:rotate-6 group-hover:scale-110 ${big ? '-left-10 -top-10 h-72 w-72' : '-left-4 -top-4 h-28 w-28'}`}
          aria-hidden
        />
      )}
      <PlayerPhoto
        player={p}
        className={`absolute bottom-0 right-0 h-full object-contain object-bottom drop-shadow-[0_18px_24px_rgb(0_0_0/0.5)] transition-transform duration-500 ease-out group-hover:scale-[1.04] ${big ? 'w-[78%]' : 'w-full'}`}
      />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-night via-night/60 to-transparent" aria-hidden />
      <div className="absolute right-2.5 top-2.5 rounded-full bg-night/60 backdrop-blur-sm">
        <RatingRing value={rating} size={big ? 64 : 44} label={big ? 'Rating' : ''} />
      </div>
      <div className={`absolute inset-x-0 bottom-0 ${big ? 'p-6' : 'p-3.5'}`}>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-2">
          {team.logo && <img src={team.logo} alt="" loading="lazy" className={big ? 'h-6 w-6 object-contain' : 'h-4 w-4 object-contain'} />}
          {team.short}
          <span className="text-ink-3">{formatRole(p.role)}</span>
        </p>
        <p className={`mt-1 pb-0.5 font-display font-extrabold uppercase italic leading-[1.05] tracking-tight text-ink ${big ? 'text-5xl sm:text-6xl' : 'text-xl sm:text-2xl'}`}>{p.name}</p>
        {big ? (
          <dl className="mt-3 flex gap-8">
            {careerLine(p).map((s) => (
              <div key={s.label}>
                <dd className="font-display text-3xl font-extrabold leading-none tabular text-ipl-gold">{s.value}</dd>
                <dt className="mt-1 text-xs uppercase tracking-wider text-ink-3">IPL {s.label}</dt>
              </div>
            ))}
            <div>
              <dd className="font-display text-3xl font-extrabold leading-none tabular text-ink">{p.batting.matches}</dd>
              <dt className="mt-1 text-xs uppercase tracking-wider text-ink-3">matches</dt>
            </div>
          </dl>
        ) : (
          <p className="mt-0.5 text-sm tabular text-ink-2">
            <span className="font-display text-base font-bold text-ipl-gold">{lead.value}</span> IPL {lead.label}
          </p>
        )}
      </div>
    </div>
  );
}

function StarBento({ onBrowse }: { onBrowse: () => void }) {
  return (
    <section aria-labelledby="stars-title">
      <Reveal>
        <h2 id="stars-title" className="pb-1 font-display text-4xl font-extrabold uppercase italic leading-[1.05] tracking-tight text-ink sm:text-5xl">
          The names everyone <span className="text-ipl-orange">bids for</span>
        </h2>
        <p className="mt-3 max-w-[60ch] text-ink-2">Every player comes with real IPL career numbers and a rating built from them.</p>
        <Button variant="secondary" className="mt-5" icon={<Database className="h-4 w-4" />} onClick={onBrowse}>
          Browse all {ALL_PLAYERS.length} players
        </Button>
      </Reveal>
      <ul className="mt-8 grid auto-rows-[200px] grid-cols-2 gap-3 sm:auto-rows-[230px] sm:gap-4 md:grid-cols-4">
        {STARS.map((star, i) => (
          <motion.li
            key={star.p.id}
            className={TILE_SPAN[i] ?? ''}
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, delay: Math.min(i, 6) * 0.05, ease: EASE }}
          >
            <StarTile star={star} big={i === 0} />
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenCreate, onOpenHowItWorks, onNavigate, onJoinRoomDirect, recentRoomId, recentRole }) => {
  const [rooms, setRooms] = useState<PublicRoomItem[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [tab, setTab] = useState<'live' | 'finished'>('live');

  const fetchRooms = useCallback(() => {
    setLoadState('loading');
    fetch('/api/rooms')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setRooms(Array.isArray(data) ? data : []);
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  }, []);

  useEffect(fetchRooms, [fetchRooms]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim();
    if (!code) {
      setJoinError('Enter the room code shown on the auctioneer screen.');
      return;
    }
    onJoinRoomDirect(code);
  };

  const liveRooms = rooms.filter((r) => r.status !== 'COMPLETED');
  const finishedRooms = rooms.filter((r) => r.status === 'COMPLETED');
  const recentRoom = rooms.find((r) => r.id === recentRoomId);
  const canResume = recentRoom && recentRoom.status !== 'COMPLETED';
  const shownRooms = tab === 'live' ? liveRooms : finishedRooms;

  const poolStats = useMemo(
    () => [
      { value: ALL_PLAYERS.length, label: 'players in the pool' },
      { value: ALL_PLAYERS.filter((p) => p.category === 'MARQUEE').length, label: 'marquee names' },
      { value: ALL_PLAYERS.filter((p) => p.isOverseas).length, label: 'overseas stars' },
      { value: FRANCHISES.length, label: 'franchises' },
    ],
    [],
  );

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="stadium relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="absolute -top-40 left-[12%] h-[140%] w-40 origin-top animate-beam bg-gradient-to-b from-white/25 via-white/5 to-transparent blur-2xl" />
          <div className="absolute -top-40 right-[18%] h-[140%] w-52 origin-top animate-beam bg-gradient-to-b from-[#9fb8ff]/25 via-white/5 to-transparent blur-2xl [animation-delay:-4s]" />
        </div>

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-28 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pb-32 lg:pt-14">
          <div className="min-w-0">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="flex items-center gap-4">
              <BrandMark className="h-16 w-[58px] shrink-0 drop-shadow-[0_10px_24px_rgb(243_111_33/0.35)] sm:h-20 sm:w-[72px]" />
              <div className="leading-none">
                <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-ipl-gold">Fan-made IPL auction room</p>
                <p className="mt-2 font-display text-2xl font-extrabold uppercase italic tracking-wide text-ink sm:text-3xl">
                  Auction <span className="text-ipl-orange">Arena</span>
                </p>
              </div>
            </motion.div>

            {/* The two lines land one after the other, like a broadcast title card. */}
            <h1 className="mt-8 pb-2 font-display text-6xl font-extrabold uppercase italic leading-[0.95] tracking-tight text-ink sm:text-7xl xl:text-8xl">
              <motion.span className="block" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 170, damping: 24, delay: 0.08 }}>
                Your league.
              </motion.span>
              <motion.span className="block" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 170, damping: 24, delay: 0.2 }}>
                <span className="bg-gradient-to-r from-ipl-orange to-ipl-gold bg-clip-text pr-2 text-transparent">Your auction.</span>
              </motion.span>
            </h1>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3, ease: EASE }} className="mt-5 max-w-lg text-lg leading-relaxed text-ink-2">
              Kohli, Rohit, Dhoni and {ALL_PLAYERS.length - 3} more under the hammer. The auction runs on the big screen, every team bids from a phone.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.38, ease: EASE }} className="mt-8 flex flex-wrap gap-3">
              <Button variant="primary" size="lg" icon={<Gavel className="h-5 w-5" />} onClick={onOpenCreate}>
                Create auction
              </Button>
              <Button variant="secondary" size="lg" icon={<HelpCircle className="h-5 w-5" />} onClick={onOpenHowItWorks}>
                How it works
              </Button>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 40, rotate: 2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.9, delay: 0.15, ease: EASE }}>
            <StarStage />
          </motion.div>
        </div>

        {/* The crest's arc, stretched across the bottom edge */}
        <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-16 w-full sm:h-24" aria-hidden>
          <defs>
            <linearGradient id="edge-arc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#f36f21" />
              <stop offset="1" stopColor="#f2c14e" />
            </linearGradient>
          </defs>
          <path d="M0 120V92C380 20 900 0 1440 44v8C900 16 400 40 0 120Z" fill="url(#edge-arc)" />
          <path d="M0 120C400 40 900 16 1440 52v68Z" fill="var(--color-night)" />
        </svg>
      </section>

      <CrestWall />

      <div className="mx-auto max-w-7xl space-y-20 px-4 pb-16 pt-12 sm:px-6">
        {canResume && recentRoom && (
          <Reveal>
            <Panel className="flex flex-col gap-4 border-ipl-orange/40 bg-gradient-to-r from-ipl-orange/10 to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Radio className="h-6 w-6 shrink-0 text-ipl-orange" aria-hidden />
                <div>
                  <p className="font-display text-xl font-bold uppercase tracking-wide text-ink">{recentRoom.name}</p>
                  <p className="text-sm text-ink-2">You're in this auction as {recentRole === 'AUCTIONEER' ? 'the auctioneer' : 'a team owner'}.</p>
                </div>
              </div>
              <Button variant="primary" icon={<Play className="h-4 w-4" />} onClick={() => onNavigate(recentRole === 'AUCTIONEER' ? 'auctioneer' : 'room', recentRoom.id)}>
                Resume
              </Button>
            </Panel>
          </Reveal>
        )}

        {/* ── Join + rooms ──────────────────────────────────────────────── */}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Reveal>
            <Panel className="relative flex h-full flex-col overflow-hidden p-6">
              <div className="absolute inset-x-0 top-0 h-1 stripe-ipl" aria-hidden />
              <h2 className="font-display text-3xl font-extrabold uppercase italic tracking-wide text-ink">Join an auction</h2>
              <p className="mt-1 text-sm text-ink-2">Got a room code from the auctioneer? Enter it to register your team.</p>
              <form onSubmit={handleJoin} className="mt-5 flex flex-col gap-3" noValidate>
                <TextField
                  label="Room code"
                  placeholder="e.g. AX72K9"
                  value={joinCode}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => {
                    setJoinCode(e.target.value.toUpperCase());
                    setJoinError('');
                  }}
                  error={joinError}
                  className="h-14 font-display text-2xl font-bold tracking-[0.25em]"
                />
                <Button type="submit" variant="primary" size="lg" fullWidth icon={<ArrowRight className="h-5 w-5" />}>
                  Join room
                </Button>
              </form>
              {/* Anchors the panel's lower half when it stretches to match the rooms list. */}
              <div className="min-h-6 flex-1" aria-hidden />
              <p className="flex items-start gap-3 border-t border-line pt-5 text-sm text-ink-3">
                <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-ipl-gold" aria-hidden />
                On a phone? Scan the QR code on the auctioneer's big screen and you land straight on team registration.
              </p>
            </Panel>
          </Reveal>

          <Reveal delay={0.08}>
            <Panel className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                <TabBar
                  label="Auctions"
                  value={tab}
                  onChange={setTab}
                  tabs={[
                    { key: 'live', label: `Live (${liveRooms.length})` },
                    { key: 'finished', label: `Finished (${finishedRooms.length})` },
                  ]}
                />
                <IconButton label="Refresh auctions" onClick={fetchRooms}>
                  <RefreshCw className={`h-4 w-4 ${loadState === 'loading' ? 'animate-spin' : ''}`} />
                </IconButton>
              </div>

              <div className="max-h-[420px] flex-1 overflow-y-auto">
                {loadState === 'loading' && rooms.length === 0 ? (
                  <ul className="divide-y divide-line" aria-busy>
                    {[0, 1, 2].map((i) => (
                      <li key={i} className="flex items-center gap-4 px-5 py-4">
                        <div className="space-y-2">
                          <div className="h-4 w-44 animate-pulse rounded bg-pitch-3" />
                          <div className="h-3 w-28 animate-pulse rounded bg-pitch-3" />
                        </div>
                        <div className="ml-auto h-9 w-20 animate-pulse rounded-xl bg-pitch-3" />
                      </li>
                    ))}
                  </ul>
                ) : loadState === 'error' ? (
                  <div className="p-5">
                    <Notice tone="error">
                      Couldn't load auctions. Check the server is running, then{' '}
                      <button onClick={fetchRooms} className="font-semibold underline">
                        try again
                      </button>
                      .
                    </Notice>
                  </div>
                ) : shownRooms.length === 0 ? (
                  tab === 'live' ? (
                    <EmptyState icon={<Gavel className="h-8 w-8" />} title="No live auctions" action={<Button variant="primary" onClick={onOpenCreate}>Create auction</Button>}>
                      Start one and share the code with your group.
                    </EmptyState>
                  ) : (
                    <EmptyState icon={<Trophy className="h-8 w-8" />} title="No finished auctions yet">
                      Ended auctions keep their squads, analysis and PDF report here.
                    </EmptyState>
                  )
                ) : (
                  <ul className="divide-y divide-line">
                    {shownRooms.map((room, i) => (
                      <motion.li
                        key={room.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.3 }}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-pitch-2/50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-display text-lg font-bold uppercase tracking-wide text-ink">{room.name}</span>
                            <StatusBadge status={room.status} />
                          </div>
                          <p className="mt-0.5 text-sm text-ink-3">
                            <span className="font-display font-bold tracking-widest text-ink-2">{room.roomCode || room.id}</span>
                            {', '}
                            {room.auctioneerName}, {room.teamsCount} {room.teamsCount === 1 ? 'team' : 'teams'}
                            {tab === 'finished' && room.totalSpent !== undefined && <>, {formatPrice(room.totalSpent)} spent</>}
                          </p>
                        </div>
                        {tab === 'live' ? (
                          <Button size="sm" variant="secondary" icon={<ArrowRight className="h-4 w-4" />} onClick={() => onJoinRoomDirect(room.roomCode || room.id)}>
                            Open
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" icon={<FileText className="h-4 w-4" />} onClick={() => onNavigate('results', room.id)}>
                            Results
                          </Button>
                        )}
                      </motion.li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          </Reveal>
        </section>

        {/* ── Star players ──────────────────────────────────────────────── */}
        <StarBento onBrowse={() => onNavigate('data-health')} />

        {/* ── Pool numbers ──────────────────────────────────────────────── */}
        <Reveal>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-8 rounded-3xl border border-line bg-gradient-to-br from-ipl-blue/40 via-pitch to-night px-6 py-8 sm:px-10 md:grid-cols-4">
            {poolStats.map((s) => (
              <div key={s.label}>
                <dd className="font-display text-5xl font-extrabold leading-none tabular text-ink sm:text-6xl">
                  <CountUp value={s.value} duration={1.4} />
                </dd>
                <dt className="mt-2 text-sm uppercase tracking-wider text-ink-3">{s.label}</dt>
              </div>
            ))}
          </dl>
        </Reveal>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section aria-labelledby="how-title">
          <Reveal>
            <h2 id="how-title" className="pb-1 font-display text-4xl font-extrabold uppercase italic leading-[1.05] tracking-tight text-ink sm:text-5xl">
              Three moves to a full squad
            </h2>
          </Reveal>
          <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-0">
            {STEPS.map((step, i) => (
              <Reveal as="li" key={step.title} delay={i * 0.1} className="md:pr-10">
                <div>
                  <div className="flex items-center gap-4">
                    <span className="font-display text-6xl font-extrabold italic leading-none text-transparent [-webkit-text-stroke:1.5px_var(--color-ipl-orange)]">{i + 1}</span>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line-strong bg-pitch-2 text-ipl-gold">
                      <step.icon className="h-6 w-6" aria-hidden />
                    </span>
                    {i < STEPS.length - 1 && <span className="hidden h-px flex-1 bg-gradient-to-r from-line-strong to-transparent md:block" aria-hidden />}
                  </div>
                  <h3 className="mt-5 font-display text-2xl font-bold uppercase tracking-wide text-ink">{step.title}</h3>
                  <p className="mt-2 max-w-sm text-ink-2">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </section>

        <footer className="flex flex-col items-start justify-between gap-3 border-t border-line pt-6 text-sm text-ink-3 sm:flex-row sm:items-center">
          <span className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 shrink-0" aria-hidden /> Stats: IPL career records. Photos and crests: iplt20.com and Wikipedia.
          </span>
          <span>Fan-made. Not affiliated with the IPL or BCCI.</span>
        </footer>
      </div>
    </div>
  );
};
