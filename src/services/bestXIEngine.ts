import { Player, PlayingXIDraft, Team, TeamAnalysisReport, UnitScore } from '../types';
import { PLAYERS_BY_ID } from '../data/players';
import { getPlayerRating, PlayerRating } from './playerRatings';
import { MAX_IMPACT_SUBS, MAX_OVERSEAS_IN_XI, MIN_BATTING_OPTIONS, MIN_BOWLING_OPTIONS, XI_SIZE } from './playingXIRules';

/*
  Squad analysis built on the per-player ratings in playerRatings.ts.
  The Playing XI is chosen first; batting, bowling and experience are measured on
  that XI, and depth is measured on who is left over. Pace/spin splits are not
  reported because the player data has no bowling-style field to measure them from.
*/

const EMPTY_SLOT = 30; // rating used for a slot the squad cannot fill

interface Rated {
  player: Player;
  r: PlayerRating;
}

const isBowlingOption = (p: Player) => p.role === 'BOWLER' || p.role === 'ALL_ROUNDER';
const isBattingOption = (p: Player) => p.role !== 'BOWLER';
const pctToScore = (pct: number) => Math.round(40 + 59 * Math.max(0, Math.min(1, pct)));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function weighted(values: number[], weights: number[]) {
  const padded = weights.map((_, i) => values[i] ?? EMPTY_SLOT);
  const total = weights.reduce((a, b) => a + b, 0);
  return padded.reduce((acc, v, i) => acc + v * weights[i], 0) / total;
}

function squadOf(team: Team): Rated[] {
  return team.playersBought
    .map((b) => PLAYERS_BY_ID[b.playerId])
    .filter(Boolean)
    .map((player) => ({ player, r: getPlayerRating(player) }));
}

function counts(xi: Rated[]) {
  return {
    keepers: xi.filter(({ player }) => player.role === 'WICKET_KEEPER').length,
    bowling: xi.filter(({ player }) => isBowlingOption(player)).length,
    batting: xi.filter(({ player }) => isBattingOption(player)).length,
    overseas: xi.filter(({ player }) => player.isOverseas).length,
  };
}

// Strongest legal XI: a keeper, five bowling options, five batting options and at
// most four overseas players, then as much overall rating as those rules allow.
function pickXI(squad: Rated[]): Rated[] {
  const byOverall = [...squad].sort((a, b) => b.r.overall - a.r.overall);
  if (squad.length <= XI_SIZE) return byOverall;

  const selected: Rated[] = [];
  const has = (x: Rated) => selected.includes(x);
  const osFull = () => counts(selected).overseas >= MAX_OVERSEAS_IN_XI;
  const add = (x: Rated) => {
    if (selected.length < XI_SIZE && !has(x) && !(x.player.isOverseas && osFull())) selected.push(x);
  };

  const keeper = byOverall.find(({ player }) => player.role === 'WICKET_KEEPER');
  if (keeper) add(keeper);
  const bowlers = squad.filter(({ player }) => isBowlingOption(player)).sort((a, b) => b.r.bowling.rating - a.r.bowling.rating);
  for (const b of bowlers) {
    if (counts(selected).bowling >= MIN_BOWLING_OPTIONS) break;
    add(b);
  }
  for (const x of byOverall) add(x);

  // Targets are what the squad can actually satisfy.
  const target = counts(selected);
  const legal = (xi: Rated[]) => {
    const c = counts(xi);
    return (
      c.overseas <= MAX_OVERSEAS_IN_XI &&
      c.keepers >= Math.min(1, target.keepers) &&
      c.bowling >= Math.min(MIN_BOWLING_OPTIONS, target.bowling) &&
      c.batting >= Math.min(MIN_BATTING_OPTIONS, target.batting)
    );
  };

  // Swap in any stronger bench player whose swap keeps the XI legal.
  for (let guard = 0; guard < 60; guard++) {
    let improved = false;
    const bench = byOverall.filter((x) => !has(x));
    const weakestFirst = [...selected].sort((a, b) => a.r.overall - b.r.overall);
    outer: for (const inc of bench) {
      for (const out of weakestFirst) {
        if (inc.r.overall <= out.r.overall) continue;
        const trial = selected.map((x) => (x === out ? inc : x));
        if (legal(trial)) {
          selected.splice(selected.indexOf(out), 1, inc);
          improved = true;
          break outer;
        }
      }
    }
    if (!improved) break;
  }
  return selected;
}

