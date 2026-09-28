import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';

// Load environment variables (.env.local has priority, then .env)
['.env.local', '.env'].forEach(file => {
  if (fs.existsSync(file)) {
    dotenv.config({ path: file });
  }
});
import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from '@supabase/supabase-js';
import {
  AuctionRoomState,
  AuctionSettings,
  Player,
  PlayerCategory,
  RoomParticipant,
  Team,
  Bid,
  AuctionEvent,
  ChatMessage,
  PlayingXIDraft,
  WSMessage,
} from './src/types';
import { ALL_PLAYERS, PLAYERS_BY_CATEGORY, PLAYERS_BY_ID } from './src/data/players';
import { calculateNextLegalBid } from './src/utils/format';
import {
  DEFAULT_SETTINGS,
  advance,
  biddingClosed,
  clampDelay,
  clampTimer,
  endAuction,
  extendClock,
  markUnsold,
  nextDeadline,
  normalizeRoom,
  pause,
  recordBidOnClock,
  resume,
  sellCurrent,
  startAuction,
  tick,
  undoLastSale,
  updateClockSettings,
} from './src/services/auctionEngine';
import { playingXIErrors } from './src/services/playingXIRules';
import { cricketDataProvider } from './src/services/cricketDataProvider';
import { PlayerImageProvider } from './src/services/imageProvider';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// -----------------------------------------------------------------------------
// Supabase Database Integration (Server-Authoritative Persistence)
// -----------------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

async function syncRoomToSupabase(room: AuctionRoomState) {
  if (!supabase) return;
  try {
    await supabase.from('auction_rooms').upsert({
      id: room.id,
      name: room.name,
      status: room.status,
      auctioneer_id: room.auctioneerId,
      auctioneer_name: room.auctioneerName,
      version: room.eventSequenceNumber,
      updated_at: new Date().toISOString(),
    });
  } catch (_) {}
}

async function syncBidToSupabase(room: AuctionRoomState, bid: Bid) {
  if (!supabase) return;
  try {
    await supabase.from('bids').insert({
      id: bid.id,
      auction_session_id: room.id,
      player_id: bid.playerId,
      team_id: bid.teamId,
      bidder_participant_id: bid.bidderParticipantId,
      amount: bid.amount,
      bid_version: bid.bidVersion,
      is_valid: true,
      timestamp: bid.timestamp,
    });
  } catch (_) {}
}

// -----------------------------------------------------------------------------
// Room Code Generation Engine (Short, Human-Friendly, Unambiguous)
// -----------------------------------------------------------------------------
// Excludes confusing characters (O/0, I/1, S/5, B/8)
const ROOM_CODE_CHARS = 'ACDEFGHJKLMNPQRTUVWXYZ234679';

function generateUniqueRoomCode(): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    const exists = Object.values(rooms).some(r => r.roomCode?.toUpperCase() === code);
    if (!exists) return code;
  }
  return 'AX' + Math.random().toString(36).substring(2, 6).toUpperCase();
}

// In-Memory Database with Snapshot Persistence
const rooms: Record<string, AuctionRoomState> = {};
const roomSockets: Record<string, Set<WebSocket>> = {};
const socketMeta = new WeakMap<WebSocket, { roomId: string; participantId: string }>();

// STATE_FILE lets a deploy put the snapshot on a mounted volume (e.g. /data/...).
const STORAGE_FILE = path.resolve(process.env.STATE_FILE || '.auction_rooms_state.json');
try {
  fs.mkdirSync(path.dirname(STORAGE_FILE), { recursive: true });
} catch (_) {}

// Restore persisted state on start if available
if (fs.existsSync(STORAGE_FILE)) {
  try {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    Object.assign(rooms, data);
  } catch (_) {}
}

// Ensure every room has an unambiguous roomCode, and the clock/XI fields added later.
Object.values(rooms).forEach(r => {
  if (!r.roomCode) {
    r.roomCode = generateUniqueRoomCode();
  }
  normalizeRoom(r);
});

function persistState() {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(rooms, null, 2), 'utf-8');
  } catch (_) {}
}

