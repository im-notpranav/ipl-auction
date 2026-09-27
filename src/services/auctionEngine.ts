import { AuctionRoomState, AuctionSettings, Player, PlayerCategory } from '../types';
import { ALL_PLAYERS, PLAYERS_BY_CATEGORY, PLAYERS_BY_ID } from '../data/players';

/*
  Auction state transitions, shared by server.ts and the tests.

  Every function mutates the room it is given and takes `now` (ms) so the clock
  can be tested without real timers. server.ts owns the setTimeouts: after any
  change it calls nextDeadline(room) and, when that time comes, tick(room, now).

  Clock rules
   - A lot opens with bidEndsAt = now + timer (when bidTimerSeconds > 0).
     Every accepted bid resets it to a full timer.
   - When bidEndsAt passes: sold to the leader, or unsold if nobody bid.
   - After SOLD / UNSOLD with autoAdvance on, nextPlayerAt = now + delay.
   - PAUSE while BIDDING: status PAUSED, the time left goes to pausedRemainingMs.
     RESUME gives it back (at least RESUME_GRACE_MS so people can react).
   - PAUSE while SOLD / UNSOLD "holds" the auto-advance: status stays SOLD / UNSOLD
     (so the sold moment stays on screen), nextPlayerAt becomes null and the time
     left goes to pausedRemainingMs. RESUME releases it.
   - The ACCELERATED round re-offers unsold players once, on half the timer.
*/

export const DEFAULT_SETTINGS: Pick<AuctionSettings, 'bidTimerSeconds' | 'autoAdvance' | 'autoAdvanceDelaySeconds' | 'reauctionUnsold'> = {
  bidTimerSeconds: 20,
  autoAdvance: true,
  autoAdvanceDelaySeconds: 5,
  reauctionUnsold: true,
};

const RESUME_GRACE_MS = 5000;
const DEFAULT_CATEGORIES: PlayerCategory[] = ['MARQUEE', 'BATSMEN', 'ALL_ROUNDERS', 'BOWLERS', 'WICKET_KEEPERS'];

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (value: string | null | undefined) => (value ? Date.parse(value) : NaN);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Settings ───────────────────────────────────────────────────────────────

export function clampTimer(seconds: unknown): number {
  const n = Math.round(Number(seconds));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(120, Math.max(5, n));
}

export function clampDelay(seconds: unknown): number {
  const n = Math.round(Number(seconds));
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.autoAdvanceDelaySeconds;
  return Math.min(30, Math.max(2, n));
}

// Seconds per lot for the round in play: the accelerated round runs at half pace.
export function lotSeconds(room: AuctionRoomState): number {
  const base = room.settings.bidTimerSeconds || 0;
  if (base <= 0) return 0;
  return room.round === 'ACCELERATED' ? Math.max(5, Math.ceil(base / 2)) : base;
}

// Rooms saved before the clock existed: no timer, no auto-advance (keeps their old behaviour).
export function normalizeRoom(room: AuctionRoomState): AuctionRoomState {
  const s = room.settings as Partial<AuctionSettings> & AuctionSettings;
  if (typeof s.bidTimerSeconds !== 'number') s.bidTimerSeconds = 0;
  if (typeof s.autoAdvance !== 'boolean') s.autoAdvance = false;
  if (typeof s.autoAdvanceDelaySeconds !== 'number') s.autoAdvanceDelaySeconds = DEFAULT_SETTINGS.autoAdvanceDelaySeconds;
  if (typeof s.reauctionUnsold !== 'boolean') s.reauctionUnsold = false;
  if (room.bidEndsAt === undefined) room.bidEndsAt = null;
  if (room.pausedRemainingMs === undefined) room.pausedRemainingMs = null;
  if (room.nextPlayerAt === undefined) room.nextPlayerAt = null;
  if (!room.round) room.round = 'MAIN';
  if (!room.playingXIs) room.playingXIs = {};
  if (!room.serverTime) room.serverTime = new Date().toISOString();
  return room;
}

// ─── Player selection ───────────────────────────────────────────────────────

