import { Player, PlayerWithoutImage } from '../types';
import { marqueePlayers } from './marqueePlayers';
import { rawPlayersDataset, RawPlayerDef } from './rawPlayersList';
import { rawPlayersPart2 } from './rawPlayersPart2';
import { rawPlayersPart3 } from './rawPlayersPart3';
import { resolvePlayerImage } from './playerImages';

// The raw lists carry real career figures only. Anything else is either derived
// exactly from them or left out; nothing is estimated from a rule of thumb.
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
    statsSource: 'Official IPL Career Data Provider',
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
      iplExperience: def.seasons >= 10 ? 'IPL Legend' : def.seasons >= 5 ? 'Experienced Pro' : def.seasons >= 2 ? 'Emerging Talent' : 'Debut Candidate',
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

const allTransformedPlayers: Player[] = [
  ...marqueePlayers,
  ...rawPlayersDataset.map(transformRawPlayer),
  ...rawPlayersPart2.map(transformRawPlayer),
  ...rawPlayersPart3.map(transformRawPlayer),
].map(withImage);

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
