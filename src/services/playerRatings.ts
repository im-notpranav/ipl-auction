import { Player, PlayerRole } from '../types';
import { ALL_PLAYERS } from '../data/players';
import { LEGENDS, LEGEND_MIN_OVERALL } from '../data/legends';

export const LEGEND_TAG = 'IPL Legend';

/*
  How player strength is measured.

  Only real career numbers go in: runs, batting average, strike rate, wickets,
  economy and bowling average. Balls faced and balls bowled are recovered exactly
  from them (balls faced = runs / SR x 100, balls bowled = 6 x wickets x avg / econ).

  Batting: Batting Index = average x strike rate / 100. It is runs per dismissal
  scaled by tempo, so a slow accumulator and a slogger are both marked down.

  Bowling: Combined Bowling Rate (Lemmer, 2002) = 3 / (1/avg + 1/econ + 1/SR).
  One number that rewards taking wickets, taking them quickly and conceding few
  runs. Lower is better.

  Small samples: every player's record is blended with a "replacement level"
  record for their role worth 300 balls batting or 360 balls bowling. Eleven good innings no longer
  outrank 250 matches, and a player with no IPL record lands at replacement level
  instead of zero or the top.

  Ratings (40-99) are percentiles against established players in the same pool,
  so "Batting 90" means better than about 85% of the pool's regular batters.
*/

const BAT_PRIOR_BALLS = 300;
const BOWL_PRIOR_BALLS = 360;
const RELIABLE_BALLS = 600;
const SOME_BALLS = 180;

// Replacement-level records by role: what a squad filler would give you.
const BAT_PRIOR: Record<PlayerRole, { avg: number; sr: number }> = {
  BATSMAN: { avg: 22, sr: 125 },
  WICKET_KEEPER: { avg: 21, sr: 124 },
  ALL_ROUNDER: { avg: 17, sr: 126 },
  BOWLER: { avg: 8, sr: 95 },
};
const BOWL_PRIOR: Record<PlayerRole, { econ: number; sr: number }> = {
  BOWLER: { econ: 8.9, sr: 22 },
  ALL_ROUNDER: { econ: 9.2, sr: 26 },
  BATSMAN: { econ: 9.8, sr: 36 },
  WICKET_KEEPER: { econ: 10.5, sr: 48 },
};

export type SampleConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface BattingProfile {
  ballsFaced: number;
  adjAverage: number;
  adjStrikeRate: number;
  index: number;
  rating: number;
  percentile: number; // 0-1 against regular batters
  srPercentile: number;
  avgPercentile: number;
}

export interface BowlingProfile {
  ballsBowled: number;
  adjEconomy: number;
  adjAverage: number;
  adjStrikeRate: number;
  cbr: number;
  rating: number;
  percentile: number;
  econPercentile: number;
  srPercentile: number;
}

export interface PlayerRating {
  overall: number;
  batting: BattingProfile;
  bowling: BowlingProfile;
  experience: number;
  keeping: number | null;
  primary: 'BATTING' | 'BOWLING' | 'ALL_ROUND';
  confidence: SampleConfidence;
  sampleNote: string;
  tags: string[];
  /** Set for IPL legends: the rating their record alone earns, before the legend lift. */
  legendBaseOverall?: number;
}

// ─── Raw → sample-adjusted ──────────────────────────────────────────────────

function battingSample(p: Player) {
  const { runs, average, strikeRate, innings } = p.batting;
  const balls = runs > 0 && strikeRate > 0 ? (runs * 100) / strikeRate : 0;
  const outs = runs > 0 && average > 0 ? runs / average : Math.max(innings, 0);
  const prior = BAT_PRIOR[p.role];
  const priorRuns = (BAT_PRIOR_BALLS * prior.sr) / 100;
  const priorOuts = priorRuns / prior.avg;
  const adjAverage = (runs + priorRuns) / (outs + priorOuts);
  const adjStrikeRate = (100 * (runs + priorRuns)) / (balls + BAT_PRIOR_BALLS);
  return { balls, adjAverage, adjStrikeRate, index: (adjAverage * adjStrikeRate) / 100 };
}

