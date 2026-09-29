import { AuctionRoomState, AuctionSet, AuctionSettings, Player, PlayerCategory } from '../types';
import { ALL_PLAYERS, PLAYERS_BY_CATEGORY, PLAYERS_BY_ID } from '../data/players';
import { BID_LOCK_MS } from '../utils/format';

/*
  Auction state transitions, shared by server.ts and the tests.

  Every function mutates the room it is given and takes `now` (ms) so timing can
  be tested without real timers. server.ts owns the setTimeouts: after any change
  it calls nextDeadline(room) and, when that time comes, tick(room, now).

  Lot rules
   - A new player comes up as PLAYER_PRESENTED: on every screen, bids refused.
     Phones report when the player has loaded (lotLoadedBy) and the auctioneer
     opens bidding with openBidding.
   - There is no lot clock. The auctioneer calls Sold or Unsold.
   - Every accepted bid locks bidding for BID_LOCK_MS (bidLockedUntil), so the room
     sees the new price before anyone can answer it.
   - After SOLD / UNSOLD with autoAdvance on, nextPlayerAt = now + delay.
   - PAUSE while BIDDING: status PAUSED until RESUME.
   - PAUSE while SOLD / UNSOLD "holds" the auto-advance: status stays SOLD / UNSOLD
     (so the sold moment stays on screen), nextPlayerAt becomes null and the time
     left goes to pausedRemainingMs. RESUME releases it.
   - The ACCELERATED round re-offers unsold players once.
*/

export const DEFAULT_SETTINGS: Pick<AuctionSettings, 'autoAdvance' | 'autoAdvanceDelaySeconds' | 'reauctionUnsold'> = {
  autoAdvance: true,
  autoAdvanceDelaySeconds: 5,
  reauctionUnsold: true,
};

export const DEFAULT_CATEGORIES: PlayerCategory[] = ['MARQUEE', 'BATSMEN', 'WICKET_KEEPERS', 'ALL_ROUNDERS', 'BOWLERS'];
// Average players per set; the number of rounds is picked from it (see buildAuctionSets).
const SET_TARGET_SIZE = 8;

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (value: string | null | undefined) => (value ? Date.parse(value) : NaN);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Settings ───────────────────────────────────────────────────────────────

export function clampDelay(seconds: unknown): number {
  const n = Math.round(Number(seconds));
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.autoAdvanceDelaySeconds;
  return Math.min(30, Math.max(2, n));
}

// Room size: 15 when asked for, otherwise the classic 10 (rooms saved before the option).
export function clampTeams(value: unknown): number {
  return Number(value) === 15 ? 15 : 10;
}

// Fills fields added after a room was saved, and drops the retired lot clock.
export function normalizeRoom(room: AuctionRoomState): AuctionRoomState {
  const s = room.settings as AuctionSettings & { bidTimerSeconds?: number };
  delete s.bidTimerSeconds;
  if (typeof s.autoAdvance !== 'boolean') s.autoAdvance = false;
  if (typeof s.autoAdvanceDelaySeconds !== 'number') s.autoAdvanceDelaySeconds = DEFAULT_SETTINGS.autoAdvanceDelaySeconds;
  if (typeof s.reauctionUnsold !== 'boolean') s.reauctionUnsold = false;
  s.maxTeams = clampTeams(s.maxTeams);
  delete (room as AuctionRoomState & { bidEndsAt?: unknown }).bidEndsAt;
  if (room.status === 'PAUSED') room.pausedRemainingMs = null;
  if (room.pausedRemainingMs === undefined) room.pausedRemainingMs = null;
  if (room.nextPlayerAt === undefined) room.nextPlayerAt = null;
  if (room.bidLockedUntil === undefined) room.bidLockedUntil = null;
  if (!room.lotLoadedBy) room.lotLoadedBy = [];
  if (!room.kickedParticipantIds) room.kickedParticipantIds = [];
  if (!room.round) room.round = 'MAIN';
  if (!room.playingXIs) room.playingXIs = {};
  if (!room.serverTime) room.serverTime = new Date().toISOString();
  return room;
}

// ─── Player selection ───────────────────────────────────────────────────────

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The MAIN round running order: one marquee set, then a set from each other category in
// turn (Batters, Wicket-keepers, All-rounders, Bowlers by default), round after round.
// Every category is split over the same number of rounds, so set sizes follow the size of
// each pool and all of them run out together. Players are shuffled before the split.
export function buildAuctionSets(order: PlayerCategory[] = DEFAULT_CATEGORIES, random: () => number = Math.random): AuctionSet[] {
  const cats = order.length ? order : DEFAULT_CATEGORIES;
  const rotation = cats.filter((c) => c !== 'MARQUEE');
  const pools = new Map(rotation.map((c) => [c, shuffled(PLAYERS_BY_CATEGORY[c] || [], random).map((p) => p.id)]));
  const rotated = [...pools.values()].reduce((n, ids) => n + ids.length, 0);
  const rounds = Math.max(1, Math.round(rotated / (rotation.length * SET_TARGET_SIZE)));

  const sets: AuctionSet[] = [];
  if (cats.includes('MARQUEE') && PLAYERS_BY_CATEGORY.MARQUEE?.length) {
    sets.push({ category: 'MARQUEE', number: 1, playerIds: shuffled(PLAYERS_BY_CATEGORY.MARQUEE, random).map((p) => p.id) });
  }
  const numbers = new Map<PlayerCategory, number>();
  for (let r = 0; r < rounds; r++) {
    for (const cat of rotation) {
      const ids = pools.get(cat)!;
      const playerIds = ids.slice(Math.floor((r * ids.length) / rounds), Math.floor(((r + 1) * ids.length) / rounds));
      if (!playerIds.length) continue;
      const number = (numbers.get(cat) ?? 0) + 1;
      numbers.set(cat, number);
      sets.push({ category: cat, number, playerIds });
    }
  }
  return sets;
}

