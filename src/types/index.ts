/**
 * Core Domain Types for IPL Live Auction Arena
 */

export type PlayerRole = 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER';

export type PlayerCategory = 
  | 'MARQUEE'
  | 'BATSMEN'
  | 'ALL_ROUNDERS'
  | 'BOWLERS'
  | 'WICKET_KEEPERS';

export interface PlayerBattingStats {
  matches: number;
  innings: number;
  runs: number;
  average: number;
  strikeRate: number;
  fifties: number;
  hundreds: number;
  // Only known for players with a full career record (marquee list); never estimated.
  fours?: number;
  sixes?: number;
  highestScore?: number;
}

export interface PlayerBowlingStats {
  matches: number;
  innings: number;
  overs: number;
  balls: number;
  runsConceded: number;
  wickets: number;
  economy: number;
  average: number;
  strikeRate: number;
  bestBowling: string;
  fourWicketHauls?: number;
  fiveWicketHauls?: number;
}

export interface PlayerFieldingStats {
  catches: number;
  stumpings: number;
  runOuts?: number;
}

export interface PlayerMetadata {
  seasons: number;
  iplMatches: number;
  iplExperience: string;
  captaincyAppearances: number;
  wicketkeepingAppearances: number;
}

export interface Player {
  id: string;
  name: string;
  shortName: string;
  nationality: string;
  countryCode: string; // e.g. "IN", "AU", "SA", "WI", "ENG", "NZ", "AFG"
  role: PlayerRole;
  category: PlayerCategory;
  isOverseas: boolean;
  basePrice: number; // In Crores (e.g. 2.0, 1.5, 1.0, 0.5, 0.2)
  previousIPLTeam: string; // Historical reference only
  official2026Team?: string; // e.g. "Royal Challengers Bengaluru", "Mumbai Indians", etc.
  official2026AuctionStatus?: 'RETAINED_2026' | 'AUCTION_POOL_2026';
  imageUrl: string;
  imageSource: string;
  imageVerified: boolean;
  statsSource: string;
  statsLastUpdated: string;
  batting: PlayerBattingStats;
  bowling: PlayerBowlingStats;
  fielding: PlayerFieldingStats;
  metadata: PlayerMetadata;
}

// Player data before its photo is attached by src/data/players.ts (see src/data/playerImages.ts).
export type PlayerWithoutImage = Omit<Player, 'imageUrl' | 'imageSource' | 'imageVerified'>;

export interface BidIncrementTier {
  minPrice: number;
  maxPrice: number;
  increment: number;
}

export interface AuctionSettings {
  startingPurse: number; // e.g. 100, 120, 150 Cr
  maxSquadSize: number; // 15, 18, 25
  maxOverseas: number; // Fixed at 8
  incrementTiers: BidIncrementTier[];
  categoriesOrder: PlayerCategory[];
  isPublic: boolean;
  // After SOLD / UNSOLD, bring up the next player automatically after autoAdvanceDelaySeconds.
  autoAdvance: boolean;
  autoAdvanceDelaySeconds: number;
  // When the main pool runs out, re-offer unsold players once in an accelerated round.
  reauctionUnsold: boolean;
}

export type AuctionStatus = 
  | 'LOBBY'
  | 'READY'
  | 'PLAYER_PRESENTED'
  | 'BIDDING'
  | 'PAUSED'
  | 'SOLD'
  | 'UNSOLD'
  | 'COMPLETED';

export type UserRole = 'AUCTIONEER' | 'PARTICIPANT';

export interface Team {
  id: string;
  name: string;
  shortName: string;
  logoUrl?: string;
  color?: string;
  ownerParticipantId: string;
  startingPurse: number;
  remainingPurse: number;
  squadSize: number;
  overseasCount: number;
  playersBought: SoldPlayerRecord[];
}

export interface SoldPlayerRecord {
  playerId: string;
  playerName: string;
  playerRole: PlayerRole;
  isOverseas: boolean;
  basePrice: number;
  soldPrice: number;
  soldAt: string;
  bidCount: number;
}

export interface RoomParticipant {
  id: string;
  displayName: string;
  role: UserRole;
  teamId: string | null; // Auctioneer has null, participant has teamId
  connected: boolean;
  joinedAt: string;
  lastActiveAt: string;
}

export interface Bid {
  id: string;
  bidVersion: number;
  roomId: string;
  playerId: string;
  teamId: string;
  teamName: string;
  teamShortName: string;
  bidderParticipantId: string;
  bidderDisplayName: string;
  amount: number; // in Crores
  timestamp: string;
}

export interface AuctionEvent {
  id: string;
  sequenceNumber: number;
  roomId: string;
  type: 
    | 'ROOM_CREATED'
    | 'PARTICIPANT_JOINED'
    | 'PARTICIPANT_LEFT'
    | 'PARTICIPANT_KICKED'
    | 'AUCTION_STARTED'
    | 'PLAYER_PRESENTED'
    | 'BID_PLACED'
    | 'BID_REJECTED'
    | 'AUCTION_PAUSED'
    | 'AUCTION_RESUMED'
    | 'PLAYER_SOLD'
    | 'PLAYER_UNSOLD'
    | 'AUCTION_ENDED'
    | 'PLAYING_XI_SUBMITTED';
  payload: any;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderParticipantId: string;
  senderName: string;
  senderTeamName?: string;
  text: string;
  timestamp: string;
}

