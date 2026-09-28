import { Player, PlayerCategory, PlayerRole } from '../types';
import { ALL_PLAYERS, PLAYERS_BY_ID, PLAYERS_BY_CATEGORY } from '../data/players';
import { STATS_SOURCE } from '../data/playerStats';
import { STATS_DATA_THROUGH } from '../data/playerStats.generated';

export interface CricketDataProvider {
  getPlayer(playerId: string): Promise<Player | null>;
  getPlayers(options?: { category?: PlayerCategory; role?: PlayerRole; limit?: number }): Promise<Player[]>;
  getPlayerStats(playerId: string): Promise<Player['batting'] & Player['bowling'] | null>;
  getTeam(teamCode: string): Promise<{ name: string; shortName: string; historicalPlayers: Player[] } | null>;
  getSeasonStats(seasonYear?: number): Promise<{ season: number; totalAuctionPool: number; marqueeCount: number }>;
  searchPlayers(query: string): Promise<Player[]>;
  getHealthReport(): Promise<{
    status: 'ONLINE' | 'FALLBACK_LOCAL';
    totalPlayers: number;
    statsVerifiedCount: number;
    imagesVerifiedCount: number;
    apiConfigured: boolean;
    providerName: string;
    lastSync: string;
  }>;
}

export class HybridCricketDataProvider implements CricketDataProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.CRICKET_API_KEY || '';
    this.baseUrl = process.env.CRICKET_API_BASE_URL || 'https://api.cricapi.com/v1';
  }

  async getPlayer(playerId: string): Promise<Player | null> {
    return PLAYERS_BY_ID[playerId] || null;
  }

  async getPlayers(options?: { category?: PlayerCategory; role?: PlayerRole; limit?: number }): Promise<Player[]> {
    let list = ALL_PLAYERS;
    if (options?.category) {
      list = PLAYERS_BY_CATEGORY[options.category] || [];
    }
    if (options?.role) {
      list = list.filter(p => p.role === options.role);
    }
    if (options?.limit && options.limit > 0) {
      list = list.slice(0, options.limit);
    }
    return list;
  }

  async getPlayerStats(playerId: string): Promise<Player['batting'] & Player['bowling'] | null> {
    const player = PLAYERS_BY_ID[playerId];
    if (!player) return null;
    return {
      ...player.batting,
      ...player.bowling,
    };
  }

  async getTeam(teamCode: string) {
    const code = teamCode.toUpperCase();
    const matches = ALL_PLAYERS.filter(p => p.previousIPLTeam?.toUpperCase() === code);
    return {
      name: `Franchise ${code}`,
      shortName: code,
      historicalPlayers: matches,
    };
  }

  async getSeasonStats(seasonYear: number = 2026) {
    const marquee = ALL_PLAYERS.filter(p => p.category === 'MARQUEE').length;
    return {
      season: seasonYear,
      totalAuctionPool: ALL_PLAYERS.length,
      marqueeCount: marquee,
    };
  }

  async searchPlayers(query: string): Promise<Player[]> {
    const q = query.toLowerCase().trim();
    if (!q) return ALL_PLAYERS;
    return ALL_PLAYERS.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.shortName.toLowerCase().includes(q) ||
        p.nationality.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.previousIPLTeam.toLowerCase().includes(q)
    );
  }

  async getHealthReport() {
    const total = ALL_PLAYERS.length;
    // Verified = computed from Cricsheet (including confirmed "no IPL appearances").
    const statsVerified = ALL_PLAYERS.filter(p => p.statsSource === STATS_SOURCE).length;
    const imagesVerified = ALL_PLAYERS.filter(p => p.imageVerified).length;

    return {
      status: this.apiKey ? ('ONLINE' as const) : ('FALLBACK_LOCAL' as const),
      totalPlayers: total,
      statsVerifiedCount: statsVerified,
      imagesVerifiedCount: imagesVerified,
      apiConfigured: Boolean(this.apiKey),
      providerName: STATS_SOURCE,
      lastSync: STATS_DATA_THROUGH,
    };
  }
}

export const cricketDataProvider = new HybridCricketDataProvider();
export const cricketProvider = cricketDataProvider;
