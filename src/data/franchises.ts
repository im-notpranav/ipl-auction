// The ten IPL franchises in their kit colours (tuned to read on the navy background).
// Crests are the official team icons from iplt20.com, stored as 256px WebP in public/teams.
export const FRANCHISES = [
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

export type Franchise = (typeof FRANCHISES)[number];

// Older names that still turn up in career data.
const ALIASES: Record<string, string> = {
  KXIP: 'PBKS',
  PK: 'PBKS',
  'KINGS XI PUNJAB': 'PBKS',
  'DELHI DAREDEVILS': 'DC',
  'ROYAL CHALLENGERS BANGALORE': 'RCB',
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
