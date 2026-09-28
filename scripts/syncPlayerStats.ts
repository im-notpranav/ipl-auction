/**
 * AuctionArena — Player Stats Sync
 * =================================
 * Computes every player's IPL career record from Cricsheet's ball-by-ball data
 * (https://cricsheet.org, released under the Open Data Commons Attribution License).
 * Nothing is typed in or estimated: every figure is counted from the delivery log.
 *
 * Players are matched to Cricsheet's people register BY NAME, and a match is only
 * accepted when it is exact or the player also turned out for one of their listed
 * franchises. Per-player corrections live in scripts/player-stats-overrides.json:
 *   { "p-123": "<cricsheet identifier>" }   force a match
 *   { "p-123": null }                       player has no IPL record
 *
 * Outputs:
 *   src/data/playerStats.generated.ts   id -> career stats used by the app
 *   player-stats-report.json            how each player was matched, and why not
 *
 * Usage:  npm run sync:stats              (re-downloads if the cache is over a day old)
 *         npm run sync:stats -- --refresh (always re-download)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { unzipSync, strFromU8 } from 'fflate';
import { ALL_PLAYERS } from '../src/data/players';
import type { PlayerStatsRecord } from '../src/data/playerStats';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'cricsheet');
const OVERRIDES_PATH = path.join(ROOT, 'scripts', 'player-stats-overrides.json');
const GENERATED_PATH = path.join(ROOT, 'src', 'data', 'playerStats.generated.ts');
const REPORT_PATH = path.join(ROOT, 'player-stats-report.json');
const REFRESH = process.argv.includes('--refresh');

const MATCHES_ZIP_URL = 'https://cricsheet.org/downloads/ipl_json.zip';
const NAMES_CSV_URL = 'https://cricsheet.org/register/names.csv';
const USER_AGENT = 'AuctionArenaStatsSync/1.0 (local development script)';

// Dismissals credited to the bowler. Run outs, retirements and obstruction are not.
const BOWLER_WICKETS = new Set(['bowled', 'caught', 'caught and bowled', 'lbw', 'stumped', 'hit wicket']);
// A batter who retires hurt / not out is not dismissed, so the innings stays "not out".
const NOT_DISMISSED = new Set(['retired hurt', 'retired not out']);

// Franchises that were renamed, so "played for Delhi Daredevils" counts as Delhi Capitals.
const TEAM_ALIASES: Record<string, string> = {
  'Delhi Daredevils': 'Delhi Capitals',
  'Kings XI Punjab': 'Punjab Kings',
  'Royal Challengers Bangalore': 'Royal Challengers Bengaluru',
  'Rising Pune Supergiants': 'Rising Pune Supergiant',
};
const canonicalTeam = (t: string) => TEAM_ALIASES[t] ?? t;

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD
// ─────────────────────────────────────────────────────────────────────────────
async function cachedDownload(url: string): Promise<Buffer> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, path.basename(url));
  const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 24 * 3600 * 1000;
  if (fresh && !REFRESH) return fs.readFileSync(file);
  console.log(`Downloading ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRICSHEET TYPES (only the fields we read)
// ─────────────────────────────────────────────────────────────────────────────
interface Fielder { name?: string; substitute?: boolean }
interface Wicket { kind: string; player_out: string; fielders?: Fielder[] }
interface Delivery {
  batter: string;
  bowler: string;
  non_striker: string;
  runs: { batter: number; extras: number; total: number; non_boundary?: boolean };
  extras?: { wides?: number; noballs?: number; byes?: number; legbyes?: number; penalty?: number };
  wickets?: Wicket[];
}
interface Innings { team: string; super_over?: boolean; overs?: { deliveries: Delivery[] }[] }
interface Match {
  info: { dates: string[]; players: Record<string, string[]>; registry: { people: Record<string, string> } };
  innings?: Innings[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CAREER ACCUMULATOR
// ─────────────────────────────────────────────────────────────────────────────
interface Career {
  names: Set<string>;
  teams: Set<string>;
  seasons: Set<string>;
  matches: number;
  lastMatch: string;
  // batting
  batInnings: number; runs: number; ballsFaced: number; outs: number;
  fifties: number; hundreds: number; fours: number; sixes: number; highest: number;
  // bowling
  bowlInnings: number; balls: number; conceded: number; wickets: number;
  best: { w: number; r: number } | null; fourW: number; fiveW: number;
  // fielding
  catches: number; stumpings: number; runOuts: number;
}

const newCareer = (): Career => ({
  names: new Set(), teams: new Set(), seasons: new Set(), matches: 0, lastMatch: '',
  batInnings: 0, runs: 0, ballsFaced: 0, outs: 0, fifties: 0, hundreds: 0, fours: 0, sixes: 0, highest: 0,
  bowlInnings: 0, balls: 0, conceded: 0, wickets: 0, best: null, fourW: 0, fiveW: 0,
  catches: 0, stumpings: 0, runOuts: 0,
});

function accumulate(matches: Match[]): Map<string, Career> {
  const careers = new Map<string, Career>();
  const get = (id: string) => {
    let c = careers.get(id);
    if (!c) careers.set(id, (c = newCareer()));
    return c;
  };

  for (const m of matches) {
    const reg = m.info.registry.people;
    const date = m.info.dates[0];
    const season = date.slice(0, 4);
    const idOf = (name: string) => reg[name];

    // Squads include the impact player, matching how official records count appearances.
    for (const [team, squad] of Object.entries(m.info.players)) {
      for (const name of squad) {
        const c = get(idOf(name));
        c.names.add(name);
        c.teams.add(canonicalTeam(team));
        c.seasons.add(season);
        c.matches++;
        if (date > c.lastMatch) c.lastMatch = date;
      }
    }

    for (const inn of m.innings ?? []) {
      if (inn.super_over) continue; // super overs are not part of career records
      const batRuns = new Map<string, number>(); // everyone who came to the crease
      const bowl = new Map<string, { w: number; r: number }>();
      const arrive = (name: string) => {
        if (!batRuns.has(name)) batRuns.set(name, 0);
      };

      for (const over of inn.overs ?? []) {
        for (const d of over.deliveries) {
          const ex = d.extras ?? {};
          arrive(d.batter);
          arrive(d.non_striker);
          const bc = get(idOf(d.batter));

          batRuns.set(d.batter, batRuns.get(d.batter)! + d.runs.batter);
          bc.runs += d.runs.batter;
          if (!ex.wides) bc.ballsFaced++;
          if (d.runs.batter === 4 && !d.runs.non_boundary) bc.fours++;
          if (d.runs.batter === 6 && !d.runs.non_boundary) bc.sixes++;

          const bw = bowl.get(d.bowler) ?? { w: 0, r: 0 };
          bowl.set(d.bowler, bw);
          const bwc = get(idOf(d.bowler));
          if (!ex.wides && !ex.noballs) bwc.balls++;
          // Byes, leg byes and penalties are not charged to the bowler.
          const charged = d.runs.batter + (ex.wides ?? 0) + (ex.noballs ?? 0);
          bwc.conceded += charged;
          bw.r += charged;

          for (const w of d.wickets ?? []) {
            if (!NOT_DISMISSED.has(w.kind)) {
              arrive(w.player_out);
              get(idOf(w.player_out)).outs++;
            }
            if (BOWLER_WICKETS.has(w.kind)) {
              bwc.wickets++;
              bw.w++;
            }
            if (w.kind === 'caught and bowled') bwc.catches++;
            for (const f of w.fielders ?? []) {
              if (!f.name || f.substitute) continue;
              const fc = get(idOf(f.name));
              if (w.kind === 'caught') fc.catches++;
              else if (w.kind === 'stumped') fc.stumpings++;
              else if (w.kind === 'run out') fc.runOuts++;
            }
          }
        }
      }

      for (const [name, runs] of batRuns) {
        const c = get(idOf(name));
        c.batInnings++;
        if (runs >= 100) c.hundreds++;
        else if (runs >= 50) c.fifties++;
        if (runs > c.highest) c.highest = runs;
      }
      for (const [name, b] of bowl) {
        const c = get(idOf(name));
        c.bowlInnings++;
        if (b.w >= 5) c.fiveW++;
        else if (b.w === 4) c.fourW++;
        if (!c.best || b.w > c.best.w || (b.w === c.best.w && b.r < c.best.r)) c.best = { ...b };
      }
    }
  }
  return careers;
}

// Scorecards truncate rather than round (Kohli's 8004 / 207 is published as 38.66).
const round2 = (n: number) => Math.floor(n * 100 + 1e-9) / 100;

function toRecord(id: string, c: Career): PlayerStatsRecord {
  const seasons = [...c.seasons].sort();
  return {
    cricsheetId: id,
    cricsheetName: [...c.names][0],
    seasons: seasons.length,
    firstSeason: seasons[0],
    lastSeason: seasons[seasons.length - 1],
    batting: {
      matches: c.matches,
      innings: c.batInnings,
      runs: c.runs,
      average: c.outs > 0 ? round2(c.runs / c.outs) : 0,
      strikeRate: c.ballsFaced > 0 ? round2((c.runs / c.ballsFaced) * 100) : 0,
      fifties: c.fifties,
      hundreds: c.hundreds,
      fours: c.fours,
      sixes: c.sixes,
      highestScore: c.highest,
    },
    bowling: {
      matches: c.matches,
      innings: c.bowlInnings,
      overs: Math.floor(c.balls / 6) + (c.balls % 6) / 10,
      balls: c.balls,
      runsConceded: c.conceded,
      wickets: c.wickets,
      economy: c.balls > 0 ? round2((c.conceded * 6) / c.balls) : 0,
      average: c.wickets > 0 ? round2(c.conceded / c.wickets) : 0,
      strikeRate: c.wickets > 0 ? round2(c.balls / c.wickets) : 0,
      bestBowling: c.best ? `${c.best.w}/${c.best.r}` : '0/0',
      fourWicketHauls: c.fourW,
      fiveWicketHauls: c.fiveW,
    },
    fielding: { catches: c.catches, stumpings: c.stumpings, runOuts: c.runOuts },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NAME MATCHING
// ─────────────────────────────────────────────────────────────────────────────
type MatchStatus = 'OVERRIDE' | 'EXACT' | 'INITIALS+TEAM' | 'NO_IPL_RECORD' | 'UNRESOLVED';

interface Candidate { id: string; names: string[]; teams: string[]; lastMatch: string }

interface MatchResult {
  id: string;
  name: string;
  teams: string[];
  status: MatchStatus;
  cricsheetId?: string;
  cricsheetName?: string;
  candidates?: Candidate[];
}

// "RG Sharma" -> initials "RG", surname "sharma". Returns null for full-word names.
function initialsForm(csName: string): { initials: string; surname: string } | null {
  const m = csName.match(/^([A-Z]{1,4})\s+(.+)$/);
  return m ? { initials: m[1], surname: norm(m[2]) } : null;
}

function buildMatcher(careers: Map<string, Career>, namesCsv: string) {
  const aliases = new Map<string, Set<string>>(); // cricsheet id -> every known spelling
  for (const [id, c] of careers) aliases.set(id, new Set(c.names));
  for (const line of namesCsv.split(/\r?\n/).slice(1)) {
    const comma = line.indexOf(',');
    if (comma < 0) continue;
    const id = line.slice(0, comma);
    const name = line.slice(comma + 1).replace(/^"|"$/g, '');
    aliases.get(id)?.add(name); // only people who have actually played in the IPL
  }

  const byNorm = new Map<string, Set<string>>();
  for (const [id, names] of aliases) {
    for (const n of names) {
      const k = norm(n);
      if (!byNorm.has(k)) byNorm.set(k, new Set());
      byNorm.get(k)!.add(id);
    }
  }

  const describe = (id: string): Candidate => {
    const c = careers.get(id)!;
    return { id, names: [...aliases.get(id)!], teams: [...c.teams], lastMatch: c.lastMatch };
  };
  const playedFor = (id: string, teams: Set<string>) => [...careers.get(id)!.teams].some(t => teams.has(t));

  return (name: string, teams: Set<string>): { status: MatchStatus; cricsheetId?: string; candidates?: Candidate[] } => {
    const exact = [...(byNorm.get(norm(name)) ?? [])];
    const exactOnTeam = exact.filter(id => playedFor(id, teams));
    if (exact.length === 1) return { status: 'EXACT', cricsheetId: exact[0] };
    if (exactOnTeam.length === 1) return { status: 'EXACT', cricsheetId: exactOnTeam[0] };

    // Initials form: "Rohit Gurunath Sharma" ~ "RG Sharma" when the first initial and
    // surname agree. Too loose on its own, so it also has to share a franchise.
    const words = norm(name).split(' ');
    const initialsHits = new Set<string>();
    for (const [id, names] of aliases) {
      for (const n of names) {
        const f = initialsForm(n);
        if (!f) continue;
        const sw = f.surname.split(' ').length;
        if (words.length <= sw) continue;
        if (words.slice(-sw).join(' ') !== f.surname) continue;
        if (f.initials[0].toLowerCase() !== words[0][0]) continue;
        initialsHits.add(id);
      }
    }
    const onTeam = [...initialsHits].filter(id => playedFor(id, teams));
    if (onTeam.length === 1 && exact.length === 0) return { status: 'INITIALS+TEAM', cricsheetId: onTeam[0] };

    const candidates = [...new Set([...exact, ...initialsHits])].map(describe);
    return candidates.length ? { status: 'UNRESOLVED', candidates } : { status: 'NO_IPL_RECORD' };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const zip = unzipSync(new Uint8Array(await cachedDownload(MATCHES_ZIP_URL)));
  const matches: Match[] = Object.entries(zip)
    .filter(([file]) => file.endsWith('.json'))
    .map(([, bytes]) => JSON.parse(strFromU8(bytes)));
  matches.sort((a, b) => a.info.dates[0].localeCompare(b.info.dates[0]));
  const lastMatch = matches[matches.length - 1].info.dates[0];
  console.log(`Loaded ${matches.length} IPL matches (${matches[0].info.dates[0]} → ${lastMatch})`);

  const careers = accumulate(matches);
  const namesCsv = (await cachedDownload(NAMES_CSV_URL)).toString('utf-8');
  const match = buildMatcher(careers, namesCsv);
  const overrides: Record<string, string | null> = fs.existsSync(OVERRIDES_PATH)
    ? JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8'))
    : {};

  const results: MatchResult[] = [];
  const records: Record<string, PlayerStatsRecord | null> = {};
  for (const p of ALL_PLAYERS) {
    const teams = new Set([p.previousIPLTeam, p.official2026Team].filter((t): t is string => !!t).map(canonicalTeam));
    let r: { status: MatchStatus; cricsheetId?: string; candidates?: Candidate[] };
    if (p.id in overrides) {
      const forced = overrides[p.id];
      if (forced && !careers.has(forced)) throw new Error(`Override for ${p.id} points at unknown Cricsheet id ${forced}`);
      r = forced ? { status: 'OVERRIDE', cricsheetId: forced } : { status: 'NO_IPL_RECORD' };
    } else {
      r = match(p.name, teams);
    }
    const career = r.cricsheetId ? careers.get(r.cricsheetId)! : undefined;
    results.push({ id: p.id, name: p.name, teams: [...teams], ...r, cricsheetName: career ? [...career.names][0] : undefined });
    // UNRESOLVED players get no entry, so the app keeps them marked "stats unavailable"
    // rather than showing them as a debutant with zero matches.
    if (career) records[p.id] = toRecord(r.cricsheetId!, career);
    else if (r.status === 'NO_IPL_RECORD') records[p.id] = null;
  }

  const counts = results.reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
  const header =
    `// AUTO-GENERATED by scripts/syncPlayerStats.ts — do not edit by hand. Run \`npm run sync:stats\`.\n` +
    `// Source: Cricsheet (https://cricsheet.org), Open Data Commons Attribution License.\n` +
    `// ${matches.length} IPL matches up to ${lastMatch}. null = no IPL appearances.\n`;
  const body = Object.entries(records).map(([id, rec]) => `  ${JSON.stringify(id)}: ${JSON.stringify(rec)},`).join('\n');
  fs.writeFileSync(
    GENERATED_PATH,
    `${header}import type { PlayerStatsRecord } from './playerStats';\n\n` +
      `export const STATS_DATA_THROUGH = ${JSON.stringify(lastMatch)};\n\n` +
      `export const PLAYER_STATS: Record<string, PlayerStatsRecord | null> = {\n${body}\n};\n`,
    'utf-8',
  );
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), dataThrough: lastMatch, counts, results }, null, 2));

  console.log(counts);
  for (const r of results.filter(r => r.status === 'UNRESOLVED')) {
    const options = r.candidates!.map(c => `${c.id} ${c.names[0]} (${c.teams.join('/')}, last ${c.lastMatch})`);
    console.log(`  UNRESOLVED ${r.id} ${r.name} [${r.teams.join(', ')}] → ${options.join(' | ')}`);
  }
  console.log(`\nWrote ${path.relative(ROOT, GENERATED_PATH)} and ${path.relative(ROOT, REPORT_PATH)}`);
}

export { accumulate, toRecord, cachedDownload, MATCHES_ZIP_URL };
export type { Match };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
