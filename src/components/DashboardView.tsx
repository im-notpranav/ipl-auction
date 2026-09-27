import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Gavel, HelpCircle, ArrowRight, RefreshCw, Play, FileText, Database, Radio, Trophy, Tv, Smartphone, BarChart3, Globe, QrCode } from 'lucide-react';
import { ALL_PLAYERS } from '../data/players';
import { FRANCHISES } from '../data/franchises';
import { getPlayerRating } from '../services/playerRatings';
import { formatPrice, formatRole } from '../utils/format';
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

// Highest-rated players that have an official IPL headshot, for the hero card and showcase.
const FEATURED = ALL_PLAYERS.filter((p) => p.imageSource === 'IPL')
  .map((p) => ({ p, r: getPlayerRating(p) }))
  .filter(({ r }) => r.confidence === 'HIGH')
  .sort((a, b) => b.r.overall - a.r.overall);

const STEPS = [
  { icon: Tv, title: 'Put it on the big screen', body: 'Create a room on the laptop driving the TV or projector. It becomes the auction stage.' },
  { icon: Smartphone, title: 'Every team joins by phone', body: 'Owners scan the QR code, pick a franchise and get a bid paddle with their live purse.' },
  { icon: Gavel, title: 'Bid, sell, build the XI', body: 'You call sold or unsold. Squads, ratings and the best XI are ready the moment it ends.' },
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

// Rotating "on the block" card in the hero.
function OnTheBlock() {
  const pool = FEATURED.slice(0, 8);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (pool.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % pool.length), 3800);
    return () => clearInterval(t);
  }, [pool.length]);
  const item = pool[i];
  if (!item) return null;
  const { p, r } = item;

  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <div className="absolute -inset-6 rounded-[2rem] bg-ipl-orange/15 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#2a54c4] via-ipl-blue to-ipl-navy shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)]">
        {/* The crest's arc, behind the player */}
        <svg viewBox="0 0 400 500" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="hero-arc" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#f36f21" />
              <stop offset="1" stopColor="#f2c14e" />
            </linearGradient>
          </defs>
          <path d="M-20 400C90 300 240 250 420 270v36C250 290 110 330 10 470Z" fill="url(#hero-arc)" opacity="0.9" />
        </svg>
        <span className="absolute left-4 top-4 z-10 -skew-x-12 bg-ipl-orange px-2.5 py-0.5 font-display text-sm font-extrabold uppercase tracking-wider text-night">
          <span className="inline-block skew-x-12">On the block</span>
        </span>
        <div className="absolute right-4 top-4 z-10 rounded-full bg-night/60 p-1 backdrop-blur-sm">
          <RatingRing key={p.id} value={r.overall} size={64} />
        </div>

        <div className="relative aspect-[4/5]">
          <AnimatePresence initial={false}>
            <motion.div
              key={p.id}
              className="absolute inset-0"
              initial={{ opacity: 0, x: 60, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -60, scale: 0.96 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <PlayerPhoto player={p} eager className="h-full w-full object-contain object-bottom drop-shadow-[0_24px_30px_rgb(0_0_0/0.55)]" />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="relative border-t border-white/10 bg-night/85 px-5 py-4 backdrop-blur-md">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <p className="font-display text-3xl font-extrabold uppercase italic leading-none tracking-tight text-ink">{p.name}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-2">
                {p.isOverseas && <Globe className="h-3.5 w-3.5 text-ipl-blue-bright" aria-hidden />}
                {formatRole(p.role)} · {p.batting.matches} IPL matches · Base <span className="font-display font-bold text-ipl-gold">{formatPrice(p.basePrice)}</span>
              </p>
            </motion.div>
          </AnimatePresence>
          <div className="mt-3 flex gap-1.5" aria-hidden>
            {pool.map((x, n) => (
              <span key={x.p.id} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${n === i ? 'bg-ipl-orange' : 'bg-white/15'}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
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
      { value: ALL_PLAYERS.length, label: 'Players in the pool' },
      { value: ALL_PLAYERS.filter((p) => p.category === 'MARQUEE').length, label: 'Marquee names' },
      { value: ALL_PLAYERS.filter((p) => p.isOverseas).length, label: 'Overseas players' },
      { value: FRANCHISES.length, label: 'Franchise colours' },
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

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-28 pt-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-36 lg:pt-16">
          <div>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="flex items-center gap-4">
              <BrandMark className="h-20 w-[72px] shrink-0 drop-shadow-[0_10px_24px_rgb(243_111_33/0.35)] sm:h-24 sm:w-[86px]" />
              <div className="leading-none">
                <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-ipl-gold">Fan-made IPL auction room</p>
                <p className="mt-2 font-display text-2xl font-extrabold uppercase italic tracking-wide text-ink sm:text-3xl">
                  Auction <span className="text-ipl-orange">Arena</span>
                </p>
              </div>
            </motion.div>

            {/* The two lines land one after the other, like a broadcast title card. */}
            <h1 className="mt-8 pb-2 font-display text-6xl font-extrabold uppercase italic leading-[0.95] tracking-tight text-ink sm:text-7xl xl:text-8xl">
              <motion.span
                className="block"
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 170, damping: 24, delay: 0.08 }}
              >
                Your league.
              </motion.span>
              <motion.span
                className="block"
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 170, damping: 24, delay: 0.2 }}
              >
                <span className="bg-gradient-to-r from-ipl-orange to-ipl-gold bg-clip-text pr-2 text-transparent">Your auction.</span>
              </motion.span>
            </h1>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3, ease: EASE }} className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
              The auction on the big screen, a bid paddle on every phone, and purses that update the instant the hammer falls. Every player carries real IPL career numbers.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.38, ease: EASE }} className="mt-8 flex flex-wrap gap-3">
              <Button variant="primary" size="lg" icon={<Gavel className="h-5 w-5" />} onClick={onOpenCreate}>
                Create auction
              </Button>
              <Button variant="secondary" size="lg" icon={<HelpCircle className="h-5 w-5" />} onClick={onOpenHowItWorks}>
                How it works
              </Button>
            </motion.div>

            <dl className="mt-12 grid max-w-xl grid-cols-2 gap-x-6 gap-y-5 border-t border-white/10 pt-6 sm:grid-cols-4">
              {poolStats.map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.46 + i * 0.07, duration: 0.5, ease: EASE }}>
                  <dd className="font-display text-4xl font-extrabold tabular text-ink">
                    <CountUp value={s.value} duration={1.4} />
                  </dd>
                  <dt className="text-sm text-ink-3">{s.label}</dt>
                </motion.div>
              ))}
            </dl>
          </div>

          <motion.div initial={{ opacity: 0, y: 40, rotate: 2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.9, delay: 0.15, ease: EASE }}>
            <OnTheBlock />
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

      {/* ── Franchise ticker ─────────────────────────────────────────────── */}
      <div className="overflow-hidden border-b border-line bg-night py-3">
        <p className="sr-only">Pick any of the ten IPL franchise colours for your team.</p>
        <div className="flex w-max animate-ticker gap-10 pr-10" aria-hidden>
          {[...FRANCHISES, ...FRANCHISES].map((f, i) => (
            <span key={`${f.short}-${i}`} className="flex items-center gap-2.5 whitespace-nowrap font-display text-lg font-bold uppercase tracking-wider text-ink-2">
              <span className="h-3 w-3 rotate-45 rounded-[3px]" style={{ backgroundColor: f.color }} />
              {f.name}
            </span>
          ))}
        </div>
      </div>

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
                            {' · '}
                            {room.auctioneerName} · {room.teamsCount} {room.teamsCount === 1 ? 'team' : 'teams'}
                            {tab === 'finished' && room.totalSpent !== undefined && <> · {formatPrice(room.totalSpent)} spent</>}
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

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section>
          <Reveal>
            <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-ipl-orange">Auction night</p>
            <h2 className="mt-2 font-display text-4xl font-extrabold uppercase italic tracking-tight text-ink sm:text-5xl">Three moves to a full squad</h2>
          </Reveal>
          <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-0">
            {STEPS.map((step, i) => (
              <Reveal as="li" key={step.title} delay={i * 0.1} className="md:pr-10">
                <div>
                  <div className="flex items-center gap-4">
                    <span className="font-display text-6xl font-extrabold italic leading-none text-transparent [-webkit-text-stroke:1.5px_var(--color-ipl-orange)]">0{i + 1}</span>
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

        {/* ── Top-rated showcase ────────────────────────────────────────── */}
        <section>
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-ipl-orange">Rated on real IPL numbers</p>
              <h2 className="mt-2 font-display text-4xl font-extrabold uppercase italic tracking-tight text-ink sm:text-5xl">Top of the pool</h2>
              <p className="mt-2 max-w-2xl text-ink-2">Batting Index and Combined Bowling Rate from IPL careers, adjusted so a short hot streak can't outrank a long record.</p>
            </div>
            <Button variant="secondary" icon={<Database className="h-4 w-4" />} onClick={() => onNavigate('data-health')}>
              Browse all {ALL_PLAYERS.length} players
            </Button>
          </Reveal>
          <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {FEATURED.slice(0, 6).map(({ p, r }, i) => (
              <Reveal as="li" key={p.id} delay={i * 0.06}>
                <div className="group relative overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-ipl-blue/70 via-pitch-2 to-pitch">
                  <div className="absolute right-2 top-2 z-10 rounded-full bg-night/60">
                    <RatingRing value={r.overall} size={48} label="" />
                  </div>
                  <PlayerPhoto player={p} className="aspect-[4/5] w-full object-contain object-bottom transition-transform duration-500 group-hover:scale-[1.04]" />
                  <div className="border-t border-line bg-night/80 px-3 py-2.5">
                    <p className="truncate font-display text-lg font-bold uppercase leading-tight text-ink">{p.name}</p>
                    <p className="text-xs text-ink-3">{formatRole(p.role)}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ul>
        </section>

        <footer className="flex flex-col items-start justify-between gap-3 border-t border-line pt-6 text-sm text-ink-3 sm:flex-row sm:items-center">
          <span className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 shrink-0" aria-hidden /> Stats: IPL career records. Photos: iplt20.com squads and Wikipedia.
          </span>
          <span>Fan-made. Not affiliated with the IPL or BCCI.</span>
        </footer>
      </div>
    </div>
  );
};
