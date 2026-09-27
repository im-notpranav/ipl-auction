/**
 * Provider probe — tests authentication for both Sportmonks and Cricwix.
 * Prints PASS/FAIL. Never prints secret values.
 */
const fs = require('fs');
const path = require('path');

// ── Load .env.local ────────────────────────────────────────────────────────────
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv(path.join(__dirname, '..', '.env.local'));
loadEnv(path.join(__dirname, '..', '.env'));

const CRICKET_API_KEY      = process.env.CRICKET_API_KEY      || '';
const CRICKET_API_BASE_URL = process.env.CRICKET_API_BASE_URL || '';
const IMG_API_KEY          = process.env.PLAYER_IMAGE_API_KEY  || '';
const IMG_BASE_URL         = process.env.PLAYER_IMAGE_BASE_URL || '';

// ── Safety checks (never print values) ────────────────────────────────────────
function describeKey(k) {
  if (!k) return '[EMPTY]';
  // Check for non-ASCII characters that break HTTP headers
  let badIdx = -1;
  for (let i = 0; i < k.length; i++) {
    if (k.charCodeAt(i) > 127) { badIdx = i; break; }
  }
  if (badIdx !== -1) return `[INVALID — non-ASCII char at index ${badIdx}, codepoint ${k.charCodeAt(badIdx)}]`;
  return `[SET, ${k.length} chars, all ASCII, starts ${k[0]}${k[1] || ''}...]`;
}

console.log('\n─── Env Config ────────────────────────────────────────');
console.log('CRICKET_API_KEY       :', describeKey(CRICKET_API_KEY));
console.log('CRICKET_API_BASE_URL  :', CRICKET_API_BASE_URL || '[EMPTY]');
console.log('PLAYER_IMAGE_API_KEY  :', describeKey(IMG_API_KEY));
console.log('PLAYER_IMAGE_BASE_URL :', IMG_BASE_URL || '[EMPTY]');
console.log('────────────────────────────────────────────────────────\n');

if (!CRICKET_API_KEY || describeKey(CRICKET_API_KEY).includes('INVALID')) {
  console.error('ABORT: CRICKET_API_KEY is missing or invalid. Fix .env.local first.');
  process.exit(1);
}
if (!IMG_API_KEY || describeKey(IMG_API_KEY).includes('INVALID')) {
  console.error('ABORT: PLAYER_IMAGE_API_KEY is missing or invalid. Fix .env.local first.');
  process.exit(1);
}

// ── Sportmonks probe ──────────────────────────────────────────────────────────
async function probeSportmonks() {
  // Try v3 first, fall back to v2
  const candidates = [
    { label: 'v3', url: `https://api.sportmonks.com/v3/cricket/players/46?api_token=${CRICKET_API_KEY}` },
    { label: 'v2', url: `https://cricket.sportmonks.com/api/v2.0/players/46?api_token=${CRICKET_API_KEY}` },
    // CricAPI-style (some accounts use cricapi.com)
    { label: 'cricapi', url: `${CRICKET_API_BASE_URL}/players?apikey=${CRICKET_API_KEY}&search=Virat+Kohli` },
  ];

  for (const c of candidates) {
    try {
      const safeUrl = c.url.replace(CRICKET_API_KEY, '[KEY]');
      const res = await fetch(c.url, { signal: AbortSignal.timeout(8000) });
      const ct = res.headers.get('content-type') || '';
      let body = null;
      if (ct.includes('json')) body = await res.json();
      else { await res.text(); }

      if (res.ok && body) {
        // Check for API-level failure messages
        if (body.status === 'failure' || body.error || body.message?.toLowerCase().includes('invalid')) {
          console.log(`  [${c.label}] HTTP ${res.status} but API error: ${body.status || body.message || body.error}`);
          continue;
        }
        // Check for real player data
        const hasData = body.data || body.response || (Array.isArray(body) && body.length > 0);
        if (hasData) {
          console.log(`  [${c.label}] PASS — HTTP ${res.status}, data present`);
          return { pass: true, label: c.label, body };
        }
        console.log(`  [${c.label}] HTTP ${res.status} but unexpected structure: ${JSON.stringify(body).slice(0,120)}`);
      } else {
        console.log(`  [${c.label}] HTTP ${res.status}: ${body ? JSON.stringify(body).slice(0,120) : '(no JSON body)'}`);
      }
    } catch (e) {
      console.log(`  [${c.label}] Error: ${e.message}`);
    }
  }
  return { pass: false };
}