// Picks the next player. Main round: category by category, random within a category.
// When the main pool is empty, starts the accelerated round of unsold players (once).
export function pickNextPlayer(room: AuctionRoomState, random: () => number = Math.random): Player | null {
  if (room.round === 'MAIN') {
    const done = new Set(room.auctionedPlayerIds);
    for (const cat of room.settings.categoriesOrder?.length ? room.settings.categoriesOrder : DEFAULT_CATEGORIES) {
      const pool = (PLAYERS_BY_CATEGORY[cat] || []).filter((p) => !done.has(p.id));
      if (pool.length) return pool[Math.floor(random() * pool.length)];
    }
    const rest = ALL_PLAYERS.filter((p) => !done.has(p.id));
    if (rest.length) return rest[Math.floor(random() * rest.length)];

    if (!room.settings.reauctionUnsold || room.unsoldPlayerIds.length === 0) return null;
    room.round = 'ACCELERATED';
    room.accelerationQueue = [...room.unsoldPlayerIds];
    room.unsoldPlayerIds = [];
    room.totalPlayersInPool += room.accelerationQueue.length;
  }

  const queue = room.accelerationQueue ?? [];
  while (queue.length) {
    const next = PLAYERS_BY_ID[queue.shift()!];
    if (next && !room.soldPlayers[next.id]) return next;
  }
  return null;
}

// ─── Clock helpers ──────────────────────────────────────────────────────────

export function armBidClock(room: AuctionRoomState, now: number) {
  const seconds = lotSeconds(room);
  room.bidEndsAt = seconds > 0 ? iso(now + seconds * 1000) : null;
  room.pausedRemainingMs = null;
}

function scheduleAdvance(room: AuctionRoomState, now: number) {
  room.bidEndsAt = null;
  room.pausedRemainingMs = null;
  room.nextPlayerAt = room.settings.autoAdvance ? iso(now + room.settings.autoAdvanceDelaySeconds * 1000) : null;
}

export function clearClock(room: AuctionRoomState) {
  room.bidEndsAt = null;
  room.nextPlayerAt = null;
  room.pausedRemainingMs = null;
}

// The next moment the server has to act on this room, or null.
export function nextDeadline(room: AuctionRoomState): number | null {
  if (room.status === 'BIDDING' && room.bidEndsAt) return ms(room.bidEndsAt);
  if ((room.status === 'SOLD' || room.status === 'UNSOLD') && room.nextPlayerAt) return ms(room.nextPlayerAt);
  return null;
}

export function biddingClosed(room: AuctionRoomState, now: number) {
  return room.status === 'BIDDING' && !!room.bidEndsAt && now >= ms(room.bidEndsAt);
}

// ─── Transitions ────────────────────────────────────────────────────────────

function completeAuction(room: AuctionRoomState, now: number) {
  room.status = 'COMPLETED';
  room.completedAt = iso(now);
  room.currentPlayer = null;
  room.currentHighestBidderTeamId = null;
  room.currentBid = 0;
  clearClock(room);
}

// Brings up the next player (or completes the auction). Returns the new player.
export function openNextLot(room: AuctionRoomState, now: number, random: () => number = Math.random): Player | null {
  const next = pickNextPlayer(room, random);
  delete room.lastSoldEvent;
  delete room.lastUnsoldEvent;
  if (!next) {
    completeAuction(room, now);
    return null;
  }
  room.status = 'BIDDING';
  room.currentPlayer = next;
  room.currentBid = next.basePrice;
  room.currentHighestBidderTeamId = null;
  room.currentBidVersion++;
  room.recentBids = [];
  room.currentAuctionIndex++;
  room.nextPlayerAt = null;
  armBidClock(room, now);
  return next;
}