export function findRoom(idOrCode: string): AuctionRoomState | undefined {
  if (!idOrCode) return undefined;
  if (rooms[idOrCode]) return rooms[idOrCode];
  const upper = idOrCode.trim().toUpperCase();
  return Object.values(rooms).find(
    r => r.roomCode?.toUpperCase() === upper || r.id.toLowerCase() === idOrCode.toLowerCase()
  );
}

// Stamp the server clock on outgoing room state so clients can correct for skew
// when counting down bidEndsAt / nextPlayerAt.
function stamp(room: AuctionRoomState): AuctionRoomState {
  room.serverTime = new Date().toISOString();
  return room;
}

function broadcastToRoom(roomId: string, message: WSMessage) {
  const sockets = roomSockets[roomId];
  if (!sockets) return;
  if (message.type === 'ROOM_STATE' && message.payload) stamp(message.payload);
  const payload = JSON.stringify(message);
  for (const client of sockets) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// -----------------------------------------------------------------------------
// Auction clock: one timeout per room, always aimed at the room's next deadline
// (lot closing or auto-advance). State transitions live in src/services/auctionEngine.ts.
// -----------------------------------------------------------------------------
const roomTimers = new Map<string, NodeJS.Timeout>();

function broadcastRoom(room: AuctionRoomState) {
  broadcastToRoom(room.id, { type: 'ROOM_STATE', roomId: room.id, payload: room, timestamp: new Date().toISOString() });
}

function scheduleRoom(room: AuctionRoomState) {
  const existing = roomTimers.get(room.id);
  if (existing) clearTimeout(existing);
  roomTimers.delete(room.id);
  const deadline = nextDeadline(room);
  if (deadline === null) return;
  // Cap the wait so a far-off deadline never overflows setTimeout; it re-checks on wake.
  const delay = Math.min(Math.max(0, deadline - Date.now()), 60_000);
  roomTimers.set(
    room.id,
    setTimeout(() => {
      roomTimers.delete(room.id);
      const current = rooms[room.id];
      if (!current) return;
      if (tick(current, Date.now())) {
        commit(current);
        if (current.status === 'SOLD' || current.status === 'COMPLETED') syncRoomToSupabase(current);
      } else {
        scheduleRoom(current);
      }
    }, delay),
  );
}

// Persist, broadcast and re-aim the clock after any change to a room.
function commit(room: AuctionRoomState) {
  room.eventSequenceNumber++;
  persistState();
  broadcastRoom(room);
  scheduleRoom(room);
}

// -----------------------------------------------------------------------------
// REST Endpoints
// -----------------------------------------------------------------------------
// Cheap liveness probe for the hosting platform (no provider calls).
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: Object.keys(rooms).length, uptime: Math.round(process.uptime()) });
});

app.get('/api/health', async (_req, res) => {
  const health = await cricketDataProvider.getHealthReport();
  const dbConnected = !!supabase;

  res.json({
    appStatus: 'ok',
    roomsActive: Object.keys(rooms).length,
    database: dbConnected ? 'Connected (Supabase)' : 'Connected (Local Persistence)',
    cricketApi: health.apiConfigured ? 'Connected (Sportmonks)' : 'Connected (Cached 350 Snapshot)',
    playerImageApi: 'Local photo library (IPL squads + Wikipedia, npm run sync:images)',
    ...health,
  });
});

app.get('/api/players/health', async (_req, res) => {
  const health = await cricketDataProvider.getHealthReport();
  res.json({
    appStatus: 'ok',
    roomsActive: Object.keys(rooms).length,
    ...health,
  });
});

// Secure Server-Side Player Image Proxy
app.get('/api/players/:playerId/image', (req, res) => {
  const { playerId } = req.params;
  const player = PLAYERS_BY_ID[playerId];
  if (!player) {
    return res.status(404).send('Player not found');
  }

  const meta = PlayerImageProvider.getPlayerImageMetadata(player.id, player.role, player.name);
  if (meta.imageUrl.startsWith('data:image/svg+xml;utf8,')) {
    const svg = decodeURIComponent(meta.imageUrl.replace('data:image/svg+xml;utf8,', ''));
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    return res.send(svg);
  }

  res.redirect(302, meta.imageUrl);
});

