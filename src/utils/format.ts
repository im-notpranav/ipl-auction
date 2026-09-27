export function formatPrice(crores: number): string {
  if (crores == null || isNaN(crores)) return '₹0.00 Cr';
  if (crores < 1.0) {
    const lakhs = Math.round(crores * 100);
    return `₹${lakhs} Lakhs`;
  }
  return `₹${crores.toFixed(2)} Cr`;
}

export function formatShortPrice(crores: number): string {
  if (crores == null || isNaN(crores)) return '₹0';
  return `₹${crores.toFixed(2)} Cr`;
}

const ROLE_LABELS: Record<string, string> = {
  BATSMAN: 'Batter',
  BOWLER: 'Bowler',
  ALL_ROUNDER: 'All-rounder',
  WICKET_KEEPER: 'Wicket-keeper',
};

const CATEGORY_LABELS: Record<string, string> = {
  MARQUEE: 'Marquee',
  BATSMEN: 'Batters',
  ALL_ROUNDERS: 'All-rounders',
  BOWLERS: 'Bowlers',
  WICKET_KEEPERS: 'Wicket-keepers',
};

export function formatRole(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function formatCategory(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function calculateNextLegalBid(currentBid: number): number {
  if (currentBid < 5.0) {
    return Math.round((currentBid + 0.20) * 100) / 100;
  }
  if (currentBid < 10.0) {
    return Math.round((currentBid + 0.25) * 100) / 100;
  }
  if (currentBid < 20.0) {
    return Math.round((currentBid + 0.50) * 100) / 100;
  }
  return Math.round((currentBid + 1.00) * 100) / 100;
}
