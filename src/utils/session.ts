import { UserRole } from '../types';

// Remembers who this browser is in each auction room (auctioneer or a team),
// so going Home or reopening a room link never loses auctioneer rights.

export interface StoredSession {
  participantId: string;
  role: UserRole;
}

const SESSIONS_KEY = 'ipl_auction_sessions';
const LAST_ROOM_KEY = 'ipl_auction_last_room';

// Pre-2026-09 builds kept a single session in these keys.
const LEGACY_ROOM_KEY = 'ipl_auction_room_id';
const LEGACY_PARTICIPANT_KEY = 'ipl_auction_participant_id';
const LEGACY_ROLE_KEY = 'ipl_auction_role';

function readAll(): Record<string, StoredSession> {
  try {
    const all = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '{}') as Record<string, StoredSession>;
    const legacyRoom = localStorage.getItem(LEGACY_ROOM_KEY);
    const legacyPart = localStorage.getItem(LEGACY_PARTICIPANT_KEY);
    const legacyRole = localStorage.getItem(LEGACY_ROLE_KEY) as UserRole | null;
    if (legacyRoom && legacyPart && legacyRole && !all[legacyRoom]) {
      all[legacyRoom] = { participantId: legacyPart, role: legacyRole };
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
      localStorage.setItem(LAST_ROOM_KEY, legacyRoom);
    }
    return all;
  } catch {
    return {};
  }
}

export function getSession(roomId: string): StoredSession | null {
  return readAll()[roomId] ?? null;
}

export function saveSession(roomId: string, session: StoredSession) {
  try {
    const all = readAll();
    all[roomId] = session;
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
    localStorage.setItem(LAST_ROOM_KEY, roomId);
  } catch {
    // Storage unavailable (private mode): the session lasts for this tab only.
  }
}

// Forget this browser's identity in a room (e.g. the auctioneer removed the team).
export function removeSession(roomId: string) {
  try {
    const all = readAll();
    delete all[roomId];
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
    if (localStorage.getItem(LAST_ROOM_KEY) === roomId) localStorage.removeItem(LAST_ROOM_KEY);
  } catch {
    // Storage unavailable: nothing was saved.
  }
}

export function getLastRoomId(): string | null {
  try {
    readAll();
    return localStorage.getItem(LAST_ROOM_KEY);
  } catch {
    return null;
  }
}