export function sellCurrent(room: AuctionRoomState, now: number): boolean {
  if (room.status !== 'BIDDING' || !room.currentPlayer || !room.currentHighestBidderTeamId) return false;
  const team = room.teams[room.currentHighestBidderTeamId];
  if (!team) return false;
  const player = room.currentPlayer;
  const price = room.currentBid;

  team.remainingPurse = round2(team.remainingPurse - price);
  team.squadSize += 1;
  if (player.isOverseas) team.overseasCount += 1;

  const record = {
    playerId: player.id,
    playerName: player.name,
    playerRole: player.role,
    isOverseas: player.isOverseas,
    basePrice: player.basePrice,
    soldPrice: price,
    soldAt: iso(now),
    bidCount: room.recentBids.filter((b) => b.playerId === player.id).length,
  };
  team.playersBought.push(record);
  room.soldPlayers[player.id] = record;
  if (!room.auctionedPlayerIds.includes(player.id)) room.auctionedPlayerIds.push(player.id);

  room.status = 'SOLD';
  room.lastSoldEvent = { player, team, price, timestamp: iso(now) };
  scheduleAdvance(room, now);
  return true;
}

export function markUnsold(room: AuctionRoomState, now: number, advance = true): boolean {
  if (room.status !== 'BIDDING' || !room.currentPlayer) return false;
  const player = room.currentPlayer;
  if (!room.unsoldPlayerIds.includes(player.id)) room.unsoldPlayerIds.push(player.id);
  if (!room.auctionedPlayerIds.includes(player.id)) room.auctionedPlayerIds.push(player.id);
  room.status = 'UNSOLD';
  room.lastUnsoldEvent = { player, timestamp: iso(now) };
  if (advance) scheduleAdvance(room, now);
  else clearClock(room);
  return true;
}

// The lot's time is up: sold to the leader, otherwise unsold.
export function expireLot(room: AuctionRoomState, now: number): boolean {
  if (room.status !== 'BIDDING') return false;
  return room.currentHighestBidderTeamId ? sellCurrent(room, now) : markUnsold(room, now);
}

// Acts on whichever deadline has passed. Returns true if the room changed.
export function tick(room: AuctionRoomState, now: number, random: () => number = Math.random): boolean {
  if (biddingClosed(room, now)) return expireLot(room, now);
  if ((room.status === 'SOLD' || room.status === 'UNSOLD') && room.nextPlayerAt && now >= ms(room.nextPlayerAt)) {
    openNextLot(room, now, random);
    return true;
  }
  return false;
}

export function startAuction(room: AuctionRoomState, now: number, random: () => number = Math.random): boolean {
  if (room.status !== 'LOBBY' && room.status !== 'READY') return false;
  room.currentAuctionIndex = 0;
  openNextLot(room, now, random);
  return true;
}

// Manual "next player". Skipping a live lot counts as unsold so the player isn't lost.
export function advance(room: AuctionRoomState, now: number, random: () => number = Math.random): boolean {
  if (room.status === 'BIDDING') markUnsold(room, now, false);
  if (room.status !== 'SOLD' && room.status !== 'UNSOLD') return false;
  openNextLot(room, now, random);
  return true;
}

export function recordBidOnClock(room: AuctionRoomState, now: number) {
  if (lotSeconds(room) > 0) armBidClock(room, now);
}

export function pause(room: AuctionRoomState, now: number): boolean {
  if (room.status === 'BIDDING') {
    room.pausedRemainingMs = room.bidEndsAt ? Math.max(0, ms(room.bidEndsAt) - now) : null;
    room.bidEndsAt = null;
    room.status = 'PAUSED';
    return true;
  }
  if ((room.status === 'SOLD' || room.status === 'UNSOLD') && room.nextPlayerAt) {
    room.pausedRemainingMs = Math.max(0, ms(room.nextPlayerAt) - now);
    room.nextPlayerAt = null;
    return true;
  }
  return false;
}

export function resume(room: AuctionRoomState, now: number): boolean {
  if (room.status === 'PAUSED') {
    room.status = 'BIDDING';
    if (lotSeconds(room) > 0) {
      const left = room.pausedRemainingMs ?? lotSeconds(room) * 1000;
      room.bidEndsAt = iso(now + Math.max(left, RESUME_GRACE_MS));
    }
    room.pausedRemainingMs = null;
    return true;
  }
  if ((room.status === 'SOLD' || room.status === 'UNSOLD') && room.pausedRemainingMs !== null) {
    room.nextPlayerAt = room.settings.autoAdvance ? iso(now + Math.max(room.pausedRemainingMs, 1500)) : null;
    room.pausedRemainingMs = null;
    return true;
  }
  return false;
}

