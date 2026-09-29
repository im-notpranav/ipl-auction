export interface Franchise {
  name: string;
  short: string;
  color: string;
  logo: string;
}

// The ten IPL franchises in their kit colours (tuned to read on the navy background).
// Crests are the official team icons from iplt20.com, stored as 256px WebP in public/teams.
export const CURRENT_FRANCHISES: Franchise[] = [
  { name: 'Chennai Super Kings', short: 'CSK', color: '#f9cd05', logo: '/teams/CSK.webp' },
  { name: 'Mumbai Indians', short: 'MI', color: '#1e6fd9', logo: '/teams/MI.webp' },
  { name: 'Royal Challengers Bengaluru', short: 'RCB', color: '#d4202b', logo: '/teams/RCB.webp' },
  { name: 'Kolkata Knight Riders', short: 'KKR', color: '#7b4fc4', logo: '/teams/KKR.webp' },
  { name: 'Sunrisers Hyderabad', short: 'SRH', color: '#f26522', logo: '/teams/SRH.webp' },
  { name: 'Gujarat Titans', short: 'GT', color: '#b89b5e', logo: '/teams/GT.webp' },
  { name: 'Rajasthan Royals', short: 'RR', color: '#ea1a85', logo: '/teams/RR.webp' },
  { name: 'Delhi Capitals', short: 'DC', color: '#2e6fe0', logo: '/teams/DC.webp' },
  { name: 'Lucknow Super Giants', short: 'LSG', color: '#00a6e3', logo: '/teams/LSG.webp' },
  { name: 'Punjab Kings', short: 'PBKS', color: '#ed4050', logo: '/teams/PBKS.webp' },
];

// Former IPL franchises, offered in 15-team auctions. Crests are the club logos from
// their Wikipedia articles, trimmed and stored the same way.
export const CLASSIC_FRANCHISES: Franchise[] = [
  { name: 'Deccan Chargers', short: 'DCH', color: '#b9c4d6', logo: '/teams/DCH.webp' },
  { name: 'Kochi Tuskers Kerala', short: 'KTK', color: '#9c5bd6', logo: '/teams/KTK.webp' },
  { name: 'Pune Warriors India', short: 'PWI', color: '#3cc4d4', logo: '/teams/PWI.webp' },
  { name: 'Rising Pune Supergiant', short: 'RPS', color: '#d23a9e', logo: '/teams/RPS.webp' },
  { name: 'Gujarat Lions', short: 'GL', color: '#f0a020', logo: '/teams/GL.webp' },
];

export const FRANCHISES: Franchise[] = [...CURRENT_FRANCHISES, ...CLASSIC_FRANCHISES];

// Auction sizes a room can be created with.
export const TEAM_COUNT_OPTIONS = [10, 15] as const;
export const DEFAULT_MAX_TEAMS = 10;

// The franchises a room offers: the current ten, plus the classics in 15-team rooms.
export function franchisesFor(maxTeams: number | undefined): Franchise[] {
  return (maxTeams ?? DEFAULT_MAX_TEAMS) > CURRENT_FRANCHISES.length ? FRANCHISES : CURRENT_FRANCHISES;
}

// Older names that still turn up in career data.
const ALIASES: Record<string, string> = {
  KXIP: 'PBKS',
  PK: 'PBKS',
  'KINGS XI PUNJAB': 'PBKS',
  'DELHI DAREDEVILS': 'DC',
  'ROYAL CHALLENGERS BANGALORE': 'RCB',
  'RISING PUNE SUPERGIANTS': 'RPS',
  'PUNE WARRIORS': 'PWI',
  'KOCHI TUSKERS': 'KTK',
};

const BY_KEY = new Map<string, Franchise>();
for (const f of FRANCHISES) {
  BY_KEY.set(f.short, f);
  BY_KEY.set(f.name.toUpperCase(), f);
}
for (const [alias, short] of Object.entries(ALIASES)) BY_KEY.set(alias, BY_KEY.get(short)!);

// A franchise by short code or full name ("CSK", "Chennai Super Kings"), else undefined.
export function findFranchise(...keys: Array<string | null | undefined>): Franchise | undefined {
  for (const key of keys) {
    const hit = key ? BY_KEY.get(key.trim().toUpperCase()) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

// Crest for a room team. Teams registered under a franchise's name or code get its
// crest; custom team names get none (the UI shows a monogram in the team colour).
export function teamLogoUrl(team: { name?: string; shortName?: string; logoUrl?: string }): string | undefined {
  if (team.logoUrl?.startsWith('/teams/')) return team.logoUrl;
  return findFranchise(team.shortName, team.name)?.logo;
}
