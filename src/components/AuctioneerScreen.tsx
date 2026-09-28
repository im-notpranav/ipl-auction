import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { celebrate } from '../utils/celebrate';
import { AnimatePresence, motion } from 'motion/react';
import { Play, Pause, Gavel, XCircle, SkipForward, StopCircle, Users, Globe, Copy, Check, Share2, Eye, UserX, Plus, Undo2, Zap, Trophy, Keyboard } from 'lucide-react';
import { AuctionRoomState, AuctionSettings } from '../types';
import { formatCategory, formatPrice, formatRole } from '../utils/format';
import { Button, CountUp, DeltaPop, Drawer, EmptyState, Modal, Notice, Panel, PlayerPhoto, Price, StatusBadge, TeamLogo, TeamTag, Toast } from './ui';
import { PlayerStats } from './PlayerStats';
import { LotWipe } from './LotWipe';
import { BidClock } from './live/BidClock';
import { NextPlayerBeat } from './live/NextPlayerBeat';
import { PurseTicker } from './live/PurseTicker';
import { TimerSettings } from './live/TimerSettings';

interface AuctioneerScreenProps {
  roomState: AuctionRoomState;
  // True only on the device that created the room; everyone else gets a view-only screen.
  canControl: boolean;
  lastError: string | null;
  serverOffsetMs: number;
  onStartAuction: () => void;
  onPauseAuction: () => void;
  onResumeAuction: () => void;
  onSellPlayer: () => void;
  onMarkUnsold: () => void;
  onNextPlayer: () => void;
  onEndAuction: () => void;
  onKickParticipant: (participantId: string) => void;
  onExtendTimer: (seconds: number) => void;
  onUpdateSettings: (patch: Partial<Pick<AuctionSettings, 'bidTimerSeconds' | 'autoAdvance' | 'autoAdvanceDelaySeconds'>>) => void;
  onUndoLastSale: () => void;
}

const MAX_TEAMS = 10;
const SPLASH_MS = 3200;

const SHORTCUTS: [string, string][] = [
  ['S', 'Sold'],
  ['U', 'Unsold'],
  ['N', 'Next'],
  ['P', 'Pause'],
  ['T', '+10s'],
];