// Rough batting order: specialists by batting strength, then all-rounders, bowlers last.
function battingOrder(xi: Rated[]): Rated[] {
  const band = (p: Player) => (p.role === 'BOWLER' ? 2 : p.role === 'ALL_ROUNDER' ? 1 : 0);
  return [...xi].sort((a, b) => band(a.player) - band(b.player) || b.r.batting.rating - a.r.batting.rating);
}

function pickCaptain(xi: Rated[]): Rated | undefined {
  return [...xi].sort(
    (a, b) => b.player.metadata.captaincyAppearances - a.player.metadata.captaincyAppearances || b.r.overall - a.r.overall,
  )[0];
}

export function computeBestPossibleXI(team: Team): TeamAnalysisReport['bestPossibleXI'] {
  const squad = squadOf(team);
  const xi = battingOrder(pickXI(squad));
  const c = counts(xi);
  const captain = pickCaptain(xi);
  const keeper = xi.find(({ player }) => player.role === 'WICKET_KEEPER');

  const notes: string[] = [];
  if (xi.length < XI_SIZE) {
    notes.push(`Only ${plural(xi.length, 'player')} in the squad, so every one of them plays.`);
  } else {
    notes.push(
      `Strongest legal XI by player rating: ${c.bowling} bowling options, ${c.overseas}/${MAX_OVERSEAS_IN_XI} overseas` +
        (keeper ? `, ${keeper.player.name} keeping.` : ', and no specialist keeper in the squad.'),
    );
  }
  if (captain) notes.push(`${captain.player.name} leads${captain.player.metadata.captaincyAppearances > 0 ? ' (has IPL captaincy experience)' : ''}.`);

  return {
    playerIds: xi.map(({ player }) => player.id),
    captainId: captain?.player.id ?? '',
    wicketKeeperId: keeper?.player.id ?? '',
    totalProjectedScore: Math.round(mean(xi.map(({ r }) => r.overall))),
    explanation: notes.join(' '),
  };
}

/*
  A complete, rule-abiding Playing XI draft for a team (see playingXIRules.ts):
  the best XI in batting order, a specialist keeper designated, captain and
  vice-captain (IPL leadership experience first, then rating), and the five
  strongest bench players as impact substitutes. Overseas subs are left out when
  the XI already has four overseas players, because they could never come on.
*/
export function buildBestXIDraft(team: Team): PlayingXIDraft {
  const squad = squadOf(team);
  const best = computeBestPossibleXI(team);
  const xi = best.playerIds.map((id) => squad.find((x) => x.player.id === id)).filter((x): x is Rated => !!x);
  const leaders = [...xi].sort(
    (a, b) => b.player.metadata.captaincyAppearances - a.player.metadata.captaincyAppearances || b.r.overall - a.r.overall,
  );
  const captainId = leaders[0]?.player.id ?? '';
  const viceCaptainId = leaders.find((x) => x.player.id !== captainId)?.player.id ?? '';
  const keeper = xi.filter(({ player }) => player.role === 'WICKET_KEEPER').sort((a, b) => b.r.overall - a.r.overall)[0];
  const xiOverseas = xi.filter(({ player }) => player.isOverseas).length;
  const impactSubIds = squad
    .filter((x) => !best.playerIds.includes(x.player.id))
    .filter((x) => !(xiOverseas >= MAX_OVERSEAS_IN_XI && x.player.isOverseas))
    .sort((a, b) => b.r.overall - a.r.overall)
    .slice(0, MAX_IMPACT_SUBS)
    .map((x) => x.player.id);

  return {
    playerIds: best.playerIds,
    captainId,
    viceCaptainId,
    wicketKeeperId: keeper?.player.id ?? '',
    battingOrder: [...best.playerIds],
    impactSubIds,
  };
}

