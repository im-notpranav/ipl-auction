import { resolvePlayerImage, PlayerImageSource } from '../data/playerImages';

export interface ImageMetadata {
  imageUrl: string;
  imageSource: PlayerImageSource | 'UNAVAILABLE';
  verifiedAt: string;
  isFallback: boolean;
  isVerified: boolean;
}

export class PlayerImageProvider {
  private static verifiedCache = new Map<string, ImageMetadata>();

  static getPlayerImageMetadata(
    playerId: string,
    role: string = 'BATSMAN',
    playerName: string = ''
  ): ImageMetadata {
    const cacheKey = `${playerId}-${playerName}`;
    if (this.verifiedCache.has(cacheKey)) {
      return this.verifiedCache.get(cacheKey)!;
    }

    const { url, source, isVerified } = resolvePlayerImage(playerId, playerName || playerId, role);

    const meta: ImageMetadata = {
      imageUrl: url,
      imageSource: source,
      verifiedAt: new Date().toISOString(),
      isFallback: !isVerified,
      isVerified,
    };

    this.verifiedCache.set(cacheKey, meta);
    return meta;
  }

  static getPlayerImageUrl(playerId: string, role: string = 'BATSMAN', playerName: string = ''): string {
    return this.getPlayerImageMetadata(playerId, role, playerName).imageUrl;
  }

  static isVerified(playerId: string, playerName: string = ''): boolean {
    return this.getPlayerImageMetadata(playerId, 'BATSMAN', playerName).isVerified;
  }

  // Pre-load next player's image into browser cache
  static preloadPlayerImage(url: string) {
    if (typeof window !== 'undefined' && url && !url.startsWith('data:')) {
      const img = new Image();
      img.src = url;
    }
  }
}