app.get('/api/players', (req, res) => {
  const { query, category, role } = req.query as { query?: string; category?: string; role?: string };
  let result = ALL_PLAYERS;
  if (query) {
    const q = query.toLowerCase();
    result = result.filter(p => p.name.toLowerCase().includes(q) || p.shortName.toLowerCase().includes(q));
  }
  if (category && category !== 'ALL') {
    result = result.filter(p => p.category === category);
  }
  if (role && role !== 'ALL') {
    result = result.filter(p => p.role === role);
  }
  res.json({ count: result.length, players: result });
});

app.get('/api/rooms', (_req, res) => {
  const publicRooms = Object.values(rooms)
    .filter(r => r.settings.isPublic)
    .map(r => {
      const teamsArr = Object.values(r.teams || {});
      const totalSpent = teamsArr.reduce((sum, t) => sum + (t.startingPurse - t.remainingPurse), 0);
      return {
        id: r.id,
        roomCode: r.roomCode,
        name: r.name,
        status: r.status,
        auctioneerName: r.auctioneerName,
        teamsCount: teamsArr.length,
        soldCount: Object.keys(r.soldPlayers || {}).length,
        totalSpent: Math.round(totalSpent * 100) / 100,
        createdAt: r.createdAt,
        completedAt: r.completedAt || null,
      };    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(publicRooms);
});

app.post('/api/rooms', async (req, res) => {
  const { name, auctioneerName, settings } = req.body;
  if (!name || !auctioneerName) {
    return res.status(400).json({ error: 'Auction name and Auctioneer name are required' });
  }

  const roomId = 'ipl-' + Math.random().toString(36).substring(2, 9);
  const roomCode = generateUniqueRoomCode();
  const auctioneerId = 'user-' + Math.random().toString(36).substring(2, 9);

  const defaultSettings: AuctionSettings = {
    startingPurse: settings?.startingPurse || 120,
    maxSquadSize: settings?.maxSquadSize || 18,
    maxOverseas: 8,
    incrementTiers: [
      { minPrice: 0, maxPrice: 5, increment: 0.2 },
      { minPrice: 5, maxPrice: 10, increment: 0.25 },
      { minPrice: 10, maxPrice: 20, increment: 0.5 },
      { minPrice: 20, maxPrice: 999, increment: 1.0 },
    ],
    categoriesOrder: ['MARQUEE', 'BATSMEN', 'ALL_ROUNDERS', 'BOWLERS', 'WICKET_KEEPERS'],
    isPublic: settings?.isPublic !== false,
    bidTimerSeconds: settings?.bidTimerSeconds === undefined ? DEFAULT_SETTINGS.bidTimerSeconds : clampTimer(settings.bidTimerSeconds),
    autoAdvance: typeof settings?.autoAdvance === 'boolean' ? settings.autoAdvance : DEFAULT_SETTINGS.autoAdvance,
    autoAdvanceDelaySeconds:
      settings?.autoAdvanceDelaySeconds === undefined ? DEFAULT_SETTINGS.autoAdvanceDelaySeconds : clampDelay(settings.autoAdvanceDelaySeconds),
    reauctionUnsold: typeof settings?.reauctionUnsold === 'boolean' ? settings.reauctionUnsold : DEFAULT_SETTINGS.reauctionUnsold,
  };

  const newRoom: AuctionRoomState = {
    id: roomId,
    roomCode,
    name,
    status: 'LOBBY',
    auctioneerId,
    auctioneerName,
    settings: defaultSettings,
    participants: {
      [auctioneerId]: {
        id: auctioneerId,
        displayName: auctioneerName,
        role: 'AUCTIONEER',
        teamId: null, // Auctioneer is NEVER a team
        connected: false,
        joinedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      },
    },
    teams: {},
    currentAuctionIndex: 0,
    totalPlayersInPool: ALL_PLAYERS.length,
    currentPlayer: null,
    currentBid: 0,
    currentHighestBidderTeamId: null,
    currentBidVersion: 0,
    recentBids: [],
    auctionedPlayerIds: [],
    soldPlayers: {},
    unsoldPlayerIds: [],
    eventSequenceNumber: 1,
    createdAt: new Date().toISOString(),
    bidEndsAt: null,
    pausedRemainingMs: null,
    nextPlayerAt: null,
    serverTime: new Date().toISOString(),
    round: 'MAIN',
    playingXIs: {},
  };

  rooms[roomId] = newRoom;
  persistState();
  syncRoomToSupabase(newRoom);

  res.json({
    roomId,
    roomCode,
    auctioneerId,
    room: newRoom,
  });
});

// Lookup by code endpoint
app.get('/api/rooms/code/:code', (req, res) => {
  const room = findRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ error: 'Auction room not found' });
  }
  res.json(stamp(room));
});

