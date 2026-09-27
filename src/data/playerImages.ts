// =============================================================================
// Player photos — resolved by player ID from locally stored files.
//
// Photos live in public/players/{id}.webp and are produced by
// `npm run sync:images` (scripts/syncPlayerImages.ts), which matches players
// BY NAME against the official IPL squad pages, then Wikipedia, with manual
// photos in player-photos/ taking priority. The index below is generated.
// =============================================================================
import { PLAYER_IMAGES } from './playerImages.generated';

export type PlayerImageSource = 'MANUAL' | 'IPL' | 'WIKIPEDIA';

export interface PlayerImageRecord {
  src: string;
  source: PlayerImageSource;
  sourceUrl?: string;
  credit?: string;
  license?: string;
}

export interface ResolvedPlayerImage {
  url: string;
  source: PlayerImageSource | 'UNAVAILABLE';
  isVerified: boolean;
}

// =============================================================================
// generateCleanAvatar — role-coloured SVG initials, used when no photo exists
// =============================================================================
export function generateCleanAvatar(name: string, role: string): string {
  const roleColors: Record<string, string> = {
    BATSMAN: '#2563eb', BOWLER: '#10b981', ALL_ROUNDER: '#8b5cf6', WICKET_KEEPER: '#f59e0b',
  };
  const color = roleColors[role] || '#3b82f6';
  const initials = name.split(' ').filter(Boolean).map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#090d16"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs><rect width="200" height="240" rx="20" fill="url(#bg)"/><circle cx="100" cy="85" r="42" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="2"/><circle cx="100" cy="85" r="32" fill="${color}" fill-opacity="0.25"/><text x="100" y="97" text-anchor="middle" font-family="-apple-system,sans-serif" font-weight="900" font-size="28" fill="#ffffff">${initials}</text><path d="M35 220 C35 155 70 145 100 145 C130 145 165 155 165 220 Z" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="1.5"/><rect x="50" y="200" width="100" height="24" rx="12" fill="#0f172a" stroke="${color}" stroke-width="1"/><text x="100" y="216" text-anchor="middle" font-family="-apple-system,sans-serif" font-weight="800" font-size="10" fill="${color}" letter-spacing="1.5">${role.replace('_', ' ')}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function resolvePlayerImage(playerId: string, name: string, role: string): ResolvedPlayerImage {
  const record = PLAYER_IMAGES[playerId];
  if (record) return { url: record.src, source: record.source, isVerified: true };
  return { url: generateCleanAvatar(name, role), source: 'UNAVAILABLE', isVerified: false };
}

// Swap a photo that fails to load for the initials avatar. <img> elements are
// reused as the current player changes, so only skip if the avatar is already shown.
export function showAvatarFallback(img: HTMLImageElement, player: { name: string; role: string }) {
  if (img.src.startsWith('data:')) return;
  img.src = generateCleanAvatar(player.name, player.role);
}