// Picks the next player. Main round: set by set (see buildAuctionSets), drawn on first use.
// When the main pool is empty, starts the accelerated round of unsold players (once).
export function pickNextPlayer(room: AuctionRoomState, random: () => number = Math.random): Player | null {
  if (room.round === 'MAIN') {
    const done = new Set(room.auctionedPlayerIds);
    if (!room.auctionSets) room.auctionSets = buildAuctionSets(room.settings.categoriesOrder, random);
    for (const set of room.auctionSets) {
      const id = set.playerIds.find((pid) => !done.has(pid) && PLAYERS_BY_ID[pid]);
      if (id) {
        room.currentSet = { category: set.category, number: set.number };
        return PLAYERS_BY_ID[id];
      }
    }
    // Players added to the pool after the sets were drawn.
    room.currentSet = null;
    const rest = ALL_PLAYERS.filter((p) => !done.has(p.id));
    if (rest.length) return rest[Math.floor(random() * rest.length)];

    if (!room.settings.reauctionUnsold || room.unsoldPlayerIds.length === 0) return null;
    room.round = 'ACCELERATED';
    room.accelerationQueue = [...room.unsoldPlayerIds];
    room.unsoldPlayerIds = [];
    room.totalPlayersInPool += room.accelerationQueue.length;
  }

  room.currentSet = null;
  const queue = room.accelerationQueue ?? [];
  while (queue.length) {
    const next = PLAYERS_BY_ID[queue.shift()!];
    if (next && !room.soldPlayers[next.id]) return next;
  }
  return null;
}

// ─── Timing helpers ─────────────────────────────────────────────────────────

function scheduleAdvance(room: AuctionRoomState, now: number) {
  room.bidLockedUntil = null;
  room.pausedRemainingMs = null;
  room.nextPlayerAt = room.settings.autoAdvance ? iso(now + room.settings.autoAdvanceDelaySeconds * 1000) : null;
}

export function clearClock(room: AuctionRoomState) {
  room.nextPlayerAt = null;
  room.pausedRemainingMs = null;
  room.bidLockedUntil = null;
}

// The next moment the server has to act on this room, or null.
export function nextDeadline(room: AuctionRoomState): number | null {
  if ((room.status === 'SOLD' || room.status === 'UNSOLD') && room.nextPlayerAt) return ms(room.nextPlayerAt);
  return null;
}

// Milliseconds until bids are accepted again after the last one (0 = open).
export function bidLockRemaining(room: AuctionRoomState, now: number): number {
  const until = ms(room.bidLockedUntil);
  return Number.isFinite(until) ? Math.max(0, until - now) : 0;
}

// Called for every accepted bid.
export function lockBidding(room: AuctionRoomState, now: number) {
  room.bidLockedUntil = iso(now + BID_LOCK_MS);
}

// ─── Transitions ────────────────────────────────────────────────────────────

function completeAuction(room: AuctionRoomState, now: number) {
  room.status = 'COMPLETED';
  room.completedAt = iso(now);
  room.currentPlayer = null;
  room.currentSet = null;
  room.currentHighestBidderTeamId = null;
  room.currentBid = 0;
  room.lotLoadedBy = [];
  clearClock(room);
}

// Brings up the next player (or completes the auction). The lot opens locked:
// the auctioneer starts the bidding. Returns the new player.
export function openNextLot(room: AuctionRoomState, now: number, random: () => number = Math.random): Player | null {
  const next = pickNextPlayer(room, random);
  delete room.lastSoldEvent;
  delete room.lastUnsoldEvent;
  if (!next) {
    completeAuction(room, now);
    return null;
  }
  room.status = 'PLAYER_PRESENTED';
  room.currentPlayer = next;
  room.currentBid = next.basePrice;
  room.currentHighestBidderTeamId = null;
  room.currentBidVersion++;
  room.recentBids = [];
  room.currentAuctionIndex++;
  room.lotLoadedBy = [];
  clearClock(room);
  return next;
}

export function openBidding(room: AuctionRoomState): boolean {
  if (room.status !== 'PLAYER_PRESENTED' || !room.currentPlayer) return false;
  room.status = 'BIDDING';
  room.bidLockedUntil = null;
  return true;
}