// Lookup by ID or code endpoint
app.get('/api/rooms/:roomId', (req, res) => {
  const room = findRoom(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Auction room not found' });
  }
  res.json(stamp(room));
});

app.post('/api/rooms/:roomId/join', (req, res) => {
  const room = findRoom(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Auction room not found' });
  }

  const roomId = room.id;
  const { displayName, teamName, teamShortName, logoUrl, color } = req.body;

  if (room.status !== 'LOBBY' && room.status !== 'READY') {
    return res.status(400).json({ error: 'Auction has already commenced. Registration closed.' });
  }

  const existingTeams = Object.values(room.teams);
  if (existingTeams.length >= 10) {
    return res.status(400).json({ error: 'Maximum participant limit (10 teams) reached for this auction room' });
  }

  const normalizedTeam = teamName?.trim().toLowerCase();
  const normalizedShort = teamShortName?.trim().toLowerCase();

  if (existingTeams.some(t => t.name.toLowerCase() === normalizedTeam)) {
    return res.status(400).json({ error: 'Team name already registered in this room. Please choose a unique team name.' });
  }

  if (existingTeams.some(t => t.shortName.toLowerCase() === normalizedShort)) {
    return res.status(400).json({ error: 'Team abbreviation already in use in this room.' });
  }

  const participantId = 'user-' + Math.random().toString(36).substring(2, 9);
  const teamId = 'team-' + Math.random().toString(36).substring(2, 9);

  const newTeam: Team = {
    id: teamId,
    name: teamName.trim(),
    shortName: teamShortName.trim().toUpperCase(),
    logoUrl,
    color: color || '#3b82f6',
    ownerParticipantId: participantId,
    startingPurse: room.settings.startingPurse,
    remainingPurse: room.settings.startingPurse,
    squadSize: 0,
    overseasCount: 0,
    playersBought: [],
  };

  const newParticipant: RoomParticipant = {
    id: participantId,
    displayName: (displayName || teamName).trim(),
    role: 'PARTICIPANT',
    teamId,
    connected: true,
    joinedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  room.teams[teamId] = newTeam;
  room.participants[participantId] = newParticipant;
  room.eventSequenceNumber++;
  persistState();

  broadcastToRoom(roomId, {
    type: 'ROOM_STATE',
    roomId,
    payload: room,
    timestamp: new Date().toISOString(),
  });

  res.json({
    participantId,
    teamId,
    roomId: room.id,
    roomCode: room.roomCode,
    room,
  });
});

// -----------------------------------------------------------------------------
// WebSocket Server for Ultra Low-Latency Real-Time Auction Synchronization
// -----------------------------------------------------------------------------
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const msg: WSMessage = JSON.parse(raw.toString());
      const { type, roomId: rawRoomId, participantId, payload } = msg;

      // Keep-alive from clients. Answer before the room lookup: it used to fall
      // through to "Invalid room ID" and flash an error on every screen each 15s.
      if (type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
        return;
      }

      const room = findRoom(rawRoomId ?? '');
      if (!rawRoomId || !room) {
        ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Invalid room ID or code' } }));
        return;
      }

      const roomId = room.id; // Canonical roomId for socket grouping

      // Track socket connection
      if (type === 'AUTH_JOIN') {
        if (!roomSockets[roomId]) {
          roomSockets[roomId] = new Set();
        }
        roomSockets[roomId].add(ws);
        socketMeta.set(ws, { roomId, participantId: participantId || 'anon' });

        if (participantId && room.participants[participantId]) {
          room.participants[participantId].connected = true;
          room.participants[participantId].lastActiveAt = new Date().toISOString();
        }

        ws.send(
          JSON.stringify({
            type: 'ROOM_STATE',
            roomId,
            payload: stamp(room),
            timestamp: new Date().toISOString(),
          })
        );

        broadcastToRoom(roomId, {
          type: 'ROOM_STATE',
          roomId,
          payload: room,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Team owner: submit / resubmit the Playing XI once the auction is over.
      if (type === 'SUBMIT_PLAYING_XI') {
        const participant = participantId ? room.participants[participantId] : null;
        const team = participant?.teamId ? room.teams[participant.teamId] : null;
        if (!participant || participant.role !== 'PARTICIPANT' || !team) {
          ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Only a team owner can submit a Playing XI.' } }));
          return;
        }
        if (room.status !== 'COMPLETED') {
          ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Playing XIs open once the auction has ended.' } }));
          return;
        }
        const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 30) : []);
        const draft: PlayingXIDraft = {
          playerIds: ids(payload?.playerIds),
          captainId: String(payload?.captainId ?? ''),
          viceCaptainId: String(payload?.viceCaptainId ?? ''),
          wicketKeeperId: String(payload?.wicketKeeperId ?? ''),
          battingOrder: ids(payload?.battingOrder),
          impactSubIds: ids(payload?.impactSubIds),
        };
        const squad = team.playersBought.map(b => PLAYERS_BY_ID[b.playerId]).filter(Boolean);
        const errors = playingXIErrors(draft, squad, PLAYERS_BY_ID);
        if (errors.length) {
          ws.send(JSON.stringify({ type: 'ERROR', payload: { message: errors[0], errors } }));
          return;
        }
        room.playingXIs[team.id] = { ...draft, teamId: team.id, submittedAt: new Date().toISOString() };
        ws.send(JSON.stringify({ type: 'NOTICE', payload: { message: 'Playing XI submitted.' }, timestamp: new Date().toISOString() }));
        commit(room);
        return;
      }

      // Auctioneer-only Actions
      if (
        type === 'START_AUCTION' ||
        type === 'PAUSE_AUCTION' ||
        type === 'RESUME_AUCTION' ||
        type === 'SELL_PLAYER' ||
        type === 'MARK_UNSOLD' ||
        type === 'NEXT_PLAYER' ||
        type === 'END_AUCTION' ||
        type === 'KICK_PARTICIPANT' ||
        type === 'EXTEND_TIMER' ||
        type === 'UPDATE_SETTINGS' ||
        type === 'UNDO_LAST_SALE'
      ) {
        if (participantId !== room.auctioneerId) {
          ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Unauthorized. Only Auctioneer can execute this action.' } }));
          return;
        }

        // If auction is completed, all mutations are locked permanently
        if (room.status === 'COMPLETED') {
          ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'This auction has ended and is permanently finalized.' } }));
          return;
        }

        const now = Date.now();
        let changed = false;
        if (type === 'START_AUCTION') {
          changed = startAuction(room, now);
        } else if (type === 'PAUSE_AUCTION') {
          // BIDDING -> PAUSED; during SOLD / UNSOLD it holds the auto-advance instead.
          changed = pause(room, now);
        } else if (type === 'RESUME_AUCTION') {
          changed = resume(room, now);
        } else if (type === 'SELL_PLAYER') {
          changed = sellCurrent(room, now);
        } else if (type === 'MARK_UNSOLD') {
          changed = markUnsold(room, now);
        } else if (type === 'NEXT_PLAYER') {
          // From SOLD / UNSOLD (cancels the pending auto-advance) or BIDDING (skip counts as unsold).
          changed = advance(room, now);
        } else if (type === 'EXTEND_TIMER') {
          changed = extendClock(room, payload?.seconds, now);
        } else if (type === 'UPDATE_SETTINGS') {
          changed = updateClockSettings(room, payload, now);
        } else if (type === 'UNDO_LAST_SALE') {
          changed = undoLastSale(room, now);
          if (!changed) {
            ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Only the sale of the player on stage can be undone.' } }));
            return;
          }
        } else if (type === 'END_AUCTION') {
          endAuction(room, now);
          changed = true;
        } else if (type === 'KICK_PARTICIPANT') {
          const targetPartId = payload?.participantId;
          if (targetPartId && room.participants[targetPartId]) {
            const p = room.participants[targetPartId];
            if (p.teamId && room.teams[p.teamId]) {
              delete room.teams[p.teamId];
            }
            delete room.participants[targetPartId];
            changed = true;
          }
        }

        if (!changed) return;
        commit(room);
        // Re-read: TS narrowed status above, but the engine may have completed the auction.
        const statusNow: string = room.status;
        if (statusNow === 'SOLD' || statusNow === 'COMPLETED') syncRoomToSupabase(room);
        return;
      }

      // Participant Action: PLACE_BID
      if (type === 'PLACE_BID') {
        if (room.status === 'COMPLETED' || room.status !== 'BIDDING') {
          ws.send(JSON.stringify({ type: 'BID_REJECTED', payload: { reason: 'Auction is not in active bidding state.' } }));
          return;
        }

        // The clock has run out but the close hasn't been processed yet.
        if (biddingClosed(room, Date.now())) {
          ws.send(JSON.stringify({ type: 'BID_REJECTED', payload: { reason: 'Too late: bidding on this player has closed.' } }));
          return;
        }

        const participant = participantId ? room.participants[participantId] : null;
        if (!participant || participant.role !== 'PARTICIPANT' || !participant.teamId) {
          ws.send(JSON.stringify({ type: 'BID_REJECTED', payload: { reason: 'Only registered team owners can bid.' } }));
          return;
        }

        const team = room.teams[participant.teamId];
        if (!team) {
          ws.send(JSON.stringify({ type: 'BID_REJECTED', payload: { reason: 'Team record not found.' } }));
          return;
        }

        // Check if team already holds highest bid
        if (room.currentHighestBidderTeamId === team.id) {
          ws.send(JSON.stringify({ type: 'BID_REJECTED', payload: { reason: 'Your team already holds the highest bid.' } }));
          return;
        }

        const nextLegal = room.currentHighestBidderTeamId ? calculateNextLegalBid(room.currentBid) : room.currentBid;

        // Verify purse
        if (team.remainingPurse < nextLegal) {
          ws.send(JSON.stringify({ type: 'BID_REJECTED', payload: { reason: `Insufficient purse balance (Available: ₹${team.remainingPurse.toFixed(2)} Cr)` } }));
          return;
        }

        // Verify squad size limit
        if (team.squadSize >= room.settings.maxSquadSize) {
          ws.send(JSON.stringify({ type: 'BID_REJECTED', payload: { reason: `Maximum squad size (${room.settings.maxSquadSize} players) reached.` } }));
          return;
        }

        // Verify overseas count limit
        if (room.currentPlayer?.isOverseas && team.overseasCount >= room.settings.maxOverseas) {
          ws.send(JSON.stringify({ type: 'BID_REJECTED', payload: { reason: `Maximum overseas limit (${room.settings.maxOverseas} players) reached for this franchise.` } }));
          return;
        }

        // Ensure minimum 1 Cr reserved for remaining required squad slots
        const slotsRemaining = room.settings.maxSquadSize - team.squadSize - 1;
        const requiredReserve = Math.max(0, slotsRemaining * 0.2); // 20L minimum per slot
        if (team.remainingPurse - nextLegal < requiredReserve && slotsRemaining > 0) {
          ws.send(
            JSON.stringify({
              type: 'BID_REJECTED',
              payload: { reason: `Cannot bid. You must reserve at least ₹${requiredReserve.toFixed(2)} Cr to fill remaining ${slotsRemaining} squad slots.` },
            })
          );
          return;
        }

        // Deduplication & idempotency check
        const incomingRequestId = payload?.requestId;
        if (incomingRequestId && room.recentBids.some(b => (b as any).requestId === incomingRequestId)) {
          return; // Ignore duplicate request
        }

        // Apply Valid Bid
        const newBid: Bid = {
          id: 'bid-' + Math.random().toString(36).substring(2, 9),
          bidVersion: room.currentBidVersion + 1,
          roomId,
          playerId: room.currentPlayer!.id,
          teamId: team.id,
          teamName: team.name,
          teamShortName: team.shortName,
          bidderParticipantId: participant.id,
          bidderDisplayName: participant.displayName,
          amount: nextLegal,
          timestamp: new Date().toISOString(),
        };

        (newBid as any).requestId = incomingRequestId;

        room.currentBid = nextLegal;
        room.currentHighestBidderTeamId = team.id;
        room.currentBidVersion++;
        room.recentBids.unshift(newBid);
        if (room.recentBids.length > 25) {
          room.recentBids.pop();
        }
        // Every accepted bid gives the room a full clock again.
        recordBidOnClock(room, Date.now());

        syncBidToSupabase(room, newBid);
        commit(room);
        return;
      }

      // SEND_CHAT
      if (type === 'SEND_CHAT' && payload?.text) {
        const participant = participantId ? room.participants[participantId] : null;
        const senderName = participant ? participant.displayName : 'Spectator';
        const team = participant?.teamId ? room.teams[participant.teamId] : undefined;

        const chatMsg: ChatMessage = {
          id: 'chat-' + Math.random().toString(36).substring(2, 9),
          roomId,
          senderParticipantId: participantId || 'anon',
          senderName,
          senderTeamName: team?.shortName,
          text: String(payload.text).substring(0, 200),
          timestamp: new Date().toISOString(),
        };

        broadcastToRoom(roomId, {
          type: 'CHAT_RECEIVED',
          roomId,
          payload: chatMsg,
          timestamp: new Date().toISOString(),
        });
        return;
      }
    } catch (_) {}
  });

  ws.on('close', () => {
    const meta = socketMeta.get(ws);
    if (!meta) return;
    const { roomId, participantId } = meta;

    if (roomSockets[roomId]) {
      roomSockets[roomId].delete(ws);
    }

    if (rooms[roomId] && participantId && rooms[roomId].participants[participantId]) {
      rooms[roomId].participants[participantId].connected = false;
      rooms[roomId].participants[participantId].lastActiveAt = new Date().toISOString();
      broadcastToRoom(roomId, {
        type: 'ROOM_STATE',
        roomId,
        payload: rooms[roomId],
        timestamp: new Date().toISOString(),
      });
    }
  });
});

