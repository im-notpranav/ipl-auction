// =============================================================================
// Current IPL squads — from the official iplt20.com squad lists.
//
// `npm run sync:squads` (scripts/syncSquads.ts) fetches every franchise's squad,
// links each squad player to the pool and writes the index below. Pool players
// in a squad take that franchise as their team; squad players the hand-curated
// pool doesn't have are added here, with career stats from Cricsheet and photos
// from `npm run sync:images` like everyone else.
// =============================================================================
import type { PlayerCategory, PlayerRole, PlayerWithoutImage } from '../types';
import { SQUAD_PLAYERS } from './squads.generated';

export interface SquadPlayer {
  iplId: number;
  name: string;
  team: string;
  role: string; // iplt20.com role: batsman | bowler | allrounder | wicketkeeper
  country: string;
  isInternational: boolean;
  isWicketKeeper: boolean;
  isCaptain: boolean;
  poolId: string;
  isNew: boolean;
}

const ROLES: Record<string, { role: PlayerRole; category: PlayerCategory }> = {
  batsman: { role: 'BATSMAN', category: 'BATSMEN' },
  bowler: { role: 'BOWLER', category: 'BOWLERS' },
  allrounder: { role: 'ALL_ROUNDER', category: 'ALL_ROUNDERS' },
  wicketkeeper: { role: 'WICKET_KEEPER', category: 'WICKET_KEEPERS' },
};

// Same codes the hand-curated pool uses.
const COUNTRY_CODES: Record<string, string> = {
  India: 'IN', Australia: 'AU', Afghanistan: 'AFG', 'South Africa': 'SA', England: 'ENG', 'New Zealand': 'NZ',
  'West Indies': 'WI', Zimbabwe: 'ZW', 'Sri Lanka': 'SL', Ireland: 'IRE', Bangladesh: 'BAN', Netherlands: 'NED',
  Oman: 'OMA', Pakistan: 'PAK', Namibia: 'NAM', USA: 'USA', Scotland: 'SCO', Nepal: 'NEP', UAE: 'UAE',
};

const squadByPoolId = new Map(SQUAD_PLAYERS.map(s => [s.poolId, s]));

// "Vaibhav Sooryavanshi" -> "V Sooryavanshi"; names that already lead with initials stay as they are.
function shortNameOf(name: string): string {
  const words = name.split(' ');
  if (words.length < 2 || /^[A-Z]{2,}$/.test(words[0])) return name;
  return `${words[0][0]} ${words[words.length - 1]}`;
}

/** Pool players in a current squad play for that franchise now. */
export function withSquadTeam<T extends PlayerWithoutImage>(player: T): T {
  const squad = squadByPoolId.get(player.id);
  if (!squad || squad.isNew) return player;
  return { ...player, previousIPLTeam: squad.team, official2026Team: squad.team };
}

/**
 * Starting price for players the squad sync adds. The real auction base price isn't
 * published with the squads, so it follows IPL experience, starting from the
 * uncapped minimum (0.3 Cr) for Indian newcomers.
 */
export function squadBasePrice(isOverseas: boolean, iplMatches: number): number {
  if (isOverseas) return iplMatches >= 50 ? 1.5 : iplMatches >= 20 ? 1.0 : 0.75;
  return iplMatches >= 50 ? 1.0 : iplMatches >= 20 ? 0.5 : iplMatches >= 5 ? 0.4 : 0.3;
}

/** Squad players the curated pool is missing. Stats are filled in by applyCareerStats. */
export function newSquadPlayers(): PlayerWithoutImage[] {
  return SQUAD_PLAYERS.filter(s => s.isNew).map((s): PlayerWithoutImage => {
    const { role, category } = ROLES[s.role] ?? ROLES.batsman;
    return {
      id: s.poolId,
      name: s.name,
      shortName: shortNameOf(s.name),
      nationality: s.country,
      countryCode: COUNTRY_CODES[s.country] ?? s.country.slice(0, 3).toUpperCase(),
      role,
      category,
      isOverseas: s.isInternational,
      basePrice: 0, // set from the career record once stats are applied (see players.ts)
      previousIPLTeam: s.team,
      official2026Team: s.team,
      official2026AuctionStatus: 'AUCTION_POOL_2026',
      statsSource: '',
      statsLastUpdated: '',
      batting: { matches: 0, innings: 0, runs: 0, average: 0, strikeRate: 0, fifties: 0, hundreds: 0 },
      bowling: { matches: 0, innings: 0, overs: 0, balls: 0, runsConceded: 0, wickets: 0, economy: 0, average: 0, strikeRate: 0, bestBowling: '0/0' },
      fielding: { catches: 0, stumpings: 0 },
      metadata: { seasons: 0, iplMatches: 0, iplExperience: '', captaincyAppearances: 0, wicketkeepingAppearances: 0 },
    };
  });
}