function bowlingSample(p: Player) {
  const { wickets, economy, average } = p.bowling;
  const balls = wickets > 0 && economy > 0 && average > 0 ? (6 * wickets * average) / economy : 0;
  const runs = wickets > 0 ? wickets * average : 0;
  const prior = BOWL_PRIOR[p.role];
  const priorRuns = (BOWL_PRIOR_BALLS * prior.econ) / 6;
  const priorWkts = BOWL_PRIOR_BALLS / prior.sr;
  const totRuns = runs + priorRuns;
  const totWkts = wickets + priorWkts;
  const totBalls = balls + BOWL_PRIOR_BALLS;
  const adjAverage = totRuns / totWkts;
  const adjEconomy = (6 * totRuns) / totBalls;
  const adjStrikeRate = totBalls / totWkts;
  const cbr = 3 / (1 / adjAverage + 1 / adjEconomy + 1 / adjStrikeRate);
  return { balls, adjAverage, adjEconomy, adjStrikeRate, cbr };
}

// ─── Percentiles against the established pool ───────────────────────────────

// Share of the reference values below v (ties count half).
function percentileOf(ref: number[], v: number, higherIsBetter = true) {
  if (ref.length === 0) return 0.5;
  let below = 0;
  let equal = 0;
  for (const r of ref) {
    if (r < v) below++;
    else if (r === v) equal++;
  }
  const p = (below + equal / 2) / ref.length;
  return higherIsBetter ? p : 1 - p;
}

const toRating = (pct: number) => Math.round(40 + 59 * Math.max(0, Math.min(1, pct)));

const batRefs = ALL_PLAYERS.filter((p) => p.role !== 'BOWLER').map(battingSample).filter((s) => s.balls >= SOME_BALLS);
const bowlRefs = ALL_PLAYERS.filter((p) => p.role === 'BOWLER' || p.role === 'ALL_ROUNDER').map(bowlingSample).filter((s) => s.balls >= SOME_BALLS);

const REF = {
  batIndex: batRefs.map((s) => s.index),
  batAvg: batRefs.map((s) => s.adjAverage),
  batSr: batRefs.map((s) => s.adjStrikeRate),
  bowlCbr: bowlRefs.map((s) => s.cbr),
  bowlEcon: bowlRefs.map((s) => s.adjEconomy),
  bowlSr: bowlRefs.map((s) => s.adjStrikeRate),
  keeperRate: ALL_PLAYERS.filter((p) => p.role === 'WICKET_KEEPER' && p.batting.matches >= 10).map(
    (p) => (p.fielding.catches + p.fielding.stumpings) / p.batting.matches,
  ),
};

