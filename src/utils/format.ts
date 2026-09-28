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

// Heading for the lot on stage: "Marquee set", "Batters · Set 2", or "Bowlers round" when
// the player isn't part of a set (the accelerated round).
export function formatLotSet(category: string, set?: { category: string; number: number } | null): string {
  if (!set) return `${formatCategory(category)} round`;
  if (set.category === 'MARQUEE') return 'Marquee set';
  return `${formatCategory(set.category)} · Set ${set.number}`;
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

// Jump bids: raise the price by more than the standard step in one go (₹25 L, ₹50 L, ₹1 Cr).
export const JUMP_BID_STEPS = [0.25, 0.5, 1.0];

/**
 * Every amount a team may bid right now: the standard next bid first, then each jump
 * that lands above it. Jumps are measured from the current price, so once the standard
 * step is ₹50 L or more, the smaller jumps drop out.
 */
export function bidOptions(currentBid: number, hasBidder: boolean): number[] {
  const next = hasBidder ? calculateNextLegalBid(currentBid) : currentBid;
  const jumps = JUMP_BID_STEPS.map((step) => Math.round((currentBid + step) * 100) / 100).filter((amount) => amount > next);
  return [next, ...jumps];
}

export function isLegalBidAmount(currentBid: number, hasBidder: boolean, amount: number): boolean {
  return bidOptions(currentBid, hasBidder).some((option) => Math.abs(option - amount) < 1e-9);
}