export interface AuctionRoomState {
  id: string;
  roomCode: string; // 6-character human-friendly code (e.g. AX72K9)
  name: string;
  status: AuctionStatus;
  auctioneerId: string;
  auctioneerName: string;
  settings: AuctionSettings;
  participants: Record<string, RoomParticipant>;
  teams: Record<string, Team>;
  currentAuctionIndex: number;
  totalPlayersInPool: number;
  currentPlayer: Player | null;
  currentBid: number;
  currentHighestBidderTeamId: string | null;
  currentBidVersion: number;
  recentBids: Bid[];
  auctionedPlayerIds: string[];
  soldPlayers: Record<string, SoldPlayerRecord>;
  unsoldPlayerIds: string[];
  lastSoldEvent?: {
    player: Player;
    team: Team;
    price: number;
    timestamp: string;
  };
  lastUnsoldEvent?: {
    player: Player;
    timestamp: string;
  };
  eventSequenceNumber: number;
  createdAt: string;
  completedAt?: string;

  // ── Timing (server-authoritative; clients correct skew with serverTime) ──
  // Bids are refused until this moment: every accepted bid locks bidding briefly.
  bidLockedUntil: string | null;
  // Time left on a held auto-advance, restored on resume.
  pausedRemainingMs: number | null;
  // When the next player will come up automatically after SOLD / UNSOLD.
  nextPlayerAt: string | null;
  // Server clock at the moment this state was sent.
  serverTime: string;
  // 'MAIN' pool, then an 'ACCELERATED' re-auction of unsold players (if enabled).
  round: 'MAIN' | 'ACCELERATED';
  // Unsold players still to be re-offered in the ACCELERATED round, in order.
  accelerationQueue?: string[];
  // MAIN round running order, drawn when the auction starts (see buildAuctionSets).
  auctionSets?: AuctionSet[];
  // The set the player on stage comes from. Null in the ACCELERATED round.
  currentSet?: AuctionSetRef | null;

  // Team owners whose phones have the player on stage loaded (reset every lot).
  lotLoadedBy: string[];
  // Participants the auctioneer removed; their phones are turned away on reconnect.
  kickedParticipantIds: string[];

  // Post-auction Playing XI submissions, by teamId.
  playingXIs: Record<string, PlayingXISelection>;
}

// "Batters, set 2": sets are numbered per category.
export interface AuctionSetRef {
  category: PlayerCategory;
  number: number;
}

export interface AuctionSet extends AuctionSetRef {
  playerIds: string[]; // already shuffled, in auction order
}

export interface PlayingXISelection {
  teamId: string;
  playerIds: string[]; // exactly 11
  captainId: string;
  viceCaptainId: string;
  wicketKeeperId: string;
  battingOrder: string[]; // the same 11 playerIds, in batting order
  impactSubIds: string[]; // up to 5 named substitutes from the bench (IPL Impact Player rule)
  submittedAt: string;
}

// What a client sends; the server stamps teamId and submittedAt.
export type PlayingXIDraft = Omit<PlayingXISelection, 'teamId' | 'submittedAt'>;

export interface UnitScore {
  score: number; // 0 - 100
  title: string;
  description: string;
  keyPlayers: string[];
  metrics: Record<string, string | number>;
}

// Every unit is measured from the players' career numbers (see src/services/playerRatings.ts).
export interface TeamAnalysisReport {
  teamId: string;
  teamName: string;
  overallScore: number;
  battingScore: UnitScore;
  topOrderScore: UnitScore;
  finishingScore: UnitScore;
  bowlingScore: UnitScore;
  economyScore: UnitScore;
  wicketTakingScore: UnitScore;
  allRoundersScore: UnitScore;
  wicketkeepingScore: UnitScore;
  experienceScore: UnitScore;
  benchStrengthScore: UnitScore;
  strengths: string[];
  weaknesses: string[];
  bestPossibleXI: {
    playerIds: string[];
    captainId: string;
    wicketKeeperId: string;
    totalProjectedScore: number;
    explanation: string;
  };
  dataSourceNotes: string;
}

// WebSocket Message Protocol
export type WSMessageType =
  | 'AUTH_JOIN'
  | 'ROOM_STATE'
  | 'PLACE_BID'
  | 'BID_ACCEPTED'
  | 'BID_REJECTED'
  | 'START_AUCTION'
  | 'PAUSE_AUCTION'
  | 'RESUME_AUCTION'
  | 'SELL_PLAYER'
  | 'MARK_UNSOLD'
  | 'NEXT_PLAYER'
  | 'END_AUCTION'
  | 'KICK_PARTICIPANT'
  | 'SEND_CHAT'
  | 'CHAT_RECEIVED'
  | 'PING'
  | 'PONG'
  | 'SUBMIT_PLAYING_XI'
  | 'OPEN_BIDDING' // auctioneer: PLAYER_PRESENTED -> BIDDING
  | 'LOT_LOADED' // team owner: payload { playerId } once the player on stage has loaded
  | 'KICKED' // server -> a removed participant's sockets
  | 'UPDATE_SETTINGS' // auctioneer: payload Partial<Pick<AuctionSettings, 'autoAdvance' | 'autoAdvanceDelaySeconds'>>
  | 'UNDO_LAST_SALE' // auctioneer: reverse the most recent SOLD (refund purse, return player to pool)
  | 'NOTICE' // server -> one client: payload { message } confirming an action (e.g. XI submitted)
  | 'ERROR';

export interface WSMessage<T = any> {
  type: WSMessageType;
  roomId?: string;
  participantId?: string;
  clientBidId?: string;
  payload?: T;
  timestamp: string;
}