// Diminishing returns: 50 matches is most of the value of 200.
function experienceRating(matches: number) {
  return Math.round(40 + 59 * Math.min(1, Math.log1p(matches) / Math.log1p(200)));
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function computePlayerRating(p: Player): PlayerRating {
  const bat = battingSample(p);
  const bowl = bowlingSample(p);

  const batPct = percentileOf(REF.batIndex, bat.index);
  const bowlPct = percentileOf(REF.bowlCbr, bowl.cbr, false);
  const batting: BattingProfile = {
    ballsFaced: Math.round(bat.balls),
    adjAverage: bat.adjAverage,
    adjStrikeRate: bat.adjStrikeRate,
    index: bat.index,
    rating: toRating(batPct),
    percentile: batPct,
    avgPercentile: percentileOf(REF.batAvg, bat.adjAverage),
    srPercentile: percentileOf(REF.batSr, bat.adjStrikeRate),
  };
  const bowling: BowlingProfile = {
    ballsBowled: Math.round(bowl.balls),
    adjEconomy: bowl.adjEconomy,
    adjAverage: bowl.adjAverage,
    adjStrikeRate: bowl.adjStrikeRate,
    cbr: bowl.cbr,
    rating: toRating(bowlPct),
    percentile: bowlPct,
    econPercentile: percentileOf(REF.bowlEcon, bowl.adjEconomy, false),
    srPercentile: percentileOf(REF.bowlSr, bowl.adjStrikeRate, false),
  };

  const experience = experienceRating(p.batting.matches);
  const keeping =
    p.role === 'WICKET_KEEPER'
      ? p.batting.matches > 0
        ? toRating(percentileOf(REF.keeperRate, (p.fielding.catches + p.fielding.stumpings) / p.batting.matches))
        : 40
      : null;

  let skill: number;
  let primary: PlayerRating['primary'];
  let primaryBalls: number;
  if (p.role === 'BOWLER') {
    skill = bowling.rating;
    primary = 'BOWLING';
    primaryBalls = bowling.ballsBowled;
  } else if (p.role === 'ALL_ROUNDER') {
    // Credit the stronger suit most, but a genuine two-way player beats a one-trick one.
    const hi = Math.max(batting.rating, bowling.rating);
    const lo = Math.min(batting.rating, bowling.rating);
    skill = 0.6 * hi + 0.4 * lo;
    primary = 'ALL_ROUND';
    primaryBalls = Math.max(batting.ballsFaced, bowling.ballsBowled);
  } else if (p.role === 'WICKET_KEEPER') {
    skill = 0.88 * batting.rating + 0.12 * (keeping ?? 40);
    primary = 'BATTING';
    primaryBalls = batting.ballsFaced;
  } else {
    skill = batting.rating;
    primary = 'BATTING';
    primaryBalls = batting.ballsFaced;
  }
  const overall = Math.min(99, Math.round(0.85 * skill + 0.15 * experience));

  const confidence: SampleConfidence =
    p.batting.matches === 0 ? 'NONE' : primaryBalls >= RELIABLE_BALLS ? 'HIGH' : primaryBalls >= SOME_BALLS ? 'MEDIUM' : 'LOW';
  const sampleNote =
    confidence === 'NONE'
      ? 'No IPL matches yet. Rated at replacement level for the role.'
      : confidence === 'LOW'
        ? `Small IPL sample (${primaryBalls} balls). Rating leans towards replacement level.`
        : confidence === 'MEDIUM'
          ? `Based on ${primaryBalls} IPL balls, partly adjusted for sample size.`
          : `Based on ${primaryBalls.toLocaleString('en-IN')} IPL balls.`;

  // Descriptors only fire on real, reasonably sized records.
  const tags: string[] = [];
  if (confidence === 'NONE') tags.push('No IPL record');
  if (batting.ballsFaced >= SOME_BALLS && p.role !== 'BOWLER') {
    if (batting.srPercentile >= 0.8) tags.push('Power hitter');
    if (batting.avgPercentile >= 0.8) tags.push('Run machine');
    if (p.batting.hundreds >= 2) tags.push(`${p.batting.hundreds} IPL hundreds`);
  }
  if (bowling.ballsBowled >= SOME_BALLS && p.role !== 'BATSMAN' && p.role !== 'WICKET_KEEPER') {
    if (bowling.econPercentile >= 0.8) tags.push('Economical');
    if (bowling.srPercentile >= 0.8) tags.push('Wicket-taker');
  }
  if (p.batting.matches >= 100) tags.push(`${p.batting.matches} IPL matches`);
  if (p.metadata.captaincyAppearances > 0) tags.push('Has captained');

  // Legends (src/data/legends.ts) get a rating floor for what they mean to the IPL;
  // the record-based figure is kept so the UI can say what was lifted.
  if (p.id in LEGENDS) {
    tags.unshift(LEGEND_TAG);
    const lifted = Math.max(overall, LEGEND_MIN_OVERALL);
    return { overall: lifted, batting, bowling, experience, keeping, primary, confidence, sampleNote, tags, legendBaseOverall: overall };
  }

  return { overall, batting, bowling, experience, keeping, primary, confidence, sampleNote, tags };
}

const CACHE = new Map<string, PlayerRating>(ALL_PLAYERS.map((p) => [p.id, computePlayerRating(p)]));

export function getPlayerRating(p: Player): PlayerRating {
  let r = CACHE.get(p.id);
  if (!r) {
    r = computePlayerRating(p);
    CACHE.set(p.id, r);
  }
  return r;
}

// "Top 8%" style readout for a percentile.
export function topShare(percentile: number): string {
  const top = Math.max(1, Math.round((1 - percentile) * 100));
  return top <= 50 ? `Top ${top}%` : `Bottom ${Math.max(1, 100 - top)}%`;
}
