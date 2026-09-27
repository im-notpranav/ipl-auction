import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Users, MessageSquare, Send, CheckCircle2, Globe, Hourglass, Gavel, ChevronRight, Star, Zap } from 'lucide-react';
import { AuctionRoomState, ChatMessage, PlayerRole, Team } from '../types';
import { formatCategory, formatPrice, formatRole, calculateNextLegalBid } from '../utils/format';
import { Button, CountUp, Drawer, EmptyState, Notice, PlayerPhoto, Price, RatingRing, TeamLogo, TeamTag, Toast } from './ui';
import { PlayerStats } from './PlayerStats';
import { getPlayerRating } from '../services/playerRatings';
import { ClockBar, useLotClock } from './live/BidClock';
import { NextPlayerBeat } from './live/NextPlayerBeat';
import { BuyCelebration } from './live/BuyCelebration';
import { SaleFeed, SaleFeedItem } from './live/SaleFeed';
import { useWishlist, WishlistDrawer } from './live/Wishlist';

interface ParticipantViewProps {
  roomState: AuctionRoomState;
  participantId: string;
  chatMessages: ChatMessage[];
  lastError: string | null;
  serverOffsetMs: number;
  onPlaceBid: () => void;
  onSendChat: (text: string) => void;
}

// The server keeps ₹0.20 Cr back for every squad slot still to fill after this one.
const RESERVE_PER_SLOT = 0.2;

const ROLE_ORDER: { role: PlayerRole; label: string }[] = [
  { role: 'BATSMAN', label: 'Bat' },
  { role: 'WICKET_KEEPER', label: 'WK' },
  { role: 'ALL_ROUNDER', label: 'AR' },
  { role: 'BOWLER', label: 'Bowl' },
];

function roleCounts(team: Team) {
  const counts: Record<PlayerRole, number> = { BATSMAN: 0, WICKET_KEEPER: 0, ALL_ROUNDER: 0, BOWLER: 0 };
  team.playersBought.forEach((p) => counts[p.playerRole]++);
  return counts;
}