export const AuctioneerScreen: React.FC<AuctioneerScreenProps> = ({
  roomState,
  canControl,
  lastError,
  serverOffsetMs,
  onStartAuction,
  onPauseAuction,
  onResumeAuction,
  onSellPlayer,
  onMarkUnsold,
  onNextPlayer,
  onEndAuction,
  onKickParticipant,
  onExtendTimer,
  onUpdateSettings,
  onUndoLastSale,
}) => {
  const {
    id,
    roomCode,
    name,
    status,
    currentPlayer,
    currentBid,
    currentBidVersion,
    currentHighestBidderTeamId,
    teams,
    participants,
    recentBids,
    currentAuctionIndex,
    totalPlayersInPool,
    lastSoldEvent,
    lastUnsoldEvent,
    settings,
    soldPlayers,
  } = roomState;

  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [kickCandidate, setKickCandidate] = useState<string | null>(null);
  const [showTeams, setShowTeams] = useState(false);
  const [splash, setSplash] = useState<'SOLD' | 'UNSOLD' | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const timerSeconds = settings.bidTimerSeconds ?? 0;
  const autoAdvance = !!settings.autoAdvance;
  const advanceDelay = settings.autoAdvanceDelaySeconds ?? 5;
  const displayCode = roomCode || id;
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/${displayCode}` : '';
  const teamList = Object.values(teams);
  const leadingTeam = currentHighestBidderTeamId ? teams[currentHighestBidderTeamId] : null;
  const lotBids = currentPlayer ? recentBids.filter((b) => b.playerId === currentPlayer.id) : [];
  const inLobby = status === 'LOBBY' || status === 'READY';
  const canSell = status === 'BIDDING' && !!currentPlayer && !!currentHighestBidderTeamId;
  const canMarkUnsold = status === 'BIDDING' && !!currentPlayer;
  const canAdvance = status === 'SOLD' || status === 'UNSOLD';
  const canExtend = timerSeconds > 0 && (status === 'BIDDING' || status === 'PAUSED');
  const overlayOpen = showEndConfirm || showTeams || !!kickCandidate || showUndoConfirm;

  // Most expensive sale so far, and whether the latest sale just set it.
  const { record, isNewRecord } = useMemo(() => {
    const sales = Object.values(soldPlayers || {});
    const top = sales.reduce<(typeof sales)[number] | null>((best, s) => (!best || s.soldPrice > best.soldPrice ? s : best), null);
    const others = lastSoldEvent ? sales.filter((s) => s.playerId !== lastSoldEvent.player.id) : sales;
    const newRecord = !!lastSoldEvent && others.length > 0 && others.every((s) => lastSoldEvent.price > s.soldPrice);
    return { record: top, isNewRecord: newRecord };
  }, [soldPlayers, lastSoldEvent]);

  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, { width: 320, margin: 1, color: { dark: '#060b1c', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [joinUrl]);

  // Sold / unsold moments: a full-screen beat, kept shorter than the auto-advance
  // pause so it never sits on top of the next lot's wipe.
  const splashMs = autoAdvance ? Math.max(1600, Math.min(SPLASH_MS, advanceDelay * 1000 - 900)) : SPLASH_MS;
  useEffect(() => {
    if (status === 'SOLD' && lastSoldEvent) {
      setSplash('SOLD');
      celebrate([{ particleCount: 160, spread: 90, origin: { y: 0.6 }, colors: ['#f36f21', '#f2c14e', '#ffffff', lastSoldEvent.team.color || '#4f78e6'] }]);
    } else if (status === 'UNSOLD' && lastUnsoldEvent) {
      setSplash('UNSOLD');
    } else {
      setSplash(null);
      return;
    }
    const timer = setTimeout(() => setSplash(null), splashMs);
    return () => clearTimeout(timer);
    // splashMs is read when the moment starts; changing settings mid-splash shouldn't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, lastSoldEvent, lastUnsoldEvent]);

  // Keyboard control for the auctioneer.
  useEffect(() => {
    if (!canControl || overlayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest('input, textarea, select, [role="dialog"]')) return;
      const key = e.key.toLowerCase();
      if (key === 's' && canSell) onSellPlayer();
      else if (key === 'u' && canMarkUnsold) onMarkUnsold();
      else if (key === 'n' && canAdvance) onNextPlayer();
      else if (key === 'p' && status === 'BIDDING') onPauseAuction();
      else if (key === 'p' && status === 'PAUSED') onResumeAuction();
      else if (key === 't' && canExtend) onExtendTimer(10);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canControl, overlayOpen, canSell, canMarkUnsold, canAdvance, canExtend, status, onSellPlayer, onMarkUnsold, onNextPlayer, onPauseAuction, onResumeAuction, onExtendTimer]);

  const copy = (what: 'code' | 'link') => {
    navigator.clipboard?.writeText(what === 'code' ? displayCode : joinUrl).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const share = () => {
    if (navigator.share) {
      navigator.share({ title: name, text: `Join the IPL auction "${name}". Room code ${displayCode}`, url: joinUrl }).catch(() => {});
    } else {
      copy('link');
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      {/* Broadcast strip */}
      <div className="border-b border-line bg-pitch/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="-skew-x-12 bg-ipl-orange px-3 py-1 font-display text-lg font-extrabold uppercase tracking-wide text-night">
              <span className="inline-block skew-x-12">{currentPlayer ? `${formatCategory(currentPlayer.category)} round` : 'Waiting room'}</span>
            </span>
            {roomState.round === 'ACCELERATED' && (
              <span className="inline-flex -skew-x-12 items-center bg-ipl-gold px-3 py-1 font-display text-lg font-extrabold uppercase tracking-wide text-night">
                <span className="inline-flex skew-x-12 items-center gap-1.5">
                  <Zap className="h-4 w-4" aria-hidden /> Accelerated round
                </span>
              </span>
            )}
            {currentAuctionIndex > 0 && (
              <span className="font-display text-lg font-semibold tabular text-ink-2">
                Player {currentAuctionIndex} of {totalPlayersInPool}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {record && (
              <span className="hidden items-center gap-2 rounded-full border border-ipl-gold/40 bg-ipl-gold/10 px-3 py-1 text-sm text-ink-2 md:inline-flex" title="Most expensive buy so far">
                <Trophy className="h-4 w-4 text-ipl-gold" aria-hidden />
                <span className="font-semibold text-ink">{record.playerName}</span>
                <span className="font-display font-bold tabular text-ipl-gold">{formatPrice(record.soldPrice)}</span>
              </span>
            )}
            <StatusBadge status={status} />
            <Button size="sm" icon={<Users className="h-4 w-4" />} onClick={() => setShowTeams(true)}>
              Teams ({teamList.length})
            </Button>
          </div>
        </div>
      </div>

      {!canControl && (
        <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
          <Notice>
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
              <Eye className="h-4 w-4" /> View only.
            </span>{' '}
            The auction controls are on the device that created this auction.
          </Notice>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 py-6 sm:px-6 lg:py-8">
        {currentPlayer ? (
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:items-start lg:gap-12">
            {/* Player card: top-aligned with the name so the stage reads left to right with no dead band above it */}
            <div className="flex flex-col items-center lg:sticky lg:top-24 lg:items-start">
              <div className="relative aspect-[4/5] w-full max-w-[340px] xl:max-w-[380px]">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={currentPlayer.id}
                    className="absolute inset-0 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#2a54c4] via-ipl-blue to-ipl-navy shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)]"
                    initial={{ opacity: 0, x: 120, rotate: 4, scale: 0.94 }}
                    animate={{ opacity: 1, x: 0, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -120, rotate: -4, scale: 0.94, transition: { duration: 0.3, ease: 'easeIn' } }}
                    transition={{ type: 'spring', stiffness: 170, damping: 22, delay: 0.25 }}
                  >
                    <svg viewBox="0 0 400 500" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
                      <defs>
                        <linearGradient id="stage-arc" x1="0" y1="1" x2="1" y2="0">
                          <stop offset="0" stopColor="#f36f21" />
                          <stop offset="1" stopColor="#f2c14e" />
                        </linearGradient>
                      </defs>
                      <path d="M-20 400C90 300 240 250 420 270v36C250 290 110 330 10 470Z" fill="url(#stage-arc)" opacity="0.9" />
                    </svg>
                    <PlayerPhoto player={currentPlayer} eager className="relative h-full w-full object-contain object-bottom drop-shadow-[0_24px_30px_rgb(0_0_0/0.55)]" />
                    <span className="absolute left-4 top-4 -skew-x-12 bg-ipl-orange px-2.5 py-0.5 font-display text-sm font-extrabold uppercase tracking-wider text-night">
                      <span className="inline-block skew-x-12">Lot {currentAuctionIndex}</span>
                    </span>
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-line bg-pitch-2 px-3 py-1 font-display text-base font-bold uppercase tracking-wide text-ink">{formatRole(currentPlayer.role)}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-pitch-2 px-3 py-1 font-display text-base font-bold uppercase tracking-wide text-ink">
                  {currentPlayer.isOverseas && <Globe className="h-4 w-4 text-ipl-blue-bright" aria-hidden />}
                  {currentPlayer.isOverseas ? 'Overseas' : 'Indian'}
                </span>
                <span className="rounded-full border border-line bg-pitch-2 px-3 py-1 font-display text-base font-bold uppercase tracking-wide text-ink">
                  Base <span className="text-ipl-gold">{formatPrice(currentPlayer.basePrice)}</span>
                </span>
              </div>
            </div>

            {/* Name, bid, clock, stats */}
            <div className="min-w-0">
              <div className="overflow-hidden pb-1">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={currentPlayer.id}
                    initial={{ y: '105%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '-105%', transition: { duration: 0.2, ease: 'easeIn' } }}
                    transition={{ duration: 0.55, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <h1 className="font-display text-5xl font-extrabold uppercase italic leading-[0.95] tracking-tight text-ink sm:text-6xl xl:text-7xl">{currentPlayer.name}</h1>
                    <p className="mt-2 text-lg text-ink-2">
                      {currentPlayer.nationality} · Last IPL team: {currentPlayer.previousIPLTeam}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="relative mt-6 overflow-hidden rounded-2xl border border-line bg-pitch/70">
                {/* Flash in the leading team's colour on every new bid */}
                <AnimatePresence>
                  {leadingTeam && (
                    <motion.div
                      key={currentBidVersion}
                      className="pointer-events-none absolute inset-0"
                      style={{ background: `radial-gradient(80% 120% at 0% 50%, ${leadingTeam.color || '#4f78e6'}55, transparent 70%)` }}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0.25 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                      aria-hidden
                    />
                  )}
                </AnimatePresence>
                <div className="relative grid gap-6 p-5 sm:grid-cols-2">
                  <div className="relative">
                    <p className="font-display text-lg font-semibold uppercase tracking-widest text-ink-3">{status === 'SOLD' ? 'Sold for' : leadingTeam ? 'Current bid' : 'Opening bid'}</p>
                    {/* The raise itself, rising off the price: shows how far each bid moved it */}
                    <DeltaPop value={currentBid} resetKey={currentPlayer.id} format={(d) => `+${formatPrice(d)}`} className="right-0 top-0" />
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.p
                        key={currentBidVersion}
                        initial={{ y: 28, opacity: 0, scale: 0.94 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: -18, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                        className="whitespace-nowrap font-display text-7xl font-extrabold leading-none tabular text-ipl-gold xl:text-8xl"
                      >
                        {formatPrice(currentBid)}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-lg font-semibold uppercase tracking-widest text-ink-3">{status === 'SOLD' ? 'Bought by' : 'Leading'}</p>
                    <AnimatePresence mode="wait" initial={false}>
                      {leadingTeam ? (
                        <motion.div
                          key={leadingTeam.id}
                          className="mt-1 flex items-stretch gap-3"
                          initial={{ opacity: 0, x: 16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -12 }}
                          transition={{ duration: 0.25 }}
                        >
                          <motion.span
                            className="flex shrink-0 items-center"
                            initial={{ scale: 0.5, rotate: -10 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                          >
                            <TeamLogo team={leadingTeam} size={64} />
                          </motion.span>
                          <div className="min-w-0">
                            <p className="truncate font-display text-4xl font-extrabold uppercase leading-tight text-ink">{leadingTeam.name}</p>
                            <p className="text-ink-2">
                              Purse {status === 'SOLD' ? 'now' : 'after this bid'}: {formatPrice(status === 'SOLD' ? leadingTeam.remainingPurse : leadingTeam.remainingPurse - currentBid)}
                            </p>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.p key="none" className="mt-1 font-display text-3xl font-bold uppercase text-ink-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          {status === 'PAUSED' ? 'Bidding paused' : status === 'UNSOLD' ? 'No takers' : 'Waiting for the opening bid'}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                {timerSeconds > 0 && (status === 'BIDDING' || status === 'PAUSED') && (
                  <div className="relative border-t border-line px-5 py-3">
                    <BidClock
                      status={status}
                      bidEndsAt={roomState.bidEndsAt ?? null}
                      pausedRemainingMs={roomState.pausedRemainingMs ?? null}
                      bidTimerSeconds={timerSeconds}
                      serverOffsetMs={serverOffsetMs}
                      bidVersion={currentBidVersion}
                      audible
                      hasBids={!!leadingTeam}
                      size={84}
                    />
                  </div>
                )}
              </div>

              <div className="mt-4">
                <NextPlayerBeat
                  status={status}
                  nextPlayerAt={roomState.nextPlayerAt ?? null}
                  autoAdvance={autoAdvance}
                  delaySeconds={advanceDelay}
                  serverOffsetMs={serverOffsetMs}
                  controls={
                    canControl
                      ? {
                          onNextNow: onNextPlayer,
                          onHold: () => onUpdateSettings({ autoAdvance: false }),
                          onResumeAuto: () => onUpdateSettings({ autoAdvance: true }),
                        }
                      : undefined
                  }
                />
              </div>

              <div className="mt-6">
                <PlayerStats key={currentPlayer.id} player={currentPlayer} />
              </div>

              <div className="mt-6 flex items-center gap-3 overflow-x-auto no-scrollbar" aria-label="Recent bids">
                <span className="shrink-0 text-sm text-ink-3">Bids</span>
                {lotBids.length === 0 ? (
                  <span className="text-sm text-ink-3">No bids yet</span>
                ) : (
                  <AnimatePresence initial={false}>
                    {lotBids.slice(0, 6).map((bid, i) => (
                      <motion.span
                        layout
                        key={bid.id}
                        initial={{ opacity: 0, scale: 0.8, x: -12 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                        className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-sm ${i === 0 ? 'border-ipl-gold/50 bg-ipl-gold/10 text-ink' : 'border-line text-ink-2'}`}
                      >
                        <span className="font-display font-bold tracking-wide">{bid.teamShortName}</span>
                        <span className="font-display font-bold tabular">{formatPrice(bid.amount)}</span>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </div>
          </div>
        ) : inLobby ? (
          <div className="space-y-6">
            <Panel className="relative grid items-center gap-8 overflow-hidden p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="absolute inset-x-0 top-0 h-1 stripe-ipl" aria-hidden />
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold uppercase tracking-widest text-ink-3">Join on your phone</p>
                <p className="mt-1 select-all font-display text-7xl font-extrabold tracking-[0.18em] text-ipl-gold sm:text-8xl">{displayCode}</p>
                <p className="mt-3 break-all text-ink-2">{joinUrl}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button size="sm" icon={copied === 'code' ? <Check className="h-4 w-4 text-live" /> : <Copy className="h-4 w-4" />} onClick={() => copy('code')}>
                    {copied === 'code' ? 'Copied' : 'Copy code'}
                  </Button>
                  <Button size="sm" icon={copied === 'link' ? <Check className="h-4 w-4 text-live" /> : <Copy className="h-4 w-4" />} onClick={() => copy('link')}>
                    {copied === 'link' ? 'Copied' : 'Copy link'}
                  </Button>
                  <Button size="sm" icon={<Share2 className="h-4 w-4" />} onClick={share}>
                    Share
                  </Button>
                </div>
                <dl className="mt-6 grid max-w-xl grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-5 sm:grid-cols-4">
                  {[
                    ['Purse', `₹${settings.startingPurse} Cr`],
                    ['Squad', `${settings.maxSquadSize} max`],
                    ['Lot timer', timerSeconds > 0 ? `${timerSeconds}s` : 'Off'],
                    ['Next player', autoAdvance ? `Auto, ${advanceDelay}s` : 'Manual'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs uppercase tracking-wider text-ink-3">{k}</dt>
                      <dd className="font-display text-xl font-bold text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="mx-auto w-52 rounded-2xl bg-white p-3 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.8)] sm:w-60">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt={`QR code to join room ${displayCode}`} className="aspect-square w-full" />
                ) : (
                  <div className="aspect-square w-full animate-pulse rounded-lg bg-slate-200" />
                )}
                <p className="mt-2 text-center font-display text-sm font-bold uppercase tracking-widest text-night">Scan to join</p>
              </div>
            </Panel>

            <Panel className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-xl font-bold uppercase tracking-wide text-ink">
                  Teams in the room <span className="tabular text-ink-3">({teamList.length}/{MAX_TEAMS})</span>
                </h2>
              </div>
              {teamList.length === 0 ? (
                <p className="text-ink-2">No teams yet. Owners scan the code to register; you can start with any number of teams.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <AnimatePresence initial={false}>
                    {teamList.map((t) => (
                      <motion.li
                        key={t.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                        className="relative overflow-hidden rounded-xl border border-line bg-night/60 p-3 pt-4"
                      >
                        <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: t.color || '#8390bd' }} aria-hidden />
                        <TeamLogo team={t} size={48} className="mb-2" />
                        <p className="truncate font-display text-lg font-bold uppercase tracking-wide text-ink">{t.name}</p>
                        <p className="flex items-center gap-1.5 text-sm text-ink-3">
                          <span className={`h-1.5 w-1.5 rounded-full ${participants[t.ownerParticipantId]?.connected ? 'bg-live' : 'bg-ink-3'}`} aria-hidden />
                          {participants[t.ownerParticipantId]?.connected ? 'Online' : 'Offline'}
                        </p>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </Panel>
          </div>
        ) : (
          <EmptyState title="Getting the next player ready" />
        )}
      </div>

      {!inLobby && <PurseTicker teams={teamList} leaderId={currentHighestBidderTeamId} maxSquadSize={settings.maxSquadSize} maxOverseas={settings.maxOverseas} />}

      {canControl && (
        <div className="sticky bottom-0 z-30 border-t border-line bg-night/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2.5 px-4 py-3 sm:px-6">
            {inLobby ? (
              <Button variant="primary" size="xl" icon={<Play className="h-6 w-6" />} onClick={onStartAuction} className="w-full sm:w-auto">
                Start auction
              </Button>
            ) : (
              <>
                <Button
                  variant="success"
                  size="xl"
                  icon={<Gavel className="h-6 w-6" />}
                  disabled={!canSell}
                  onClick={onSellPlayer}
                  title={canSell ? `Sell to ${leadingTeam?.name} (S)` : 'Available after the first bid'}
                >
                  Sold
                </Button>
                <Button variant="danger" size="lg" icon={<XCircle className="h-5 w-5" />} disabled={!canMarkUnsold} onClick={onMarkUnsold} title="Unsold (U)">
                  Unsold
                </Button>
                <Button size="lg" icon={<SkipForward className="h-5 w-5" />} disabled={!canAdvance} onClick={onNextPlayer} title={canAdvance ? 'Bring up the next player (N)' : 'Call Sold or Unsold first'}>
                  Next
                </Button>
                {status === 'PAUSED' ? (
                  <Button size="lg" icon={<Play className="h-5 w-5" />} onClick={onResumeAuction} title="Resume (P)">
                    Resume
                  </Button>
                ) : (
                  <Button size="lg" icon={<Pause className="h-5 w-5" />} disabled={status !== 'BIDDING'} onClick={onPauseAuction} title="Pause (P)">
                    Pause
                  </Button>
                )}
                {timerSeconds > 0 && (
                  <Button size="lg" icon={<Plus className="h-5 w-5" />} disabled={!canExtend} onClick={() => onExtendTimer(10)} title="Add 10 seconds to the clock (T)">
                    10s
                  </Button>
                )}
              </>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {!inLobby && (
                <span className="mr-1 hidden items-center gap-1.5 text-xs text-ink-3 xl:inline-flex" aria-label="Keyboard shortcuts">
                  <Keyboard className="h-4 w-4" aria-hidden />
                  {SHORTCUTS.map(([k, label]) => (
                    <span key={k} className="inline-flex items-center gap-1">
                      <kbd className="rounded border border-line-strong px-1.5 font-sans text-[11px] text-ink-2">{k}</kbd>
                      {label}
                    </span>
                  ))}
                </span>
              )}
              {status === 'SOLD' && (
                <Button variant="ghost" icon={<Undo2 className="h-4 w-4" />} onClick={() => setShowUndoConfirm(true)}>
                  Undo sale
                </Button>
              )}
              <TimerSettings settings={{ bidTimerSeconds: timerSeconds, autoAdvance, autoAdvanceDelaySeconds: advanceDelay }} onChange={onUpdateSettings} />
              <Button variant="ghost" icon={<StopCircle className="h-5 w-5" />} onClick={() => setShowEndConfirm(true)}>
                End
              </Button>
            </div>
          </div>
        </div>
      )}

      <LotWipe playerId={currentPlayer?.id ?? null} lot={currentAuctionIndex} total={totalPlayersInPool} round={currentPlayer ? formatCategory(currentPlayer.category) : ''} />

      {/* Sold / unsold moment */}
      <AnimatePresence>
        {splash === 'SOLD' && lastSoldEvent && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-night/95 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSplash(null)}
          >
            <div className="absolute inset-0 opacity-40" style={{ background: `radial-gradient(60% 60% at 50% 55%, ${lastSoldEvent.team.color || '#19398a'}, transparent 70%)` }} />
            <motion.div className="relative text-center" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
              <motion.span
                className="inline-flex items-center gap-3 border-4 border-ipl-gold px-8 py-1 font-display text-6xl font-extrabold uppercase italic tracking-[0.2em] text-ipl-gold"
                initial={{ scale: 2.4, rotate: -14, opacity: 0 }}
                animate={{ scale: 1, rotate: -3, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 18 }}
              >
                <Gavel className="h-12 w-12" aria-hidden /> Sold
              </motion.span>
              {isNewRecord && (
                <motion.p
                  className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-ipl-gold px-4 py-1 font-display text-xl font-extrabold uppercase tracking-wider text-night"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1.15, 1], opacity: 1 }}
                  transition={{ delay: 0.9, duration: 0.5 }}
                >
                  <Trophy className="h-5 w-5" aria-hidden /> New auction record
                </motion.p>
              )}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                <PlayerPhoto player={lastSoldEvent.player} eager className="mx-auto mt-4 h-40 w-32 object-contain object-bottom sm:h-52 sm:w-44" />
                <h2 className="mt-2 font-display text-6xl font-extrabold uppercase italic leading-none text-ink sm:text-8xl">{lastSoldEvent.player.name}</h2>
                <p className="mt-4 flex items-center justify-center gap-3 font-display text-3xl font-bold uppercase text-ink-2 sm:text-4xl">
                  to
                  <span className="inline-flex items-center gap-2 text-ink">
                    <TeamLogo team={lastSoldEvent.team} size={56} className="h-11 w-11 sm:h-14 sm:w-14" />
                    {lastSoldEvent.team.name}
                  </span>
                </p>
                <CountUp
                  value={lastSoldEvent.price}
                  duration={1.1}
                  format={(n) => formatPrice(Math.round(n * 100) / 100)}
                  className="mt-6 block font-display text-7xl font-extrabold tabular text-ipl-gold sm:text-9xl"
                />
              </motion.div>
            </motion.div>
          </motion.div>
        )}
        {splash === 'UNSOLD' && lastUnsoldEvent && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center bg-night/95 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSplash(null)}
          >
            <div className="text-center">
              <motion.span
                className="inline-block border-4 border-danger px-8 py-1 font-display text-5xl font-extrabold uppercase italic tracking-[0.2em] text-danger"
                initial={{ scale: 2, rotate: 10, opacity: 0 }}
                animate={{ scale: 1, rotate: 2, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 20 }}
              >
                Unsold
              </motion.span>
              <h2 className="mt-6 font-display text-6xl font-extrabold uppercase leading-none text-ink sm:text-7xl">{lastUnsoldEvent.player.name}</h2>
              <p className="mt-4 text-xl text-ink-2">No bids at the base price of {formatPrice(lastUnsoldEvent.player.basePrice)}.</p>
              {settings.reauctionUnsold && roomState.round !== 'ACCELERATED' && <p className="mt-2 text-ink-3">They come back in the accelerated round.</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Drawer open={showTeams} onClose={() => setShowTeams(false)} title={`Teams (${teamList.length}/${MAX_TEAMS})`}>
        {teamList.length === 0 ? (
          <EmptyState icon={<Users className="h-8 w-8" />} title="No teams yet">
            Owners join with code {displayCode}.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {teamList.map((team) => {
              const owner = participants[team.ownerParticipantId];
              const leading = team.id === currentHighestBidderTeamId;
              return (
                <li key={team.id} className={`rounded-xl border p-4 ${leading ? 'border-live/50 bg-live/5' : 'border-line bg-night/60'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <TeamTag shortName={team.shortName} name={team.name} color={team.color} />
                        {leading && <span className="text-sm font-semibold text-live">Leading</span>}
                      </div>
                      <p className="mt-1 truncate font-display text-lg font-bold uppercase tracking-wide text-ink">{team.name}</p>
                      <p className="flex items-center gap-1.5 text-sm text-ink-3">
                        <span className={`h-1.5 w-1.5 rounded-full ${owner?.connected ? 'bg-live' : 'bg-ink-3'}`} aria-hidden />
                        {owner?.connected ? 'Online' : 'Offline'}
                      </p>
                    </div>
                    {canControl && (
                      <button
                        onClick={() => setKickCandidate(team.ownerParticipantId)}
                        className="rounded-lg p-2 text-ink-3 transition-colors hover:bg-danger/10 hover:text-danger"
                        aria-label={`Remove ${team.name}`}
                        title={`Remove ${team.name}`}
                      >
                        <UserX className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-ink-3">Purse</dt>
                      <dd>
                        <Price value={team.remainingPurse} className="text-lg" />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-3">Squad</dt>
                      <dd className="font-display text-lg font-bold tabular text-ink">
                        {team.squadSize}/{settings.maxSquadSize}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-3">Overseas</dt>
                      <dd className="font-display text-lg font-bold tabular text-ink">
                        {team.overseasCount}/{settings.maxOverseas}
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </Drawer>

      <Modal
        open={showUndoConfirm}
        onClose={() => setShowUndoConfirm(false)}
        size="sm"
        title="Undo this sale?"
        description={
          lastSoldEvent
            ? `${lastSoldEvent.player.name} goes back to the pool and ${lastSoldEvent.team.name} gets ${formatPrice(lastSoldEvent.price)} back.`
            : 'The last sale is reversed and the purse refunded.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowUndoConfirm(false)}>
              Keep the sale
            </Button>
            <Button
              variant="danger"
              icon={<Undo2 className="h-4 w-4" />}
              onClick={() => {
                setShowUndoConfirm(false);
                onUndoLastSale();
              }}
            >
              Undo sale
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Use this when the hammer fell by mistake. Everyone's screens update straight away.</p>
      </Modal>

      <Modal
        open={showEndConfirm}
        onClose={() => setShowEndConfirm(false)}
        size="sm"
        title="End the auction?"
        description="Bidding closes for good and every squad is locked. Everyone moves to the results screen to pick their Playing XI."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowEndConfirm(false)}>
              Keep going
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setShowEndConfirm(false);
                onEndAuction();
              }}
            >
              End auction
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          {Object.keys(soldPlayers).length} players sold so far across {teamList.length} teams.
        </p>
      </Modal>

      <Modal
        open={!!kickCandidate}
        onClose={() => setKickCandidate(null)}
        size="sm"
        title="Remove this team?"
        description="The team is removed from this auction and its owner loses their bid button."
        footer={
          <>
            <Button variant="ghost" onClick={() => setKickCandidate(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (kickCandidate) onKickParticipant(kickCandidate);
                setKickCandidate(null);
              }}
            >
              Remove team
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">The owner can register again as a new team.</p>
      </Modal>

      <Toast message={lastError} className={canControl ? 'bottom-44' : 'bottom-28'} />
    </div>
  );
};
