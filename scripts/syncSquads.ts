/**
 * AuctionArena — IPL Squad Sync
 * ==============================
 * Pulls the current official squads from iplt20.com and keeps the player pool in
 * step with them:
 *   - pool players found in a squad get that franchise as their current team
 *   - squad players missing from the pool are added as new players
 *
 * Squad players are matched to the pool by exact name, or by first initial +
 * surname + country ("Mitch Marsh" ~ "Mitchell Marsh"). Per-player corrections
 * live in scripts/squad-overrides.json, keyed by the IPL player id:
 *   { "12345": "p-67" }   this squad player is pool player p-67
 *   { "12345": "new" }    this squad player is a different person; add them
 *
 * New players keep their pool id across runs. Afterwards run `npm run sync:stats`
 * for their Cricsheet records and `npm run sync:images` for their photos.
 *
 * Outputs:
 *   src/data/squads.generated.ts   the squads, each entry linked to a pool id
 *   squad-sync-report.json         how each squad player was matched
 *
 * Usage:  npm run sync:squads
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ALL_PLAYERS } from '../src/data/players';
import { SQUAD_PLAYERS } from '../src/data/squads.generated';
import type { SquadPlayer } from '../src/data/squads';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OVERRIDES_PATH = path.join(ROOT, 'scripts', 'squad-overrides.json');
const GENERATED_PATH = path.join(ROOT, 'src', 'data', 'squads.generated.ts');
const REPORT_PATH = path.join(ROOT, 'squad-sync-report.json');

const IPL_TEAMS_API = 'https://www.iplt20.com/api/bff/cms/teams/';
const USER_AGENT = 'AuctionArenaSquadSync/1.0 (local development script)';

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function getJson(url: string): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) });
      if (res.ok) return res.json();
      if (attempt >= 4) throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      if (attempt >= 4) throw err;
    }
    await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
  }
}

interface ApiPlayer {
  externalId: number;
  name: string;
  role: string;
  country: string;
  isInternational: boolean;
  isCaptain: boolean;
  isWicketKeeper: boolean;
}

async function fetchSquads(): Promise<{ team: string; players: ApiPlayer[] }[]> {
  const first = await getJson(`${IPL_TEAMS_API}chennai-super-kings?tab=squad`);
  const slugs: string[] = (first.data?.teams ?? []).map((t: { slug: string }) => t.slug);
  if (slugs.length === 0) throw new Error('IPL team list is empty — the iplt20.com API may have changed');
  const squads = [];
  for (const slug of slugs) {
    const json = slug === 'chennai-super-kings' ? first : await getJson(`${IPL_TEAMS_API}${slug}?tab=squad`);
    squads.push({ team: json.data.title as string, players: (json.data.squad?.players ?? []) as ApiPlayer[] });
  }
  return squads;
}

async function main() {
  const squads = await fetchSquads();
  const overrides: Record<string, string> = fs.existsSync(OVERRIDES_PATH) ? JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8')) : {};

  // Match against the hand-curated pool only, not players this script added last time.
  const previouslyAdded = new Map(SQUAD_PLAYERS.filter(s => s.isNew).map(s => [s.iplId, s.poolId]));
  const addedIds = new Set(previouslyAdded.values());
  const pool = ALL_PLAYERS.filter(p => !addedIds.has(p.id));
  const poolById = new Map(pool.map(p => [p.id, p]));
  const byName = new Map<string, string[]>();
  const byInitialSurname = new Map<string, string[]>();
  for (const p of pool) {
    const words = norm(p.name).split(' ');
    byName.set(words.join(' '), [...(byName.get(words.join(' ')) ?? []), p.id]);
    const key = `${words[0][0]} ${words[words.length - 1]}|${p.nationality}`;
    byInitialSurname.set(key, [...(byInitialSurname.get(key) ?? []), p.id]);
  }

  let nextId = Math.max(...ALL_PLAYERS.map(p => Number(p.id.slice(2)) || 0)) + 1;
  const entries: SquadPlayer[] = [];
  const report: { iplId: number; name: string; team: string; match: string; poolId: string; poolName?: string }[] = [];
  const claimed = new Map<string, string>();

  // Overrides and exact names claim pool players first, so a loose initial+surname
  // match ("Kuldip Yadav" ~ "Kuldeep Yadav") can't take a player someone else owns.
  const squadPlayers = squads.flatMap(({ team, players }) => players.map(a => ({ team, a })));
  const decided = new Map<number, { poolId?: string; match: string }>();
  const looseCandidates: { a: ApiPlayer; poolId: string }[] = [];
  for (const { a } of squadPlayers) {
    const words = norm(a.name).split(' ');
    const forced = overrides[String(a.externalId)];
    if (forced && forced !== 'new') {
      if (!poolById.has(forced)) throw new Error(`Override for ${a.name} (${a.externalId}) points at unknown pool id ${forced}`);
      decided.set(a.externalId, { poolId: forced, match: 'OVERRIDE' });
    } else if (forced === 'new') {
      decided.set(a.externalId, { match: 'NEW (override)' });
    } else {
      const exact = byName.get(words.join(' ')) ?? [];
      const loose = byInitialSurname.get(`${words[0][0]} ${words[words.length - 1]}|${a.country}`) ?? [];
      if (exact.length === 1) decided.set(a.externalId, { poolId: exact[0], match: 'EXACT' });
      else if (exact.length === 0 && loose.length === 1) looseCandidates.push({ a, poolId: loose[0] });
      else decided.set(a.externalId, { match: 'NEW' });
    }
  }
  for (const [iplId, d] of decided) {
    if (!d.poolId) continue;
    if (claimed.has(d.poolId)) throw new Error(`Two squad players both matched ${d.poolId} — add an override for ${iplId}`);
    claimed.set(d.poolId, String(iplId));
  }
  const looseCount = new Map<string, number>();
  for (const c of looseCandidates) looseCount.set(c.poolId, (looseCount.get(c.poolId) ?? 0) + 1);
  for (const c of looseCandidates) {
    const free = !claimed.has(c.poolId) && looseCount.get(c.poolId) === 1;
    decided.set(c.a.externalId, free ? { poolId: c.poolId, match: 'INITIAL+SURNAME' } : { match: 'NEW' });
    if (free) claimed.set(c.poolId, String(c.a.externalId));
  }

  for (const { team, a } of squadPlayers) {
    const { poolId: matched, match } = decided.get(a.externalId)!;
    const isNew = !matched;
    const poolId = matched ?? previouslyAdded.get(a.externalId) ?? `p-${nextId++}`;
    entries.push({
      iplId: a.externalId,
      name: a.name,
      team,
      role: a.role,
      country: a.country,
      isInternational: a.isInternational,
      isWicketKeeper: a.isWicketKeeper,
      isCaptain: a.isCaptain,
      poolId,
      isNew,
    });
    report.push({ iplId: a.externalId, name: a.name, team, match, poolId, poolName: isNew ? undefined : poolById.get(poolId)!.name });
  }

  const season = new Date().getFullYear();
  const body = entries.map(e => `  ${JSON.stringify(e)},`).join('\n');
  fs.writeFileSync(
    GENERATED_PATH,
    `// AUTO-GENERATED by scripts/syncSquads.ts — do not edit by hand. Run \`npm run sync:squads\`.\n` +
      `// Source: official squads on iplt20.com, fetched ${new Date().toISOString().slice(0, 10)}.\n` +
      `import type { SquadPlayer } from './squads';\n\n` +
      `export const SQUAD_SEASON = ${JSON.stringify(String(season))};\n\n` +
      `export const SQUAD_PLAYERS: SquadPlayer[] = [\n${body}\n];\n`,
    'utf-8',
  );
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  const counts = report.reduce<Record<string, number>>((acc, r) => ((acc[r.match] = (acc[r.match] ?? 0) + 1), acc), {});
  console.log(`${entries.length} squad players across ${squads.length} teams`, counts);
  for (const r of report.filter(r => r.match === 'INITIAL+SURNAME')) console.log(`  CHECK  ${r.name} (${r.team}) → ${r.poolId} ${r.poolName}`);
  console.log(`\nWrote ${path.relative(ROOT, GENERATED_PATH)} and ${path.relative(ROOT, REPORT_PATH)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