// ── Cricwix / cricketimages.org probe ─────────────────────────────────────────
async function probeCricwix() {
  // Try documented endpoint patterns
  const candidates = [
    // Standard Cricwix ext/v1
    { label: 'cricwix-ext-v1', url: `https://api.cricwix.com/ext/v1/images/player/1`, headers: { 'X-Api-Key': IMG_API_KEY } },
    // cricketimages.org with different auth methods
    { label: 'cimg-Xkey',   url: `${IMG_BASE_URL}/players`, headers: { 'X-Api-Key': IMG_API_KEY } },
    { label: 'cimg-Bearer', url: `${IMG_BASE_URL}/players`, headers: { 'Authorization': `Bearer ${IMG_API_KEY}` } },
    { label: 'cimg-param',  url: `${IMG_BASE_URL}/players?apikey=${IMG_API_KEY}`, headers: {} },
    { label: 'cimg-img1',   url: `${IMG_BASE_URL}/images/player/1`, headers: { 'X-Api-Key': IMG_API_KEY } },
  ];

  for (const c of candidates) {
    try {
      const res = await fetch(c.url, {
        headers: c.headers,
        signal: AbortSignal.timeout(8000),
      });
      const ct = res.headers.get('content-type') || '';
      let body = null;
      if (ct.includes('json')) body = await res.json();
      else if (ct.includes('image')) { await res.arrayBuffer(); }
      else { await res.text(); }

      if (res.ok) {
        if (body && (body.error || body.status === 'failure')) {
          console.log(`  [${c.label}] HTTP ${res.ok ? res.status : res.status} but API error: ${JSON.stringify(body).slice(0,120)}`);
          continue;
        }
        if (ct.includes('image')) {
          console.log(`  [${c.label}] PASS — image/png returned directly`);
          return { pass: true, label: c.label, isImageDirect: true };
        }
        console.log(`  [${c.label}] PASS — HTTP ${res.status}: ${JSON.stringify(body).slice(0,120)}`);
        return { pass: true, label: c.label, body };
      } else {
        console.log(`  [${c.label}] HTTP ${res.status}: ${body ? JSON.stringify(body).slice(0,120) : ct}`);
      }
    } catch (e) {
      console.log(`  [${c.label}] Error: ${e.message}`);
    }
  }
  return { pass: false };
}

async function main() {
  console.log('Probing Sportmonks...');
  const sm = await probeSportmonks();
  console.log('Sportmonks:', sm.pass ? `PASS [${sm.label}]` : 'FAIL');

  console.log('\nProbing Cricwix / image provider...');
  const cw = await probeCricwix();
  console.log('Cricwix:', cw.pass ? `PASS [${cw.label}]` : 'FAIL');

  console.log('\n─── Summary ─────────────────────────────────────────');
  console.log('Sportmonks authentication:', sm.pass ? 'PASS' : 'FAIL');
  console.log('Cricwix authentication   :', cw.pass ? 'PASS' : 'FAIL');
  console.log('─────────────────────────────────────────────────────\n');

  // Write result for sync script to pick up
  fs.writeFileSync(
    path.join(__dirname, '..', 'probe-result.json'),
    JSON.stringify({ sportmonks: sm, cricwix: cw }, null, 2)
  );

  if (!sm.pass && !cw.pass) {
    console.error('Both providers failed. Cannot run image sync. Fix credentials in .env.local first.');
    process.exit(1);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