// Sensible batting order for any set of player ids (specialists first, bowlers last).
export function suggestBattingOrder(playerIds: string[]): string[] {
  const rated = playerIds.map((id) => PLAYERS_BY_ID[id]).filter(Boolean).map((player) => ({ player, r: getPlayerRating(player) }));
  return battingOrder(rated).map(({ player }) => player.id);
}

const unit = (score: number, title: string, description: string, keyPlayers: string[], metrics: Record<string, string | number>): UnitScore => ({
  score: Math.max(0, Math.min(99, Math.round(score))),
  title,
  description,
  keyPlayers,
  metrics,
});

export function generateTeamAnalysis(team: Team): TeamAnalysisReport {
  const squad = squadOf(team);
  const bestXI = computeBestPossibleXI(team);
  const xi = bestXI.playerIds.map((id) => squad.find((x) => x.player.id === id)).filter((x): x is Rated => !!x);
  const bench = squad.filter((x) => !bestXI.playerIds.includes(x.player.id)).sort((a, b) => b.r.overall - a.r.overall);

  // Batting: the seven best bats in the XI, top of the order weighted most.
  const bats = [...xi].sort((a, b) => b.r.batting.rating - a.r.batting.rating).slice(0, 7);
  const battingVal = weighted(bats.map((x) => x.r.batting.rating), [1, 1, 1, 0.9, 0.8, 0.7, 0.6]);
  const top3 = bats.slice(0, 3);
  const topOrderVal = weighted(top3.map((x) => pctToScore(x.r.batting.avgPercentile)), [1, 1, 1]);
  const hitters = xi
    .filter(({ player, r }) => isBattingOption(player) && r.batting.ballsFaced > 0)
    .sort((a, b) => b.r.batting.adjStrikeRate - a.r.batting.adjStrikeRate)
    .slice(0, 3);
  const finishingVal = weighted(hitters.map((x) => pctToScore(x.r.batting.srPercentile)), [1, 1, 1]);

  // Bowling: the five best bowling options carry the 20 overs.
  const attack = xi.filter(({ player }) => isBowlingOption(player)).sort((a, b) => b.r.bowling.rating - a.r.bowling.rating);
  const five = attack.slice(0, 5);
  const bowlingVal = weighted(five.map((x) => x.r.bowling.rating), [1, 1, 1, 0.9, 0.8]) + (attack.length >= 6 ? 2 : 0);
  const economyVal = weighted(five.map((x) => pctToScore(x.r.bowling.econPercentile)), [1, 1, 1, 1, 1]);
  const wicketsVal = weighted(five.map((x) => pctToScore(x.r.bowling.srPercentile)), [1, 1, 1, 1, 1]);

  const allRounders = squad.filter(({ player }) => player.role === 'ALL_ROUNDER').sort((a, b) => b.r.overall - a.r.overall);
  const allRoundVal =
    allRounders.length === 0 ? 40 : weighted(allRounders.slice(0, 2).map((x) => x.r.overall), [1, 0.6]) + (allRounders.length >= 3 ? 3 : 0);

  const keepers = squad.filter(({ player }) => player.role === 'WICKET_KEEPER').sort((a, b) => b.r.overall - a.r.overall);
  const keepingVal = keepers.length === 0 ? 30 : keepers[0].r.overall;

  const experienceVal = weighted(xi.map((x) => x.r.experience), Array(XI_SIZE).fill(1));
  const benchVal = weighted(bench.slice(0, 4).map((x) => x.r.overall), [1, 0.9, 0.8, 0.7]);

  const overall = Math.round(
    battingVal * 0.35 + bowlingVal * 0.35 + allRoundVal * 0.06 + keepingVal * 0.06 + benchVal * 0.12 + experienceVal * 0.06,
  );

  const names = (xs: Rated[]) => xs.map(({ player }) => player.shortName);
  const fmt = (n: number, d = 1) => (Number.isFinite(n) && n > 0 ? n.toFixed(d) : '-');

  const battingScore = unit(battingVal, 'Batting', 'Batting rating of the seven best bats in the XI, top of the order weighted most.', names(bats.slice(0, 4)), {
    'Batting options': counts(xi).batting,
  });
  const topOrderScore = unit(topOrderVal, 'Top order', 'Runs per dismissal of the three best batters, ranked against the pool.', names(top3), {
    'Avg (sample-adjusted)': fmt(mean(top3.map((x) => x.r.batting.adjAverage))),
  });
  const finishingScore = unit(finishingVal, 'Hitting power', 'Strike rate of the three fastest scorers in the XI, ranked against the pool.', names(hitters), {
    'SR (sample-adjusted)': fmt(mean(hitters.map((x) => x.r.batting.adjStrikeRate))),
  });
  const bowlingScore = unit(bowlingVal, 'Bowling', 'Combined Bowling Rate of the five main bowlers: wickets, how fast they come, and runs conceded.', names(five), {
    'Bowling options': attack.length,
  });
  const economyScore = unit(economyVal, 'Run control', 'Economy rate of the five main bowlers, ranked against the pool.', names(five.slice(0, 3)), {
    'Econ (sample-adjusted)': fmt(mean(five.map((x) => x.r.bowling.adjEconomy)), 2),
  });
  const wicketTakingScore = unit(wicketsVal, 'Wicket-taking', 'Balls per wicket for the five main bowlers, ranked against the pool.', names(five.slice(0, 3)), {
    'Balls per wicket': fmt(mean(five.map((x) => x.r.bowling.adjStrikeRate))),
  });
  const allRoundersScore = unit(allRoundVal, 'All-rounders', 'Rating of the two best all-rounders, plus a bonus for having three or more.', names(allRounders.slice(0, 3)), {
    'All-rounders': allRounders.length,
  });
  const wicketkeepingScore = unit(keepingVal, 'Wicket-keeping', 'Overall rating of the best specialist keeper in the squad.', names(keepers.slice(0, 2)), {
    Keepers: keepers.length,
  });
  const experienceScore = unit(experienceVal, 'Experience', 'IPL matches played by the XI, with diminishing returns past about 50.', [], {
    'IPL matches in XI': xi.reduce((s, x) => s + x.player.batting.matches, 0),
  });
  const benchStrengthScore = unit(benchVal, 'Bench depth', 'Overall rating of the four best players outside the XI.', names(bench.slice(0, 4)), {
    'Bench players': bench.length,
  });

  const units = [topOrderScore, finishingScore, economyScore, wicketTakingScore, allRoundersScore, wicketkeepingScore, benchStrengthScore];
  const strengths = units
    .filter((u) => u.score >= 80)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((u) => `${u.title} (${u.score})${u.keyPlayers.length ? `: ${u.keyPlayers.slice(0, 3).join(', ')}` : ''}`);

  const c = counts(xi);
  const weaknesses: string[] = [];
  if (squad.length < XI_SIZE) weaknesses.push(`Squad has ${plural(squad.length, 'player')}, ${XI_SIZE - squad.length} short of a full XI`);
  if (keepers.length === 0) weaknesses.push('No specialist wicket-keeper in the squad');
  if (c.bowling < MIN_BOWLING_OPTIONS) weaknesses.push(`Only ${plural(c.bowling, 'bowling option')} in the XI; T20 needs five`);
  if (squad.filter(({ player }) => player.isOverseas).length > 8) weaknesses.push('More than 8 overseas players in the squad');
  units
    .filter((u) => u.score < 58)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .forEach((u) => weaknesses.push(`${u.title} is thin (${u.score})`));

  return {
    teamId: team.id,
    teamName: team.name,
    overallScore: Math.max(0, Math.min(99, overall)),
    battingScore,
    topOrderScore,
    finishingScore,
    bowlingScore,
    economyScore,
    wicketTakingScore,
    allRoundersScore,
    wicketkeepingScore,
    experienceScore,
    benchStrengthScore,
    strengths,
    weaknesses,
    bestPossibleXI: bestXI,
    dataSourceNotes:
      'Ratings use IPL career numbers only: Batting Index (average x strike rate) and Combined Bowling Rate, adjusted for sample size and ranked against the auction pool. They describe past output, not a forecast.',
  };
}
