/**
 * AuctionArena — Player Image Sync
 * =================================
 * Finds a photo for every player BY NAME (never by guessed provider IDs) and
 * stores it locally as public/players/{id}.webp.
 *
 * Source priority (first hit wins):
 *   1. MANUAL     your own file in player-photos/, named "<Player Name>.jpg" or "<id>.png"
 *   2. IPL        official iplt20.com squad pages (name and headshot come together)
 *   3. WIKIPEDIA  article whose title exactly matches the name and is described as a
 *                 cricketer of the right nationality; free-licensed images only
 * Per-player corrections live in scripts/player-image-overrides.json.
 *
 * Outputs:
 *   public/players/{id}.webp              the photos (400x500)
 *   src/data/playerImages.generated.ts    id -> photo index used by the app
 *   player-image-report.json              per-player result and reason
 *   player-image-review.html              open in a browser to eyeball every photo
 *
 * Usage:  npm run sync:images
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { ALL_PLAYERS } from '../src/data/players';
import type { PlayerImageRecord, PlayerImageSource } from '../src/data/playerImages';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'players');
const MANUAL_DIR = path.join(ROOT, 'player-photos');
const OVERRIDES_PATH = path.join(ROOT, 'scripts', 'player-image-overrides.json');
const GENERATED_PATH = path.join(ROOT, 'src', 'data', 'playerImages.generated.ts');
const REPORT_PATH = path.join(ROOT, 'player-image-report.json');
const REVIEW_PATH = path.join(ROOT, 'player-image-review.html');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'player-images');
const REFRESH = process.argv.includes('--refresh');

const IPL_USER_AGENT = 'Mozilla/5.0 (compatible; AuctionArenaImageSync/2.0; local development script)';
// Wikimedia asks bots for a descriptive, non-browser User-Agent and throttles generic ones.
const WIKI_USER_AGENT = 'AuctionArenaImageSync/2.0 (local development script; node-fetch)';
const IPL_TEAMS_API = 'https://www.iplt20.com/api/bff/cms/teams/';
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIDTH = 400;
const HEIGHT = 500;
const MANUAL_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];

// Demonyms used to reject a same-named cricketer from another country.
// "west indian" is collapsed to one token first so it never matches "indian".
const DEMONYMS: Record<string, string[]> = {
  'India': ['indian'],
  'Australia': ['australian'],
  'Afghanistan': ['afghan', 'afghanistani'],
  'South Africa': ['south african'],
  'England': ['english', 'british'],
  'New Zealand': ['new zealand'],
  'West Indies': ['westindian', 'jamaican', 'trinidadian', 'barbadian', 'guyanese', 'antiguan', 'grenadian', 'vincentian', 'kittitian', 'saint lucian', 'dominican'],
  'Zimbabwe': ['zimbabwean'],
  'Sri Lanka': ['sri lankan'],
  'Ireland': ['irish'],
  'Bangladesh': ['bangladeshi'],
  'Netherlands': ['dutch'],
  'Oman': ['omani'],
  'Pakistan': ['pakistani'],
  'Namibia': ['namibian'],
  'USA': ['american'],
  'Scotland': ['scottish'],
  'Nepal': ['nepali', 'nepalese'],
  'UAE': ['emirati'],
};

interface Override { iplName?: string; wikipedia?: string; commonsFile?: string; skipIpl?: boolean; skipWikipedia?: boolean }

interface PlayerRef { id: string; name: string; nationality: string; role: string }

interface Result extends PlayerRef {
  source: PlayerImageSource | 'NONE';
  matchedAs?: string;
  sourceUrl?: string;
  credit?: string;
  license?: string;
  notes: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const sha1 = (buf: Buffer) => crypto.createHash('sha1').update(buf).digest('hex');

async function fetchWithRetry(url: string, tries = 6, timeoutMs = 20000): Promise<Response> {
  const userAgent = /wiki(pedia|media)\.org/.test(url) ? WIKI_USER_AGENT : IPL_USER_AGENT;
  for (let attempt = 1; ; attempt++) {
    let wait = 1000 * attempt;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok || res.status === 404 || attempt >= tries) return res;
      const retryAfter = Number(res.headers.get('retry-after'));
      if (res.status === 429) wait = Math.max(5000 * attempt, (retryAfter || 0) * 1000);
    } catch (err) {
      if (attempt >= tries) throw err;
    }
    await sleep(Math.min(wait, 30000));
  }
}

async function getJson(url: string): Promise<any> {
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Downloads are cached so re-runs don't re-fetch every photo (Wikimedia throttles repeat
// downloads hard). Pass --refresh to ignore the cache, e.g. after IPL updates its headshots.
async function getImage(url: string): Promise<Buffer> {
  const cached = path.join(CACHE_DIR, sha1(Buffer.from(url)));
  if (!REFRESH && fs.existsSync(cached)) return fs.readFileSync(cached);
  // Generous timeout: Wikimedia renders a thumbnail on first request, which can be slow.
  const res = await fetchWithRetry(url, 6, 60000);
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.startsWith('image/')) throw new Error(`HTTP ${res.status} ${type} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cached, buf);
  return buf;
}

// Wikimedia asks for thumbnails in its standard sizes rather than originals
// (https://w.wiki/GHai). imageinfo returns the original when the file is narrower
// than the requested width, so build the largest standard thumbnail below its width.
const WIKI_THUMB_WIDTHS = [960, 500, 330];
function standardWikiThumb(url: string, fileWidth: number): string {
  const clean = url.split('?')[0];
  if (clean.includes('/thumb/')) return clean;
  const width = WIKI_THUMB_WIDTHS.find(w => w < fileWidth);
  const m = /^(https:\/\/upload\.wikimedia\.org\/[^/]+\/[^/]+)\/(.+\/([^/]+))$/.exec(clean);
  if (!width || !m) return clean;
  return `${m[1]}/thumb/${m[2]}/${width}px-${m[3]}`;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}

// Normalises any source photo to a 400x500 WebP. IPL headshots are transparent
// cutouts, so they are trimmed and anchored to the top (head); other photos use
// sharp's attention crop to keep the subject in frame.
async function toWebp(buf: Buffer, source: PlayerImageSource): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  if (meta.format === 'svg') throw new Error('vector placeholder, not a photo');
  if (!meta.width || !meta.height || meta.width < 120 || meta.height < 120) {
    throw new Error(`image too small (${meta.width}x${meta.height})`);
  }
  // Landscape photos (usually action shots) would lose the player to a 4:5 crop, so they
  // are shown whole over a blurred, darkened copy of themselves instead.
  const rotated = (meta.orientation ?? 1) >= 5;
  const landscape = source !== 'IPL' && (rotated ? meta.height > meta.width : meta.width > meta.height);
  if (landscape) {
    const backdrop = await sharp(buf).rotate().resize({ width: WIDTH, height: HEIGHT, fit: 'cover' })
      .blur(18).modulate({ brightness: 0.55 }).toBuffer();
    const photo = await sharp(buf).rotate().resize({ width: WIDTH, height: HEIGHT, fit: 'inside' }).toBuffer();
    return sharp(backdrop).composite([{ input: photo, gravity: 'center' }]).webp({ quality: 82 }).toBuffer();
  }
  const input = source === 'IPL' ? await sharp(buf).trim().toBuffer().catch(() => buf) : buf;
  return sharp(input)
    .rotate()
    .resize({ width: WIDTH, height: HEIGHT, fit: 'cover', position: source === 'IPL' ? 'top' : sharp.strategy.attention })
    .webp({ quality: 82 })
    .toBuffer();
}

function loadOverrides(): Record<string, Override> {
  if (!fs.existsSync(OVERRIDES_PATH)) return {};
  const raw = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8'));
  delete raw._help;
  return raw;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 1 — MANUAL PHOTOS
// ─────────────────────────────────────────────────────────────────────────────
function findManualPhotos(players: PlayerRef[]): { byId: Map<string, string>; unmatched: string[] } {
  const byId = new Map<string, string>();
  const unmatched: string[] = [];
  if (!fs.existsSync(MANUAL_DIR)) return { byId, unmatched };

  const idsByName = new Map(players.map(p => [norm(p.name), p.id]));
  const ids = new Set(players.map(p => p.id));
  for (const file of fs.readdirSync(MANUAL_DIR)) {
    const ext = path.extname(file).toLowerCase();
    if (!MANUAL_EXTENSIONS.includes(ext)) continue;
    const base = path.basename(file, path.extname(file)).trim();
    const id = ids.has(base.toLowerCase()) ? base.toLowerCase() : idsByName.get(norm(base));
    if (id) byId.set(id, path.join(MANUAL_DIR, file));
    else unmatched.push(file);
  }
  return { byId, unmatched };
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 2 — OFFICIAL IPL SQUADS
// ─────────────────────────────────────────────────────────────────────────────
interface IplPlayer { name: string; team: string; season: string; imageUrl: string; playerId: number; country?: string }

// '' = the current season; then every past season, newest first. Players without a
// photo shoot in one season often have a real headshot from an earlier one.
const IPL_SEASONS = ['', ...Array.from({ length: 2025 - 2008 + 1 }, (_, i) => String(2025 - i))];

// Returns every squad appearance per (normalised) name, newest season first.
async function fetchIplSquads(): Promise<{ byName: Map<string, IplPlayer[]>; ambiguous: Set<string>; total: number }> {
  const first = await getJson(`${IPL_TEAMS_API}chennai-super-kings?tab=squad`);
  const slugs: string[] = (first.data?.teams ?? []).map((t: { slug: string }) => t.slug);
  if (slugs.length === 0) throw new Error('IPL team list is empty — the iplt20.com API may have changed');

  const jobs = IPL_SEASONS.flatMap(season => slugs.map(slug => ({ season, slug })));
  const squads = new Map<string, any[]>();
  await mapLimit(jobs, 3, async ({ season, slug }) => {
    try {
      const json = !season && slug === 'chennai-super-kings'
        ? first
        : await getJson(`${IPL_TEAMS_API}${slug}?tab=squad${season ? `&season=${season}` : ''}`);
      squads.set(`${season}|${slug}`, json.data?.squad?.players ?? []);
    } catch {
      // Team didn't exist that season.
    }
  });

  const byName = new Map<string, IplPlayer[]>();
  const idsByName = new Map<string, Set<number>>();
  let total = 0;
  for (const { season, slug } of jobs) {
    for (const p of squads.get(`${season}|${slug}`) ?? []) {
      if (!p.name || !p.imageUrl) continue;
      total++;
      const key = norm(p.name);
      byName.set(key, [...(byName.get(key) ?? []), {
        name: p.name, team: slug, season, imageUrl: p.imageUrl, playerId: p.externalId, country: p.country,
      }]);
      idsByName.set(key, (idsByName.get(key) ?? new Set()).add(p.externalId));
    }
  }
  // Two different IPL players sharing one name can't be told apart by name alone.
  const ambiguous = new Set([...idsByName].filter(([, ids]) => ids.size > 1).map(([key]) => key));
  return { byName, ambiguous, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE 3 — WIKIPEDIA
// ─────────────────────────────────────────────────────────────────────────────
interface WikiPage { title: string; description: string; pageimage?: string; disambiguation: boolean; missing: boolean }

function wikiUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  return `${WIKI_API}?${qs}`;
}

// Looks up article titles (following redirects); result is keyed by the title as requested.
async function wikiPages(titles: string[]): Promise<Map<string, WikiPage>> {
  const out = new Map<string, WikiPage>();
  const unique = [...new Set(titles)];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const json = await getJson(wikiUrl({
      action: 'query', redirects: '1', titles: chunk.join('|'),
      prop: 'pageimages|description|pageprops', piprop: 'name', ppprop: 'disambiguation',
    }));
    const q = json.query ?? {};
    const hop = new Map<string, string>();
    for (const n of q.normalized ?? []) hop.set(n.from, n.to);
    for (const r of q.redirects ?? []) hop.set(r.from, r.to);
    const pages = new Map<string, any>((q.pages ?? []).map((p: any) => [p.title, p]));
    for (const requested of chunk) {
      let title = requested;
      for (let guard = 0; hop.has(title) && guard < 5; guard++) title = hop.get(title)!;
      const p = pages.get(title);
      out.set(requested, {
        title,
        description: p?.description ?? '',
        pageimage: p?.pageimage,
        disambiguation: !!p?.pageprops && 'disambiguation' in p.pageprops,
        missing: !p || !!p.missing || !!p.invalid,
      });
    }
    await sleep(100);
  }
  return out;
}

// Returns null when the article is acceptable for this player, else the reason it was rejected.
// A title pinned in the overrides file skips the nationality check (the human already chose it).
function rejectWikiPage(page: WikiPage, player: PlayerRef, pinned = false): string | null {
  if (page.missing) return 'no article';
  if (page.disambiguation) return 'disambiguation page';
  const desc = page.description.toLowerCase()
    .replace(/west indian/g, 'westindian')
    .replace(/[a-z ]+-born\b/g, ''); // birthplace ("Pakistani-born Omani cricketer") is not nationality
  if (!desc.includes('cricket')) return `not described as a cricketer ("${page.description}")`;
  if (pinned) return null;
  const own = DEMONYMS[player.nationality] ?? [];
  const has = (d: string) => new RegExp(`\\b${d}\\b`).test(desc);
  const others = Object.entries(DEMONYMS).filter(([c]) => c !== player.nationality).flatMap(([, d]) => d);
  if (own.length && !own.some(has) && others.some(has)) {
    return `nationality mismatch ("${page.description}")`;
  }
  return null;
}

async function wikiSearchTitles(name: string): Promise<string[]> {
  const json = await getJson(wikiUrl({
    action: 'query', list: 'search', srsearch: `"${name}" cricketer`, srlimit: '5', srnamespace: '0',
  }));
  const target = norm(name);
  return (json.query?.search ?? [])
    .map((s: { title: string }) => s.title)
    .filter((t: string) => norm(t.replace(/\s*\(.*\)\s*$/, '')) === target);
}

interface WikiImage { thumbUrl: string; pageUrl: string; credit?: string; license?: string }

async function wikiImageInfo(fileNames: string[]): Promise<Map<string, WikiImage>> {
  const out = new Map<string, WikiImage>();
  const unique = [...new Set(fileNames)];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const json = await getJson(wikiUrl({
      action: 'query', titles: chunk.map(f => `File:${f}`).join('|'),
      prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '960', iiextmetadatafilter: 'Artist|LicenseShortName',
    }));
    const q = json.query ?? {};
    const toRequested = new Map<string, string>();
    for (const n of q.normalized ?? []) toRequested.set(n.to, n.from.replace(/^File:/, ''));
    for (const p of q.pages ?? []) {
      const info = p.imageinfo?.[0];
      if (!info?.thumburl) continue;
      const requested = toRequested.get(p.title) ?? p.title.replace(/^File:/, '');
      const artist = String(info.extmetadata?.Artist?.value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      out.set(requested, {
        thumbUrl: standardWikiThumb(info.thumburl, info.width),
        pageUrl: info.descriptionurl,
        credit: artist || undefined,
        license: info.extmetadata?.LicenseShortName?.value || undefined,
      });
    }
    await sleep(100);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT
// ─────────────────────────────────────────────────────────────────────────────
function writeGeneratedIndex(records: [string, PlayerImageRecord][]) {
  let out = `// AUTO-GENERATED by scripts/syncPlayerImages.ts — do not edit by hand. Run \`npm run sync:images\`.\n`;
  out += `// Generated: ${new Date().toISOString()} · ${records.length} / ${ALL_PLAYERS.length} players have a photo.\n`;
  out += `import type { PlayerImageRecord } from './playerImages';\n\n`;
  out += `export const PLAYER_IMAGES: Record<string, PlayerImageRecord> = {\n`;
  for (const [id, rec] of records) out += `  ${JSON.stringify(id)}: ${JSON.stringify(rec)},\n`;
  out += `};\n`;
  fs.writeFileSync(GENERATED_PATH, out, 'utf-8');
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function writeReviewPage(results: Result[], versions: Map<string, string>, unmatchedManual: string[]) {
  const missing = results.filter(r => r.source === 'NONE');
  const found = results.filter(r => r.source !== 'NONE');
  const count = (s: string) => results.filter(r => r.source === s).length;

  const card = (r: Result) => `
    <figure class="card" data-source="${r.source}">
      <img loading="lazy" src="public/players/${r.id}.webp?v=${versions.get(r.id)}" alt="${esc(r.name)}">
      <figcaption>
        <b>${esc(r.name)}</b>
        <span>${esc(r.id)} · ${esc(r.nationality)} · ${esc(r.role.replace('_', ' '))}</span>
        <span><a class="badge ${r.source}" href="${esc(r.sourceUrl ?? '#')}" target="_blank" rel="noreferrer">${r.source}</a>
        ${r.matchedAs && norm(r.matchedAs) !== norm(r.name) ? `as “${esc(r.matchedAs)}”` : ''}</span>
        ${r.license ? `<span class="credit">${esc(r.credit ?? 'Unknown author')} · ${esc(r.license)}</span>` : ''}
      </figcaption>
    </figure>`;

  const row = (r: Result) => `
    <tr><td>${esc(r.name)}</td><td>${esc(r.id)}</td><td>${esc(r.nationality)}</td><td>${esc(r.role.replace('_', ' '))}</td>
    <td><code>player-photos/${esc(r.name)}.jpg</code></td><td class="why">${esc(r.notes.join('; '))}</td></tr>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Player Photo Review</title>
<style>
  body { margin: 0; padding: 24px; font: 14px/1.4 system-ui, sans-serif; background: #0b1120; color: #e2e8f0; }
  h1 { margin: 0 0 4px; } h2 { margin-top: 32px; }
  .muted, .why { color: #94a3b8; } code { color: #fbbf24; }
  .help { background: #111827; border: 1px solid #334155; border-radius: 12px; padding: 12px 16px; max-width: 900px; }
  table { border-collapse: collapse; width: 100%; } td, th { text-align: left; padding: 6px 10px; border-bottom: 1px solid #1e293b; }
  .filters button { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; border-radius: 999px; padding: 6px 14px; margin: 0 6px 12px 0; cursor: pointer; }
  .filters button.on { background: #f59e0b; color: #0b1120; border-color: #f59e0b; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; }
  .card { margin: 0; background: #111827; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; }
  .card img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; object-position: top; background: #1e293b; display: block; }
  figcaption { padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
  figcaption b { font-size: 13px; } .credit { color: #64748b; font-size: 11px; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 6px; font-weight: 700; font-size: 11px; text-decoration: none; }
  .IPL { background: #1d4ed8; color: #fff; } .WIKIPEDIA { background: #e2e8f0; color: #0b1120; } .MANUAL { background: #16a34a; color: #fff; }
</style></head><body>
<h1>Player Photo Review</h1>
<p class="muted">Generated ${esc(new Date().toLocaleString())} · ${found.length} of ${results.length} players have a photo
 (IPL ${count('IPL')}, Wikipedia ${count('WIKIPEDIA')}, manual ${count('MANUAL')}) · ${missing.length} missing.</p>
<div class="help">
  <b>Wrong photo?</b> In <code>scripts/player-image-overrides.json</code> add the player's id with
  <code>"skipIpl": true</code> or <code>"skipWikipedia": true</code> (or <code>"wikipedia": "Exact Article Title"</code>),
  or drop the right photo in <code>player-photos/</code>. Then run <code>npm run sync:images</code> again.<br>
  <b>Missing photo?</b> Save one as <code>player-photos/&lt;Player Name&gt;.jpg</code> (png/webp also work) and re-run.
</div>
${unmatchedManual.length ? `<p class="why">Files in player-photos/ that match no player: ${unmatchedManual.map(esc).join(', ')}</p>` : ''}
<h2>Missing photos (${missing.length})</h2>
<table><thead><tr><th>Player</th><th>ID</th><th>Country</th><th>Role</th><th>Save your photo as</th><th>Why not found</th></tr></thead>
<tbody>${missing.map(row).join('')}</tbody></table>
<h2>Photos (${found.length})</h2>
<div class="filters">
  <button class="on" data-f="ALL">All</button><button data-f="IPL">IPL</button><button data-f="WIKIPEDIA">Wikipedia</button><button data-f="MANUAL">Manual</button>
</div>
<div class="grid">${found.map(card).join('')}</div>
<script>
  document.querySelectorAll('.filters button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.filters button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.card').forEach(c => { c.style.display = b.dataset.f === 'ALL' || c.dataset.source === b.dataset.f ? '' : 'none'; });
  });
</script>
</body></html>`;
  fs.writeFileSync(REVIEW_PATH, html, 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`  AUCTIONARENA — PLAYER IMAGE SYNC · ${ALL_PLAYERS.length} players`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const overrides = loadOverrides();
  const players: PlayerRef[] = ALL_PLAYERS.map(p => ({ id: p.id, name: p.name, nationality: p.nationality, role: p.role }));
  const results = new Map<string, Result>(players.map(p => [p.id, { ...p, source: 'NONE', notes: [] }]));
  const webp = new Map<string, Buffer>();
  const pending = () => players.filter(p => !webp.has(p.id));

  // 1. Manual photos
  const manual = findManualPhotos(players);
  for (const [id, file] of manual.byId) {
    const r = results.get(id)!;
    try {
      webp.set(id, await toWebp(fs.readFileSync(file), 'MANUAL'));
      Object.assign(r, { source: 'MANUAL', matchedAs: path.basename(file), sourceUrl: `player-photos/${path.basename(file)}` });
    } catch (err) {
      r.notes.push(`manual photo ${path.basename(file)} unreadable: ${(err as Error).message}`);
    }
  }
  console.log(`Manual photos        : ${webp.size}${manual.unmatched.length ? ` (${manual.unmatched.length} files match no player)` : ''}`);

  // 2. Official IPL squads — current season first, then every past season
  try {
    const ipl = await fetchIplSquads();
    interface IplMatch { player: PlayerRef; candidates: IplPlayer[]; tried: Set<string>; chosen?: IplPlayer; hash?: string; photo?: Buffer }
    const matches: IplMatch[] = [];
    for (const p of pending()) {
      const r = results.get(p.id)!;
      const o = overrides[p.id] ?? {};
      if (o.skipIpl) { r.notes.push('IPL photo rejected in overrides'); continue; }
      const key = norm(o.iplName ?? p.name);
      if (ipl.ambiguous.has(key)) { r.notes.push('IPL: two different players share this name'); continue; }
      const hits = ipl.byName.get(key);
      if (!hits) { r.notes.push('never in an IPL squad (2008–now)'); continue; }
      const candidates = hits.filter(c => !c.country || c.country === p.nationality);
      if (candidates.length === 0) { r.notes.push(`IPL player of that name is from ${hits[0].country}`); continue; }
      matches.push({ player: p, candidates, tried: new Set() });
    }

    // Try each squad appearance, newest first, until one gives a real headshot.
    const badHashes = new Set<string>();
    const pick = async (m: IplMatch) => {
      m.chosen = m.hash = m.photo = undefined;
      for (const c of m.candidates) {
        if (m.tried.has(c.imageUrl)) continue;
        m.tried.add(c.imageUrl);
        try {
          const buf = await getImage(c.imageUrl);
          const hash = sha1(buf);
          if (badHashes.has(hash)) continue;
          m.photo = await toWebp(buf, 'IPL');
          Object.assign(m, { chosen: c, hash });
          return;
        } catch {
          // placeholder, missing or broken image for this season — try an older one
        }
      }
    };
    await mapLimit(matches, 3, pick);
    // A generic silhouette comes back byte-identical for different players: ban it and retry.
    for (let round = 0; round < 5; round++) {
      const counts = new Map<string, number>();
      for (const m of matches) if (m.hash) counts.set(m.hash, (counts.get(m.hash) ?? 0) + 1);
      const shared = [...counts].filter(([, n]) => n > 1).map(([h]) => h);
      if (shared.length === 0) break;
      shared.forEach(h => badHashes.add(h));
      await mapLimit(matches.filter(m => m.hash && badHashes.has(m.hash)), 3, pick);
    }

    for (const m of matches) {
      const r = results.get(m.player.id)!;
      if (!m.chosen || !m.photo) { r.notes.push(`IPL: no real headshot in ${m.candidates.length} squad listing(s)`); continue; }
      webp.set(m.player.id, m.photo);
      const season = m.chosen.season;
      Object.assign(r, {
        source: 'IPL',
        matchedAs: season ? `${m.chosen.name} (IPL ${season})` : m.chosen.name,
        sourceUrl: `https://www.iplt20.com/teams/${m.chosen.team}/squad${season ? `?season=${season}` : ''}`,
      });
    }
    console.log(`IPL squads           : ${ipl.total} squad listings over ${IPL_SEASONS.length} seasons, ${players.filter(p => results.get(p.id)!.source === 'IPL').length} matched`);
  } catch (err) {
    console.warn(`IPL squads           : FAILED (${(err as Error).message}) — continuing with Wikipedia`);
  }

  // 3. Wikipedia
  const wikiTargets = pending().filter(p => {
    if (overrides[p.id]?.skipWikipedia) { results.get(p.id)!.notes.push('Wikipedia photo rejected in overrides'); return false; }
    return true;
  });
  const titlesFor = (p: PlayerRef) => overrides[p.id]?.commonsFile ? []
    : overrides[p.id]?.wikipedia ? [overrides[p.id].wikipedia!] : [p.name, `${p.name} (cricketer)`];
  const pages = await wikiPages(wikiTargets.flatMap(titlesFor));
  const chosen = new Map<string, WikiPage>();
  const rejections = new Map<string, string[]>();

  const consider = (p: PlayerRef, page: WikiPage | undefined): boolean => {
    if (!page) return false;
    const why = rejectWikiPage(page, p, !!overrides[p.id]?.wikipedia);
    if (why) {
      const note = `“${page.title}”: ${why}`;
      const seen = rejections.get(p.id) ?? [];
      if (why !== 'no article' && !seen.includes(note)) rejections.set(p.id, [...seen, note]);
      return false;
    }
    chosen.set(p.id, page);
    return true;
  };
  for (const p of wikiTargets) titlesFor(p).some(t => consider(p, pages.get(t)));

  // Fall back to search for players without an accepted article (skipped when a title is pinned).
  const toSearch = wikiTargets.filter(p => !chosen.has(p.id) && !overrides[p.id]?.wikipedia && !overrides[p.id]?.commonsFile);
  const searched = new Map<string, string[]>();
  await mapLimit(toSearch, 1, async p => { searched.set(p.id, await wikiSearchTitles(p.name).catch(() => [])); await sleep(200); });
  const searchPages = await wikiPages([...searched.values()].flat());
  for (const p of toSearch) (searched.get(p.id) ?? []).some(t => consider(p, searchPages.get(t)));

  // A Commons file pinned in the overrides stands in for the article's lead image.
  for (const p of wikiTargets) {
    const file = overrides[p.id]?.commonsFile;
    if (file) chosen.set(p.id, { title: `File:${file}`, description: '', pageimage: file, disambiguation: false, missing: false });
  }
  const files = await wikiImageInfo([...chosen.values()].flatMap(pg => (pg.pageimage ? [pg.pageimage] : [])));
  // upload.wikimedia.org rate-limits aggressively, so photos are fetched one at a time.
  await mapLimit(wikiTargets, 1, async p => {
    const r = results.get(p.id)!;
    const page = chosen.get(p.id);
    if (!page) {
      r.notes.push(...(rejections.get(p.id) ?? ['no matching Wikipedia article']));
      return;
    }
    const info = page.pageimage ? files.get(page.pageimage) : undefined;
    if (!info || /\.svg$/i.test(page.pageimage ?? '')) { r.notes.push(`Wikipedia article “${page.title}” has no free photo`); return; }
    try {
      await sleep(300);
      webp.set(p.id, await toWebp(await getImage(info.thumbUrl), 'WIKIPEDIA'));
      Object.assign(r, {
        source: 'WIKIPEDIA', matchedAs: page.title, sourceUrl: info.pageUrl, credit: info.credit, license: info.license,
      });
    } catch (err) {
      r.notes.push(`Wikipedia image failed: ${(err as Error).message}`);
    }
  });
  console.log(`Wikipedia            : ${players.filter(p => results.get(p.id)!.source === 'WIKIPEDIA').length} matched`);

  // ── Write photos, index, report, review page ────────────────────────────────
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const versions = new Map<string, string>();
  for (const [id, buf] of webp) {
    fs.writeFileSync(path.join(OUT_DIR, `${id}.webp`), buf);
    versions.set(id, sha1(buf).slice(0, 8));
  }
  for (const file of fs.readdirSync(OUT_DIR)) {
    const m = /^(p-\d+)\.webp$/.exec(file);
    if (m && !webp.has(m[1])) fs.unlinkSync(path.join(OUT_DIR, file));
  }

  const ordered = [...results.values()];
  const records: [string, PlayerImageRecord][] = ordered
    .filter(r => r.source !== 'NONE')
    .map(r => [r.id, {
      src: `/players/${r.id}.webp?v=${versions.get(r.id)}`,
      source: r.source as PlayerImageSource,
      ...(r.sourceUrl && r.source !== 'MANUAL' ? { sourceUrl: r.sourceUrl } : {}),
      ...(r.credit ? { credit: r.credit } : {}),
      ...(r.license ? { license: r.license } : {}),
    }]);
  writeGeneratedIndex(records);

  const bySource = (s: string) => ordered.filter(r => r.source === s).length;
  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      totalPlayers: ordered.length, withPhoto: records.length,
      manual: bySource('MANUAL'), ipl: bySource('IPL'), wikipedia: bySource('WIKIPEDIA'), missing: bySource('NONE'),
    },
    unmatchedManualFiles: manual.unmatched,
    players: ordered,
  }, null, 2), 'utf-8');
  writeReviewPage(ordered, versions, manual.unmatched);

  console.log('\n───────────────────────────────────────────────────────────────────');
  console.log(`  With photo : ${records.length} / ${ordered.length}   (manual ${bySource('MANUAL')}, IPL ${bySource('IPL')}, Wikipedia ${bySource('WIKIPEDIA')})`);
  console.log(`  Missing    : ${bySource('NONE')}`);
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('✓ public/players/*.webp');
  console.log('✓ src/data/playerImages.generated.ts');
  console.log('✓ player-image-report.json');
  console.log('✓ player-image-review.html  ← open this to check every photo\n');
}

main().catch(err => { console.error(err); process.exit(1); });