export function extendClock(room: AuctionRoomState, seconds: unknown, now: number): boolean {
  const add = Math.min(60, Math.max(1, Math.round(Number(seconds) || 0))) * 1000;
  if (room.status === 'BIDDING' && room.bidEndsAt) {
    room.bidEndsAt = iso(Math.max(ms(room.bidEndsAt), now) + add);
    return true;
  }
  if (room.pausedRemainingMs !== null && (room.status === 'PAUSED' || room.status === 'SOLD' || room.status === 'UNSOLD')) {
    room.pausedRemainingMs += add;
    return true;
  }
  if ((room.status === 'SOLD' || room.status === 'UNSOLD') && room.nextPlayerAt) {
    room.nextPlayerAt = iso(Math.max(ms(room.nextPlayerAt), now) + add);
    return true;
  }
  return false;
}

export type ClockSettingsPatch = Partial<Pick<AuctionSettings, 'bidTimerSeconds' | 'autoAdvance' | 'autoAdvanceDelaySeconds'>>;

export function updateClockSettings(room: AuctionRoomState, patch: ClockSettingsPatch, now: number): boolean {
  if (!patch || typeof patch !== 'object') return false;
  const s = room.settings;
  let changed = false;

  if (patch.bidTimerSeconds !== undefined) {
    const next = clampTimer(patch.bidTimerSeconds);
    if (next !== s.bidTimerSeconds) {
      s.bidTimerSeconds = next;
      changed = true;
      // Apply to the lot in play: off clears the clock, on/changed restarts it.
      if (room.status === 'BIDDING') armBidClock(room, now);
      if (room.status === 'PAUSED') room.pausedRemainingMs = next > 0 ? lotSeconds(room) * 1000 : null;
    }
  }
  if (patch.autoAdvanceDelaySeconds !== undefined) {
    const next = clampDelay(patch.autoAdvanceDelaySeconds);
    if (next !== s.autoAdvanceDelaySeconds) {
      s.autoAdvanceDelaySeconds = next;
      changed = true;
    }
  }
  if (typeof patch.autoAdvance === 'boolean' && patch.autoAdvance !== s.autoAdvance) {
    s.autoAdvance = patch.autoAdvance;
    changed = true;
    if (room.status === 'SOLD' || room.status === 'UNSOLD') {
      if (!s.autoAdvance) {
        room.nextPlayerAt = null;
        room.pausedRemainingMs = null;
      } else if (!room.nextPlayerAt && room.pausedRemainingMs === null) {
        room.nextPlayerAt = iso(now + s.autoAdvanceDelaySeconds * 1000);
      }
    }
  }
  return changed;
}

// Reverses the sale of the player on stage: refund, squad counts, back to BIDDING.
export function undoLastSale(room: AuctionRoomState, now: number): boolean {
  const sale = room.lastSoldEvent;
  if (room.status !== 'SOLD' || !sale || !room.currentPlayer || sale.player.id !== room.currentPlayer.id) return false;
  const team = room.teams[sale.team.id];
  const playerId = sale.player.id;
  if (team) {
    team.remainingPurse = round2(team.remainingPurse + sale.price);
    team.squadSize = Math.max(0, team.squadSize - 1);
    if (sale.player.isOverseas) team.overseasCount = Math.max(0, team.overseasCount - 1);
    const idx = team.playersBought.map((b) => b.playerId).lastIndexOf(playerId);
    if (idx >= 0) team.playersBought.splice(idx, 1);
  }
  delete room.soldPlayers[playerId];
  room.auctionedPlayerIds = room.auctionedPlayerIds.filter((id) => id !== playerId);
  delete room.lastSoldEvent;
  room.status = 'BIDDING';
  room.currentBid = sale.price;
  room.currentHighestBidderTeamId = team ? team.id : null;
  room.nextPlayerAt = null;
  armBidClock(room, now);
  return true;
}

export function endAuction(room: AuctionRoomState, now: number) {
  completeAuction(room, now);
}
