// =============================================================================
// Player career stats — computed from Cricsheet's IPL ball-by-ball data.
//
// `npm run sync:stats` (scripts/syncPlayerStats.ts) downloads every IPL match
// from cricsheet.org, counts each player's record from the delivery log and
// writes the index below. Players it could not match keep their hand-entered
// figures, labelled as unverified.
// =============================================================================
import type { PlayerBattingStats, PlayerBowlingStats, PlayerFieldingStats, PlayerWithoutImage } from '../types';
import { PLAYER_STATS, STATS_DATA_THROUGH } from './playerStats.generated';

export interface PlayerStatsRecord {
  cricsheetId: string;
  cricsheetName: string;
  seasons: number;
  firstSeason: string;
  lastSeason: string;
  batting: PlayerBattingStats;
  bowling: PlayerBowlingStats;
  fielding: PlayerFieldingStats;
}

export const STATS_SOURCE = 'Cricsheet IPL ball-by-ball data (cricsheet.org)';
export const UNVERIFIED_STATS_SOURCE = 'Unverified (not matched to Cricsheet)';

const EMPTY_BATTING: PlayerBattingStats = { matches: 0, innings: 0, runs: 0, average: 0, strikeRate: 0, fifties: 0, hundreds: 0, fours: 0, sixes: 0, highestScore: 0 };
const EMPTY_BOWLING: PlayerBowlingStats = { matches: 0, innings: 0, overs: 0, balls: 0, runsConceded: 0, wickets: 0, economy: 0, average: 0, strikeRate: 0, bestBowling: '0/0', fourWicketHauls: 0, fiveWicketHauls: 0 };

export function experienceLabel(seasons: number): string {
  return seasons >= 10 ? 'IPL Legend' : seasons >= 5 ? 'Experienced Pro' : seasons >= 2 ? 'Emerging Talent' : 'Debut Candidate';
}

export function applyCareerStats(player: PlayerWithoutImage): PlayerWithoutImage {
  if (!(player.id in PLAYER_STATS)) {
    return { ...player, statsSource: UNVERIFIED_STATS_SOURCE };
  }
  const record = PLAYER_STATS[player.id];
  const base = { ...player, statsSource: STATS_SOURCE, statsLastUpdated: STATS_DATA_THROUGH };
  if (!record) {
    // Cricsheet has every IPL match, so no record means no IPL appearances yet.
    return {
      ...base,
      batting: EMPTY_BATTING,
      bowling: EMPTY_BOWLING,
      fielding: { catches: 0, stumpings: 0, runOuts: 0 },
      metadata: { ...player.metadata, seasons: 0, iplMatches: 0 },
    };
  }
  return {
    ...base,
    batting: record.batting,
    bowling: record.bowling,
    fielding: record.fielding,
    metadata: { ...player.metadata, seasons: record.seasons, iplMatches: record.batting.matches },
  };
}