// -----------------------------------------------------------------------------
// Static frontend serving (production only)
// In development, Vite runs separately on port 5173 with a proxy to this server.
// In production (`npm run build` + `npm start`), this server serves dist/.
// -----------------------------------------------------------------------------
const DIST_DIR = path.resolve('dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(DIST_DIR)) {
  // Vite's hashed bundles never change, so they can be cached forever; everything
  // else (index.html, player photos) revalidates so a redeploy shows up at once.
  app.use(
    '/assets',
    express.static(path.join(DIST_DIR, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }),
  );
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
  // Unknown API routes get a JSON 404 instead of the SPA shell.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  // SPA fallback — client routes like /join/CODE, /room/..., /auctioneer/... get index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

// Re-aim clocks for rooms restored from disk. Deadlines that passed while the
// server was down are resolved straight away (sold / unsold / next player).
Object.values(rooms).forEach(r => scheduleRoom(r));

// Flush the snapshot when the platform stops or restarts the container.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    persistState();
    wss.clients.forEach(client => client.close(1012, 'Server restarting'));
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  console.log(`\nAuctionArena Server  →  http://localhost:${PORT}  [${env}]`);
  if (env !== 'production') {
    console.log(`Frontend (Vite dev)  →  http://localhost:5173`);
    console.log(`API / WebSocket      →  http://localhost:${PORT}/api`);
  } else {
    console.log(`Frontend + API       →  http://localhost:${PORT}`);
  }
  console.log('');
});

// Render's free tier sleeps after 15 min without inbound traffic. Hitting our own
// public URL goes back in through Render's proxy, so it counts as traffic.
// RENDER_EXTERNAL_URL is set by Render automatically; set KEEP_ALIVE=off to disable.
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
if (KEEP_ALIVE_URL && process.env.KEEP_ALIVE !== 'off') {
  const target = `${KEEP_ALIVE_URL.replace(/\/$/, '')}/healthz`;
  setInterval(() => {
    fetch(target, { signal: AbortSignal.timeout(10_000) }).catch(err =>
      console.warn(`[keep-alive] ping failed: ${err?.message ?? err}`),
    );
  }, 10 * 60 * 1000).unref();
  console.log(`[keep-alive] pinging ${target} every 10 min`);
}
