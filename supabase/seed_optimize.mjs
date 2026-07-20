#!/usr/bin/env node
// Optimize the seeded sample plans: close spots (no strangers can join) and
// fill SEO/discoverability fields (when_date -> switches on SocialEvent JSON-LD,
// when_time_specific, and valid intent_tags). Idempotent, service-role via REST.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(decodeURIComponent(new globalThis.URL(import.meta.url).pathname)), '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const rest = (p, opt = {}) => fetch(`${BASE}/rest/v1/${p}`, { ...opt, headers: { ...H, ...(opt.headers || {}) } });
const jr = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

// Next occurrence of a weekday (0=Sun..6=Sat), always in the future.
const DOW = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
function nextDate(dayName) {
  const now = new Date();
  const target = DOW[dayName];
  const d = new Date(now);
  let add = (target - now.getDay() + 7) % 7;
  if (add === 0) add = 7; // always future
  d.setDate(now.getDate() + add);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Per-plan optimization keyed by slug (set in seed_samples.mjs).
// tags use ONLY valid INTENT_TAGS ids: just-social, dog-friendly, bring-something, quiet, loud, free, paid.
const OPT = {
  'coffee-sey-coffee-saturday-s1':        { day: 'Saturday',  time: '9:00am', tags: ['just-social', 'free'] },
  'outdoors-mccarren-park-sunday-s2':     { day: 'Sunday',    time: '9:00am', tags: ['just-social', 'free', 'dog-friendly'] },
  'outdoors-mccarren-park-courts-thursday-s3': { day: 'Thursday', time: '6:00pm', tags: ['just-social', 'free'] },
  'food-grand-st-friday-s4':              { day: 'Friday',    time: '7:30pm', tags: ['just-social', 'paid', 'loud'] },
  'books-domino-park-sunday-s5':          { day: 'Sunday',    time: '2:00pm', tags: ['quiet', 'bring-something', 'free'] },
  'arts-wythe-ave-galleries-saturday-s6': { day: 'Saturday',  time: '2:00pm', tags: ['quiet', 'free'] },
  'music-baby-s-all-right-wednesday-s7':  { day: 'Wednesday', time: '8:00pm', tags: ['just-social', 'loud', 'free'] },
  'coffee-williamsburg-waterfront-tuesday-s8': { day: 'Tuesday', time: '8:00am', tags: ['just-social', 'free'] },
  'outdoors-east-river-waterfront-thursday-s9': { day: 'Thursday', time: '7:00pm', tags: ['just-social', 'free', 'dog-friendly'] },
  'food-bedford-ave-sunday-s10':          { day: 'Sunday',    time: '10:00am', tags: ['just-social', 'paid'] },
};

async function run() {
  const rows = await jr(await rest('plans?select=id,slug,when_day&slug=in.(' + Object.keys(OPT).map(encodeURIComponent).join(',') + ')'));
  if (!Array.isArray(rows) || !rows.length) { console.error('No sample plans found. Run seed_samples.mjs first.'); process.exit(1); }
  let done = 0;
  for (const row of rows) {
    const o = OPT[row.slug];
    if (!o) continue;
    const body = {
      spots_left: 0, status: 'full',
      when_date: nextDate(o.day), when_time_specific: o.time,
      intent_tags: o.tags,
    };
    const r = await rest(`plans?id=eq.${row.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    if (r.ok) { done++; console.log(`  ✓ ${row.slug} -> full, ${body.when_date} ${o.time}, tags[${o.tags.join(',')}]`); }
    else console.error(`  ✗ ${row.slug} ${r.status} ${await r.text()}`);
  }
  console.log(`Optimized ${done}/${rows.length} sample plans (spots closed + SEO fields set).`);
}
run().catch((e) => { console.error(e); process.exit(1); });
