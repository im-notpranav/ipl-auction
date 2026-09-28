-- ==============================================================================
-- IPL LIVE AUCTION ARENA - PRODUCTION SUPABASE & POSTGRESQL SCHEMA
-- ==============================================================================
-- This schema separates GLOBAL PLAYER DATA from ROOM-SPECIFIC AUCTION DATA.
-- The global `players` table does NOT contain ephemeral session states like
-- `current_bid`, `sold_to`, or `sold_price`. Those are managed in room/session tables.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. GLOBAL PLAYER REGISTRY & DATA SOURCES
-- ------------------------------------------------------------------------------

CREATE TYPE player_category_type AS ENUM (
  'MARQUEE',
  'BATSMEN',
  'ALL_ROUNDERS',
  'BOWLERS',
  'WICKET_KEEPERS'
);

CREATE TYPE player_role_type AS ENUM (
  'BATSMAN',
  'BOWLER',
  'ALL_ROUNDER',
  'WICKET_KEEPER'
);

-- Canonical Players table (Global, immutable per auction)
CREATE TABLE IF NOT EXISTS players (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  short_name VARCHAR(60) NOT NULL,
  nationality VARCHAR(60) NOT NULL DEFAULT 'India',
  is_overseas BOOLEAN NOT NULL DEFAULT false,
  role player_role_type NOT NULL DEFAULT 'BATSMAN',
  category player_category_type NOT NULL DEFAULT 'BATSMEN',
  base_price BIGINT NOT NULL DEFAULT 20000000, -- Amount in smallest currency unit (e.g. ₹20 Lakh / ₹2 Cr)
  ipl_experience_years INT NOT NULL DEFAULT 1,
  official_2026_auction_status VARCHAR(60) DEFAULT 'ACTIVE_POOL',
  auction_set VARCHAR(32) DEFAULT 'SET_1',
  auction_list_number INT,
  previous_teams TEXT[] DEFAULT '{}',
  image_url TEXT,
  image_source VARCHAR(100) DEFAULT 'OFFICIAL_IPL',
  stats_source VARCHAR(100) DEFAULT 'VERIFIED_IPL_DATABASE',
  stats_retrieved_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  data_version VARCHAR(20) DEFAULT '2026.1',
  aliases TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Player Batting & Bowling Statistics
CREATE TABLE IF NOT EXISTS player_stats (
  player_id VARCHAR(64) PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  batting_matches INT NOT NULL DEFAULT 0,
  batting_innings INT NOT NULL DEFAULT 0,
  batting_runs INT NOT NULL DEFAULT 0,
  batting_average NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
  batting_strike_rate NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
  batting_highest_score INT NOT NULL DEFAULT 0,
  batting_centuries INT NOT NULL DEFAULT 0,
  batting_fifties INT NOT NULL DEFAULT 0,
  bowling_matches INT NOT NULL DEFAULT 0,
  bowling_innings INT NOT NULL DEFAULT 0,
  bowling_wickets INT NOT NULL DEFAULT 0,
  bowling_economy NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  bowling_average NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
  bowling_best_figures VARCHAR(20) DEFAULT '0/0',
  catches INT NOT NULL DEFAULT 0,
  stumpings INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Player Images metadata
CREATE TABLE IF NOT EXISTS player_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id VARCHAR(64) NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  image_source VARCHAR(100) NOT NULL,
  provider_player_id VARCHAR(100),
  is_verified BOOLEAN NOT NULL DEFAULT true,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- External Data Sources Audit
CREATE TABLE IF NOT EXISTS player_data_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_name VARCHAR(100) NOT NULL,
  api_base_url TEXT NOT NULL,
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_records_ingested INT NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE'
);

-- ------------------------------------------------------------------------------
-- 2. USERS, ROOMS, SETTINGS & PARTICIPANTS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name VARCHAR(80) NOT NULL,
  email VARCHAR(255) UNIQUE,
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE room_status_type AS ENUM (
  'LOBBY',
  'LIVE',
  'PAUSED',
  'COMPLETED'
);

CREATE TABLE IF NOT EXISTS auction_rooms (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  auctioneer_id VARCHAR(64) NOT NULL,
  auctioneer_name VARCHAR(80) NOT NULL,
  status room_status_type NOT NULL DEFAULT 'LOBBY',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS auction_settings (
  room_id VARCHAR(64) PRIMARY KEY REFERENCES auction_rooms(id) ON DELETE CASCADE,
  starting_purse BIGINT NOT NULL DEFAULT 1200000000, -- ₹120 Cr in INR (or integer units)
  max_participants INT NOT NULL DEFAULT 10,
  min_squad_size INT NOT NULL DEFAULT 15,
  max_squad_size INT NOT NULL DEFAULT 25,
  max_overseas INT NOT NULL DEFAULT 8,
  timer_seconds INT NOT NULL DEFAULT 30,
  is_public BOOLEAN NOT NULL DEFAULT true,
  categories_order TEXT[] DEFAULT ARRAY['MARQUEE', 'BATSMEN', 'WICKET_KEEPERS', 'ALL_ROUNDERS', 'BOWLERS'],
  increments_tier JSONB NOT NULL DEFAULT '[
    {"upTo": 50000000, "increment": 2000000},
    {"upTo": 100000000, "increment": 2500000},
    {"upTo": 200000000, "increment": 5000000},
    {"upTo": 1000000000, "increment": 10000000}
  ]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE participant_role_type AS ENUM (
  'AUCTIONEER',
  'PARTICIPANT'
);

CREATE TABLE IF NOT EXISTS room_participants (
  id VARCHAR(64) PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL REFERENCES auction_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  display_name VARCHAR(80) NOT NULL,
  role participant_role_type NOT NULL DEFAULT 'PARTICIPANT',
  team_id VARCHAR(64),
  is_connected BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_room_participant UNIQUE (room_id, id)
);

CREATE TABLE IF NOT EXISTS participant_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id VARCHAR(64) NOT NULL REFERENCES auction_rooms(id) ON DELETE CASCADE,
  participant_id VARCHAR(64) NOT NULL,
  session_token VARCHAR(128) NOT NULL UNIQUE,
  device_info VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Teams registered in a specific auction room
CREATE TABLE IF NOT EXISTS team_squads (
  id VARCHAR(64) NOT NULL,
  room_id VARCHAR(64) NOT NULL REFERENCES auction_rooms(id) ON DELETE CASCADE,
  owner_participant_id VARCHAR(64) NOT NULL,
  name VARCHAR(100) NOT NULL,
  short_name VARCHAR(10) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#EAB308',
  starting_purse BIGINT NOT NULL DEFAULT 1200000000,
  remaining_purse BIGINT NOT NULL DEFAULT 1200000000,
  squad_size INT NOT NULL DEFAULT 0,
  overseas_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, id),
  CONSTRAINT uq_team_short_name_per_room UNIQUE (room_id, short_name)
);

-- ------------------------------------------------------------------------------
-- 3. ROOM AUCTION SESSION & BIDDING LOGIC
-- ------------------------------------------------------------------------------

CREATE TYPE auction_player_status_type AS ENUM (
  'PENDING',
  'IN_AUCTION',
  'SOLD',
  'UNSOLD'
);

-- Tracks players in a specific room's auction sequence
CREATE TABLE IF NOT EXISTS auction_players (
  room_id VARCHAR(64) NOT NULL REFERENCES auction_rooms(id) ON DELETE CASCADE,
  player_id VARCHAR(64) NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status auction_player_status_type NOT NULL DEFAULT 'PENDING',
  base_price BIGINT NOT NULL,
  final_price BIGINT,
  sold_to_team_id VARCHAR(64),
  order_index INT NOT NULL DEFAULT 0,
  auctioned_at TIMESTAMPTZ,
  PRIMARY KEY (room_id, player_id)
);

-- Live state of the active player in a room
CREATE TABLE IF NOT EXISTS auction_sessions (
  room_id VARCHAR(64) PRIMARY KEY REFERENCES auction_rooms(id) ON DELETE CASCADE,
  current_player_id VARCHAR(64) REFERENCES players(id),
  current_bid BIGINT NOT NULL DEFAULT 0,
  highest_bidder_team_id VARCHAR(64),
  highest_bidder_participant_id VARCHAR(64),
  timer_remaining INT NOT NULL DEFAULT 30,
  is_timer_running BOOLEAN NOT NULL DEFAULT false,
  round_number INT NOT NULL DEFAULT 1,
  total_players_sold INT NOT NULL DEFAULT 0,
  total_players_unsold INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Authoritative Bids log (Room & Player Scoped)
CREATE TABLE IF NOT EXISTS bids (
  id VARCHAR(64) PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL REFERENCES auction_rooms(id) ON DELETE CASCADE,
  player_id VARCHAR(64) NOT NULL REFERENCES players(id),
  team_id VARCHAR(64) NOT NULL,
  participant_id VARCHAR(64) NOT NULL,
  amount BIGINT NOT NULL,
  request_id VARCHAR(100),
  sequence_number INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_bid_request_id UNIQUE (room_id, request_id)
);

-- Completed Sold Players (Atomic record)
CREATE TABLE IF NOT EXISTS sold_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id VARCHAR(64) NOT NULL REFERENCES auction_rooms(id) ON DELETE CASCADE,
  team_id VARCHAR(64) NOT NULL,
  player_id VARCHAR(64) NOT NULL REFERENCES players(id),
  sold_price BIGINT NOT NULL,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sold_player_per_room UNIQUE (room_id, player_id)
);

-- Comprehensive Auction Event Audit Log
CREATE TABLE IF NOT EXISTS auction_events (
  id VARCHAR(64) PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL REFERENCES auction_rooms(id) ON DELETE CASCADE,
  actor_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  player_id VARCHAR(64) REFERENCES players(id),
  team_id VARCHAR(64),
  payload JSONB DEFAULT '{}'::jsonb,
  sequence_number INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. POST-AUCTION SQUAD ANALYSIS & REPORT METADATA
-- ------------------------------------------------------------------------------

-- Matchday Playing XI selection
CREATE TABLE IF NOT EXISTS playing_xi (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id VARCHAR(64) NOT NULL REFERENCES auction_rooms(id) ON DELETE CASCADE,
  team_id VARCHAR(64) NOT NULL,
  captain_player_id VARCHAR(64) REFERENCES players(id),
  wicket_keeper_player_id VARCHAR(64) REFERENCES players(id),
  player_ids TEXT[] NOT NULL DEFAULT '{}',
  overseas_count INT NOT NULL DEFAULT 0,
  is_optimal BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_team_playing_xi UNIQUE (room_id, team_id)
);

-- Algorithmic Squad Ratings & Breakdown (Calculated post-auction)
CREATE TABLE IF NOT EXISTS team_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id VARCHAR(64) NOT NULL REFERENCES auction_rooms(id) ON DELETE CASCADE,
  team_id VARCHAR(64) NOT NULL,
  overall_score INT NOT NULL,
  batting_score INT NOT NULL,
  bowling_score INT NOT NULL,
  pace_score INT NOT NULL,
  spin_score INT NOT NULL,
  all_rounders_score INT NOT NULL,
  wicket_keeping_score INT NOT NULL,
  bench_strength_score INT NOT NULL,
  overseas_balance_score INT NOT NULL,
  squad_balance_score INT NOT NULL,
  purse_efficiency_score INT NOT NULL,
  role_coverage_score INT NOT NULL,
  analysis_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_team_analysis UNIQUE (room_id, team_id)
);

-- Generated PDF Report Archive Metadata
CREATE TABLE IF NOT EXISTS report_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id VARCHAR(64) NOT NULL REFERENCES auction_rooms(id) ON DELETE CASCADE,
  report_title VARCHAR(255) NOT NULL,
  total_teams INT NOT NULL,
  total_players_auctioned INT NOT NULL,
  total_money_spent BIGINT NOT NULL,
  generated_by_id VARCHAR(64) NOT NULL,
  download_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. INDEXES FOR HIGH-THROUGHPUT REAL-TIME PERFORMANCE
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_auction_rooms_status ON auction_rooms(status);
CREATE INDEX IF NOT EXISTS idx_room_participants_room_id ON room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_team_squads_room_id ON team_squads(room_id);
CREATE INDEX IF NOT EXISTS idx_auction_players_room_status ON auction_players(room_id, status);
CREATE INDEX IF NOT EXISTS idx_bids_room_player ON bids(room_id, player_id, sequence_number DESC);
CREATE INDEX IF NOT EXISTS idx_auction_events_room_seq ON auction_events(room_id, sequence_number ASC);
CREATE INDEX IF NOT EXISTS idx_sold_players_room_team ON sold_players(room_id, team_id);
CREATE INDEX IF NOT EXISTS idx_players_category_role ON players(category, role);
CREATE INDEX IF NOT EXISTS idx_players_nationality ON players(nationality, is_overseas);

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

ALTER TABLE auction_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active auction rooms and global players
CREATE POLICY "Public read for players" ON players FOR SELECT USING (true);
CREATE POLICY "Public read for active rooms" ON auction_rooms FOR SELECT USING (true);
CREATE POLICY "Public read for room settings" ON auction_settings FOR SELECT USING (true);
CREATE POLICY "Room participants can view room bids" ON bids FOR SELECT USING (true);
CREATE POLICY "Room participants can view room events" ON auction_events FOR SELECT USING (true);