// A team owner's phone has the player on stage loaded.
export function markLotLoaded(room: AuctionRoomState, participantId: string, playerId: unknown): boolean {
  const participant = room.participants[participantId];
  if (!participant?.teamId || !room.currentPlayer || room.currentPlayer.id !== playerId) return false;
  if (room.lotLoadedBy.includes(participantId)) return false;
  room.lotLoadedBy.push(participantId);
  return true;
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

// Also allowed before bidding opens, to pass on a player nobody wants.
export function markUnsold(room: AuctionRoomState, now: number, advance = true): boolean {
  if ((room.status !== 'BIDDING' && room.status !== 'PLAYER_PRESENTED') || !room.currentPlayer) return false;
  const player = room.currentPlayer;
  if (!room.unsoldPlayerIds.includes(player.id)) room.unsoldPlayerIds.push(player.id);
  if (!room.auctionedPlayerIds.includes(player.id)) room.auctionedPlayerIds.push(player.id);
  room.status = 'UNSOLD';
  room.lastUnsoldEvent = { player, timestamp: iso(now) };
  if (advance) scheduleAdvance(room, now);
  else clearClock(room);
  return true;
}

// Acts on the auto-advance once it is due. Returns true if the room changed.
export function tick(room: AuctionRoomState, now: number, random: () => number = Math.random): boolean {
  if ((room.status === 'SOLD' || room.status === 'UNSOLD') && room.nextPlayerAt && now >= ms(room.nextPlayerAt)) {
    openNextLot(room, now, random);
    return true;
  }
  return false;
}

export function startAuction(room: AuctionRoomState, now: number, random: () => number = Math.random): boolean {
  if (room.status !== 'LOBBY' && room.status !== 'READY') return false;
  room.currentAuctionIndex = 0;
  room.auctionSets = buildAuctionSets(room.settings.categoriesOrder, random);
  openNextLot(room, now, random);
  return true;
}

// Manual "next player". Skipping a live lot counts as unsold so the player isn't lost.
export function advance(room: AuctionRoomState, now: number, random: () => number = Math.random): boolean {
  if (room.status === 'BIDDING' || room.status === 'PLAYER_PRESENTED') markUnsold(room, now, false);
  if (room.status !== 'SOLD' && room.status !== 'UNSOLD') return false;
  openNextLot(room, now, random);
  return true;
}

export function pause(room: AuctionRoomState, now: number): boolean {
  if (room.status === 'BIDDING') {
    room.status = 'PAUSED';
    room.bidLockedUntil = null;
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

export type ClockSettingsPatch = Partial<Pick<AuctionSettings, 'autoAdvance' | 'autoAdvanceDelaySeconds'>>;

export function updateClockSettings(room: AuctionRoomState, patch: ClockSettingsPatch, now: number): boolean {
  if (!patch || typeof patch !== 'object') return false;
  const s = room.settings;
  let changed = false;

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
  clearClock(room);
  return true;
}

// Removes a team owner and their team from the room.
//  - Players they bought go back to the pool as unsold (re-offered in the accelerated round).
//  - If they lead the lot in play, the price falls back to the best bid from a team still here.
//  - If the player on the SOLD screen went to them, that lot becomes unsold.
// The participant id is remembered so their phone is turned away if it reconnects.
export function removeParticipant(room: AuctionRoomState, participantId: string, now: number): boolean {
  const participant = room.participants[participantId];
  if (!participant || participant.role !== 'PARTICIPANT' || participantId === room.auctioneerId) return false;
  const team = participant.teamId ? room.teams[participant.teamId] : undefined;

  if (team) {
    for (const bought of team.playersBought) {
      delete room.soldPlayers[bought.playerId];
      if (room.round === 'ACCELERATED') {
        room.accelerationQueue = [...(room.accelerationQueue ?? []), bought.playerId];
        room.totalPlayersInPool++;
      } else if (!room.unsoldPlayerIds.includes(bought.playerId)) {
        room.unsoldPlayerIds.push(bought.playerId);
      }
    }

    if (room.status === 'SOLD' && room.lastSoldEvent?.team.id === team.id) {
      room.lastUnsoldEvent = { player: room.lastSoldEvent.player, timestamp: iso(now) };
      delete room.lastSoldEvent;
      room.status = 'UNSOLD';
    }

    const player = room.currentPlayer;
    if (player) {
      room.recentBids = room.recentBids.filter((b) => !(b.playerId === player.id && b.teamId === team.id));
      if (room.currentHighestBidderTeamId === team.id) {
        // recentBids is newest first.
        const best = room.recentBids.find((b) => b.playerId === player.id && room.teams[b.teamId]);
        room.currentBid = best ? best.amount : player.basePrice;
        room.currentHighestBidderTeamId = best ? best.teamId : null;
        room.currentBidVersion++;
        room.bidLockedUntil = null;
      }
    }

    delete room.playingXIs[team.id];
    delete room.teams[team.id];
  }

  delete room.participants[participantId];
  room.lotLoadedBy = room.lotLoadedBy.filter((id) => id !== participantId);
  if (!room.kickedParticipantIds.includes(participantId)) room.kickedParticipantIds.push(participantId);
  return true;
}

export function endAuction(room: AuctionRoomState, now: number) {
  completeAuction(room, now);
}
