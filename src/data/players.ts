import { Player, PlayerWithoutImage } from '../types';
import { marqueePlayers } from './marqueePlayers';
import { rawPlayersDataset, RawPlayerDef } from './rawPlayersList';
import { rawPlayersPart2 } from './rawPlayersPart2';
import { rawPlayersPart3 } from './rawPlayersPart3';
import { resolvePlayerImage } from './playerImages';
import { applyCareerStats, experienceLabel } from './playerStats';
import { newSquadPlayers, squadBasePrice, withSquadTeam } from './squads';

// The raw lists hold hand-entered figures that are only a fallback: applyCareerStats
// replaces them with the record computed from Cricsheet whenever the player is matched.
function transformRawPlayer(def: RawPlayerDef): PlayerWithoutImage {
  const bowled = def.wickets > 0 && def.economy > 0 && def.bowlAvg > 0;
  // avg = runs / wkts and econ = runs / overs, so balls = 6 x wkts x avg / econ.
  const balls = bowled ? Math.round((6 * def.wickets * def.bowlAvg) / def.economy) : 0;
  const runsConceded = bowled ? Math.round(def.wickets * def.bowlAvg) : 0;

  return {
    id: def.id,
    name: def.name,
    shortName: def.shortName,
    nationality: def.nationality,
    countryCode: def.countryCode,
    role: def.role,
    category: def.category,
    isOverseas: def.isOverseas,
    basePrice: def.basePrice,
    previousIPLTeam: def.previousIPLTeam,
    official2026Team: def.official2026Team || def.previousIPLTeam,
    official2026AuctionStatus: def.official2026AuctionStatus || 'AUCTION_POOL_2026',
    statsSource: '',
    statsLastUpdated: '2026-04-10',
    batting: {
      matches: def.matches,
      innings: def.innings,
      runs: def.runs,
      average: def.avg,
      strikeRate: def.sr,
      fifties: def.fifties,
      hundreds: def.hundreds,
    },
    bowling: {
      matches: def.matches,
      innings: 0,
      overs: Math.floor(balls / 6) + (balls % 6) / 10,
      balls,
      runsConceded,
      wickets: def.wickets,
      economy: def.wickets > 0 ? def.economy : 0,
      average: def.bowlAvg,
      strikeRate: def.wickets > 0 ? Math.round((balls / def.wickets) * 10) / 10 : 0,
      bestBowling: def.bestBowl,
    },
    fielding: {
      catches: def.catches,
      stumpings: def.stumpings,
    },
    metadata: {
      seasons: def.seasons,
      iplMatches: def.matches,
      iplExperience: experienceLabel(def.seasons),
      captaincyAppearances: def.isCaptain ? Math.round(def.matches * 0.4) : 0,
      wicketkeepingAppearances: def.isWK ? def.matches : 0,
    },
  };
}

// Photos are looked up by player id — see src/data/playerImages.ts and `npm run sync:images`.
function withImage(player: PlayerWithoutImage): Player {
  const image = resolvePlayerImage(player.id, player.name, player.role);
  return { ...player, imageUrl: image.url, imageSource: image.source, imageVerified: image.isVerified };
}

// Experience labels follow the season count, so recompute them once the Cricsheet
// record is in. Marquee players keep their hand-written taglines.
function withExperienceLabel(player: PlayerWithoutImage): PlayerWithoutImage {
  return { ...player, metadata: { ...player.metadata, iplExperience: experienceLabel(player.metadata.seasons) } };
}

const withRawStats = (def: RawPlayerDef) => withExperienceLabel(applyCareerStats(transformRawPlayer(def)));

// Players added from the current official squads (see src/data/squads.ts).
function withSquadStats(player: PlayerWithoutImage): PlayerWithoutImage {
  const p = withExperienceLabel(applyCareerStats(player));
  return { ...p, basePrice: squadBasePrice(p.isOverseas, p.metadata.iplMatches) };
}

const allTransformedPlayers: Player[] = [
  ...marqueePlayers.map(applyCareerStats),
  ...rawPlayersDataset.map(withRawStats),
  ...rawPlayersPart2.map(withRawStats),
  ...rawPlayersPart3.map(withRawStats),
  ...newSquadPlayers().map(withSquadStats),
]
  .map(withSquadTeam)
  .map(withImage);

export const ALL_PLAYERS: Player[] = allTransformedPlayers;

export const PLAYERS_BY_ID: Record<string, Player> = ALL_PLAYERS.reduce((acc, p) => {
  acc[p.id] = p;
  return acc;
}, {} as Record<string, Player>);

export const PLAYERS_BY_CATEGORY: Record<string, Player[]> = {
  MARQUEE: ALL_PLAYERS.filter(p => p.category === 'MARQUEE'),
  BATSMEN: ALL_PLAYERS.filter(p => p.category === 'BATSMEN'),
  ALL_ROUNDERS: ALL_PLAYERS.filter(p => p.category === 'ALL_ROUNDERS'),
  BOWLERS: ALL_PLAYERS.filter(p => p.category === 'BOWLERS'),
  WICKET_KEEPERS: ALL_PLAYERS.filter(p => p.category === 'WICKET_KEEPERS'),
};