export const ParticipantView: React.FC<ParticipantViewProps> = ({ roomState, participantId, chatMessages, lastError, serverOffsetMs, onPlaceBid, onSendChat }) => {
  const {
    status,
    currentPlayer,
    currentBid,
    currentBidVersion,
    currentHighestBidderTeamId,
    teams,
    participants,
    settings,
    lastSoldEvent,
    lastUnsoldEvent,
  } = roomState;
  const myTeamId = participants[participantId]?.teamId;
  const myTeam: Team | undefined = myTeamId ? teams[myTeamId] : undefined;
  const leadingTeam = currentHighestBidderTeamId ? teams[currentHighestBidderTeamId] : undefined;

  const [showSquad, setShowSquad] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showWishlist, setShowWishlist] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [seenMessages, setSeenMessages] = useState(chatMessages.length);
  const [celebrate, setCelebrate] = useState<NonNullable<AuctionRoomState['lastSoldEvent']> | null>(null);
  const [feed, setFeed] = useState<SaleFeedItem[]>([]);
  const [outbidAt, setOutbidAt] = useState<number | null>(null);
  const wishlist = useWishlist(roomState.id);

  const clockInput = {
    status,
    bidEndsAt: roomState.bidEndsAt ?? null,
    pausedRemainingMs: roomState.pausedRemainingMs ?? null,
    bidTimerSeconds: settings.bidTimerSeconds ?? 0,
    serverOffsetMs,
  };
  const clock = useLotClock(clockInput);

  useEffect(() => {
    if (showChat) setSeenMessages(chatMessages.length);
  }, [showChat, chatMessages.length]);
  const unread = Math.max(0, chatMessages.length - seenMessages);

  const nextBid = currentHighestBidderTeamId ? calculateNextLegalBid(currentBid) : currentBid;
  const isLeading = !!myTeam && currentHighestBidderTeamId === myTeam.id;
  const openSlotsAfter = myTeam ? Math.max(0, settings.maxSquadSize - myTeam.squadSize - 1) : 0;
  const maxBid = myTeam ? Math.max(0, Math.round((myTeam.remainingPurse - RESERVE_PER_SLOT * openSlotsAfter) * 100) / 100) : 0;

  // Why the bid button is off, in plain words (null = you can bid).
  let blockedReason: string | null = null;
  if (status === 'PAUSED') blockedReason = 'Auction paused';
  else if (status !== 'BIDDING' || !currentPlayer) blockedReason = 'Bidding opens with the next player';
  else if (!myTeam) blockedReason = 'Register a team to bid';
  else if (isLeading) blockedReason = null;
  else if (myTeam.squadSize >= settings.maxSquadSize) blockedReason = `Squad full (${myTeam.squadSize}/${settings.maxSquadSize})`;
  else if (currentPlayer.isOverseas && myTeam.overseasCount >= settings.maxOverseas) blockedReason = `Overseas limit reached (${myTeam.overseasCount}/${settings.maxOverseas})`;
  else if (myTeam.remainingPurse < nextBid) blockedReason = `Not enough purse (${formatPrice(myTeam.remainingPurse)} left)`;
  else if (nextBid > maxBid) blockedReason = `Keep ${formatPrice(RESERVE_PER_SLOT * openSlotsAfter)} for ${openSlotsAfter} empty slots`;

  const rating = currentPlayer ? getPlayerRating(currentPlayer) : null;
  const onWishlist = !!currentPlayer && wishlist.has(currentPlayer.id);
  const iWonLast = status === 'SOLD' && lastSoldEvent && myTeam && lastSoldEvent.team.id === myTeam.id;
  const counts = useMemo(() => (myTeam ? roleCounts(myTeam) : null), [myTeam]);

  // Sale moments: my buy gets the full celebration, everyone else's goes into the feed.
  // Refs start at whatever is already on screen so a reconnect doesn't replay old news.
  const seenSale = useRef(lastSoldEvent?.timestamp ?? null);
  const seenUnsold = useRef(lastUnsoldEvent?.timestamp ?? null);
  useEffect(() => {
    if (status !== 'SOLD' || !lastSoldEvent || lastSoldEvent.timestamp === seenSale.current) return;
    seenSale.current = lastSoldEvent.timestamp;
    if (myTeam && lastSoldEvent.team.id === myTeam.id) {
      setCelebrate(lastSoldEvent);
    } else {
      setFeed((f) => [
        ...f.slice(-2),
        {
          id: `sold-${lastSoldEvent.timestamp}`,
          kind: 'sold',
          playerName: lastSoldEvent.player.name,
          teamShort: lastSoldEvent.team.shortName,
          teamColor: lastSoldEvent.team.color,
          price: lastSoldEvent.price,
        },
      ]);
    }
  }, [status, lastSoldEvent, myTeam]);
  useEffect(() => {
    if (status !== 'UNSOLD' || !lastUnsoldEvent || lastUnsoldEvent.timestamp === seenUnsold.current) return;
    seenUnsold.current = lastUnsoldEvent.timestamp;
    setFeed((f) => [...f.slice(-2), { id: `unsold-${lastUnsoldEvent.timestamp}`, kind: 'unsold', playerName: lastUnsoldEvent.player.name }]);
  }, [status, lastUnsoldEvent]);
  const dismissFeed = useCallback((id: string) => setFeed((f) => f.filter((x) => x.id !== id)), []);

  // Lost the lead: flash the bid box (sound and vibration come from the socket hook).
  const prevLeader = useRef(currentHighestBidderTeamId);
  const prevLot = useRef(currentPlayer?.id ?? null);
  useEffect(() => {
    const sameLot = prevLot.current === (currentPlayer?.id ?? null);
    if (sameLot && myTeam && prevLeader.current === myTeam.id && currentHighestBidderTeamId && currentHighestBidderTeamId !== myTeam.id) {
      setOutbidAt(Date.now());
    }
    prevLeader.current = currentHighestBidderTeamId;
    prevLot.current = currentPlayer?.id ?? null;
  }, [currentHighestBidderTeamId, currentPlayer?.id, myTeam]);

  // A wishlisted player walks out: buzz once.
  const buzzedFor = useRef<string | null>(null);
  useEffect(() => {
    if (onWishlist && currentPlayer && buzzedFor.current !== currentPlayer.id) {
      buzzedFor.current = currentPlayer.id;
      navigator.vibrate?.([40, 60, 40]);
    }
  }, [onWishlist, currentPlayer]);

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  const urgent = clock.active && !clock.paused && clock.phase === 'urgent' && status === 'BIDDING';

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col px-4 pb-36 pt-4">
      {myTeam ? (
        <div className="relative overflow-hidden rounded-2xl border border-line bg-pitch p-4">
          <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: myTeam.color || '#8390bd' }} aria-hidden />
          <div className="flex items-start justify-between gap-3 pl-1">
            <TeamLogo team={myTeam} size={44} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-display text-lg font-bold uppercase leading-tight tracking-wide text-ink">{myTeam.name}</p>
              <p className="text-sm tabular text-ink-3">
                Squad {myTeam.squadSize}/{settings.maxSquadSize} · Overseas {myTeam.overseasCount}/{settings.maxOverseas}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-ink-3">Purse</p>
              <CountUp
                value={myTeam.remainingPurse}
                duration={0.9}
                format={(n) => formatPrice(Math.round(n * 100) / 100)}
                className="whitespace-nowrap font-display text-2xl font-bold tabular text-ipl-gold"
              />
            </div>
          </div>
          {counts && (
            <div className="mt-2 flex gap-1.5 pl-1" aria-label="Squad by role">
              {ROLE_ORDER.map(({ role, label }) => (
                <span key={role} className="rounded-md border border-line bg-night/60 px-2 py-0.5 text-xs tabular text-ink-2">
                  {label} <span className="font-semibold text-ink">{counts[role]}</span>
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 pl-1">
            <Button size="sm" icon={<Users className="h-4 w-4" />} onClick={() => setShowSquad(true)}>
              Squad
            </Button>
            <Button size="sm" icon={<Star className="h-4 w-4" />} onClick={() => setShowWishlist(true)}>
              Wishlist
            </Button>
            <Button size="sm" icon={<MessageSquare className="h-4 w-4" />} onClick={() => setShowChat(true)}>
              Chat
              {unread > 0 && <span className="rounded-full bg-ipl-orange px-1.5 text-xs text-night tabular">{unread}</span>}
            </Button>
          </div>
        </div>
      ) : (
        <Notice>You're watching this auction. Register a team in the lobby to bid.</Notice>
      )}

      {currentPlayer ? (
        <div className="my-auto flex flex-col items-center pt-5 text-center">
          <AnimatePresence initial={false}>
            {onWishlist && (
              <motion.div
                key={`wish-${currentPlayer.id}`}
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6 }}
                className="mb-3 inline-flex items-center gap-2 rounded-full border border-ipl-gold/60 bg-ipl-gold/15 px-3 py-1 font-display text-sm font-bold uppercase tracking-wider text-ipl-gold"
              >
                <Star className="h-4 w-4 fill-ipl-gold" aria-hidden /> On your wishlist
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentPlayer.id}
              className="flex w-full flex-col items-center"
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60, transition: { duration: 0.2, ease: 'easeIn' } }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            >
              <div
                className={`relative aspect-[4/5] w-32 overflow-hidden rounded-2xl border bg-gradient-to-b from-[#2a54c4] via-ipl-blue to-ipl-navy ${
                  onWishlist ? 'border-ipl-gold shadow-[0_0_0_3px_rgb(242_193_78/0.25)]' : 'border-white/10'
                }`}
              >
                <div className="absolute inset-x-0 bottom-0 h-1 stripe-ipl" />
                <PlayerPhoto player={currentPlayer} eager className="h-full w-full object-contain object-bottom" />
              </div>
              <p className="mt-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-ipl-orange">
                Lot {roomState.currentAuctionIndex} · {formatCategory(currentPlayer.category)}
                {roomState.round === 'ACCELERATED' && (
                  <span className="inline-flex items-center gap-1 rounded bg-ipl-gold px-1.5 text-night">
                    <Zap className="h-3 w-3" aria-hidden /> Accelerated
                  </span>
                )}
              </p>
              <h1 className="mt-0.5 font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight text-ink">{currentPlayer.name}</h1>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-2">
                {currentPlayer.isOverseas && <Globe className="h-3.5 w-3.5 text-ipl-blue-bright" aria-hidden />}
                {formatRole(currentPlayer.role)} · {currentPlayer.nationality} · Base {formatPrice(currentPlayer.basePrice)}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="relative mt-4 w-full overflow-hidden rounded-2xl border border-line bg-pitch p-4">
            <AnimatePresence>
              {outbidAt && (
                <motion.div
                  key={outbidAt}
                  className="pointer-events-none absolute inset-0 bg-danger/25"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                  onAnimationComplete={() => setOutbidAt(null)}
                  aria-hidden
                />
              )}
            </AnimatePresence>
            {status === 'SOLD' && lastSoldEvent ? (
              <p className={`relative font-display text-2xl font-bold uppercase ${iWonLast ? 'text-live' : 'text-ink'}`}>
                {iWonLast ? `You bought ${lastSoldEvent.player.name}` : `Sold to ${lastSoldEvent.team.shortName}`} for {formatPrice(lastSoldEvent.price)}
              </p>
            ) : status === 'UNSOLD' ? (
              <p className="relative font-display text-2xl font-bold uppercase text-danger">Unsold</p>
            ) : (
              <div className="relative">
                <p className="text-sm text-ink-3">{leadingTeam ? 'Current bid' : 'Opening bid'}</p>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.p
                    key={currentBidVersion}
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -12, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    className="font-display text-6xl font-extrabold leading-none tabular text-ipl-gold"
                  >
                    {formatPrice(currentBid)}
                  </motion.p>
                </AnimatePresence>
                <p className="mt-2 text-base">
                  {isLeading ? (
                    <span className="font-semibold text-live">You're leading</span>
                  ) : leadingTeam ? (
                    <span className="inline-flex items-center gap-2 text-ink-2">
                      <TeamTag shortName={leadingTeam.shortName} name={leadingTeam.name} color={leadingTeam.color} /> leads
                    </span>
                  ) : (
                    <span className="text-ink-3">No bids yet. Opens at the base price.</span>
                  )}
                </p>
                <ClockBar {...clockInput} bidVersion={currentBidVersion} className="mt-3" />
                {myTeam && (
                  <p className="mt-2 text-xs text-ink-3">
                    You can go up to <span className="font-semibold tabular text-ink-2">{formatPrice(maxBid)}</span>
                    {openSlotsAfter > 0 && <> (keeping {formatPrice(RESERVE_PER_SLOT * openSlotsAfter)} for {openSlotsAfter} more slots)</>}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 w-full">
            <NextPlayerBeat
              compact
              status={status}
              nextPlayerAt={roomState.nextPlayerAt ?? null}
              autoAdvance={!!settings.autoAdvance}
              delaySeconds={settings.autoAdvanceDelaySeconds ?? 5}
              serverOffsetMs={serverOffsetMs}
            />
          </div>

          <button
            onClick={() => setShowStats(true)}
            className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-line bg-pitch/80 p-3 text-left transition-colors hover:border-line-strong"
          >
            <RatingRing value={rating!.overall} size={52} label="" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-semibold text-ink">
                {rating!.primary === 'BOWLING'
                  ? `Bowling ${rating!.bowling.rating}`
                  : rating!.primary === 'ALL_ROUND'
                    ? `Bat ${rating!.batting.rating} · Bowl ${rating!.bowling.rating}`
                    : `Batting ${rating!.batting.rating}`}
              </span>
              <span className="block truncate text-ink-3">
                {[`${currentPlayer.batting.matches} IPL matches`, ...rating!.tags.filter((t) => !t.endsWith('IPL matches'))].slice(0, 2).join(' · ')}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 font-display text-sm font-bold uppercase tracking-wide text-ipl-orange">
              Stats <ChevronRight className="h-4 w-4" aria-hidden />
            </span>
          </button>
        </div>
      ) : (
        <div className="my-auto">
          <EmptyState icon={<Hourglass className="h-10 w-10" />} title={status === 'LOBBY' || status === 'READY' ? 'Waiting for the start' : 'Next player coming up'}>
            Keep this screen open. It updates the moment the auctioneer moves.
          </EmptyState>
        </div>
      )}

      {/* One-thumb bid bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-night/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <div className="mx-auto max-w-md">
          <AnimatePresence mode="wait" initial={false}>
            {isLeading && status === 'BIDDING' ? (
              <motion.div
                key="leading"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                className="relative flex h-16 items-center justify-center gap-2 overflow-hidden rounded-xl border border-live/50 bg-live/10 font-display text-2xl font-bold uppercase tracking-wide text-live"
                role="status"
              >
                {clock.active && (
                  <span className="absolute inset-y-0 left-0 bg-live/15" style={{ width: `${clock.fraction * 100}%`, transition: 'width 120ms linear' }} aria-hidden />
                )}
                <CheckCircle2 className="relative h-6 w-6" aria-hidden />
                <span className="relative">You're leading{clock.active ? ` · ${clock.secondsLeft}s` : ''}</span>
              </motion.div>
            ) : blockedReason ? (
              <motion.div key={`blocked-${blockedReason}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <Button size="xl" fullWidth disabled className="text-lg">
                  {blockedReason}
                </Button>
              </motion.div>
            ) : (
              <motion.div key="bid" className="relative" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.18 }}>
                {/* Final seconds: a red ring ripples out from the paddle. The button itself stays solid so it never looks disabled. */}
                {urgent && <span className="pointer-events-none absolute inset-0 rounded-xl border-2 border-danger animate-urgent-ring" aria-hidden />}
                <Button
                  variant="primary"
                  size="xl"
                  fullWidth
                  icon={<Gavel className="relative h-6 w-6" />}
                  onClick={onPlaceBid}
                  className={`relative overflow-hidden ${urgent ? 'ring-2 ring-danger ring-offset-2 ring-offset-night' : ''}`}
                >
                  {clock.active && (
                    <span className="pointer-events-none absolute inset-y-0 left-0 bg-white/20" style={{ width: `${clock.fraction * 100}%`, transition: 'width 120ms linear' }} aria-hidden />
                  )}
                  <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-gradient-to-r from-transparent via-white/35 to-transparent" aria-hidden />
                  <span className="relative">
                    Bid <span className="tabular">{formatPrice(nextBid)}</span>
                  </span>
                  {clock.active && <span className="relative ml-1 rounded-md bg-night/25 px-1.5 text-lg tabular">{clock.secondsLeft}s</span>}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Toast message={lastError} className="bottom-28" />
      <SaleFeed items={feed} onDismiss={dismissFeed} />

      <AnimatePresence>
        {celebrate && myTeam && (
          <BuyCelebration
            key={celebrate.timestamp}
            player={celebrate.player}
            teamName={myTeam.name}
            teamShortName={myTeam.shortName}
            teamColor={myTeam.color || '#f36f21'}
            price={celebrate.price}
            squadAfter={myTeam.squadSize}
            maxSquad={settings.maxSquadSize}
            purseAfter={myTeam.remainingPurse}
            onDone={() => setCelebrate(null)}
          />
        )}
      </AnimatePresence>

      <Drawer open={showStats && !!currentPlayer} onClose={() => setShowStats(false)} title={currentPlayer ? currentPlayer.name : 'Player stats'}>
        {currentPlayer && <PlayerStats player={currentPlayer} variant="compact" />}
      </Drawer>

      <WishlistDrawer open={showWishlist} onClose={() => setShowWishlist(false)} auctionedIds={roomState.auctionedPlayerIds} wishlist={wishlist} />

      <Drawer open={showSquad && !!myTeam} onClose={() => setShowSquad(false)} title={`My squad (${myTeam?.squadSize ?? 0}/${settings.maxSquadSize})`}>
        {myTeam && counts && (
          <>
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-night/60 p-3">
                <dt className="text-sm text-ink-3">Purse left</dt>
                <dd>
                  <Price value={myTeam.remainingPurse} className="text-2xl" />
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-night/60 p-3">
                <dt className="text-sm text-ink-3">Overseas</dt>
                <dd className="font-display text-2xl font-bold tabular text-ink">
                  {myTeam.overseasCount}/{settings.maxOverseas}
                </dd>
              </div>
            </dl>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {ROLE_ORDER.map(({ role }) => (
                <div key={role} className="rounded-xl border border-line bg-night/60 px-1 py-2">
                  <p className="font-display text-2xl font-bold tabular text-ink">{counts[role]}</p>
                  <p className="text-xs text-ink-3">{formatRole(role)}s</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-3">
              A Playing XI needs a wicket-keeper, five bowling options and at most 4 overseas players. You pick it when the auction ends.
            </p>
            {myTeam.playersBought.length === 0 ? (
              <EmptyState title="No players yet">Your buys show up here the moment the hammer falls.</EmptyState>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {myTeam.playersBought.map((p) => (
                  <li key={p.playerId} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{p.playerName}</p>
                      <p className="text-sm text-ink-3">
                        {formatRole(p.playerRole)}
                        {p.isOverseas ? ' · Overseas' : ''}
                      </p>
                    </div>
                    <Price value={p.soldPrice} className="text-lg" />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Drawer>

      <Drawer
        open={showChat}
        onClose={() => setShowChat(false)}
        title="Room chat"
        footer={
          <form onSubmit={sendChat} className="flex gap-2">
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <input
              id="chat-input"
              placeholder="Say something to the room"
              value={chatInput}
              maxLength={200}
              onChange={(e) => setChatInput(e.target.value)}
              className="h-11 flex-1 rounded-xl border border-line bg-night px-3.5 text-base text-ink placeholder:text-ink-3 outline-none focus:border-ipl-orange"
            />
            <Button type="submit" variant="primary" aria-label="Send message" icon={<Send className="h-4 w-4" />} />
          </form>
        }
      >
        {chatMessages.length === 0 ? (
          <EmptyState icon={<MessageSquare className="h-8 w-8" />} title="Quiet in here">
            Start the banter.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {chatMessages.map((msg) => (
              <li key={msg.id} className="rounded-xl border border-line bg-night/60 p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-ipl-orange">{msg.senderTeamName ? `${msg.senderName} · ${msg.senderTeamName}` : msg.senderName}</span>
                  <time className="text-ink-3">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                </div>
                <p className="mt-1 text-ink">{msg.text}</p>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </div>
  );
};
