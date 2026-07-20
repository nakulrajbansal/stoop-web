#!/usr/bin/env node
// Remove the visible "[sample]" suffix from seeded profile names (it should
// never show to visitors). Samples stay identifiable for teardown via their
// reserved +1555010x phones and sample auth-user metadata.

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

// The seeded profile ids (deterministic from seed_samples.mjs) + clean names.
const NAMES = {
  'a0000000-0000-4000-8000-000000000001': 'Maya',
  'a0000000-0000-4000-8000-000000000002': 'Devin',
  'a0000000-0000-4000-8000-000000000003': 'Priya',
  'a0000000-0000-4000-8000-000000000004': 'Theo',
  'a0000000-0000-4000-8000-000000000005': 'Sam',
};

async function run() {
  let done = 0;
  for (const [id, name] of Object.entries(NAMES)) {
    const r = await rest(`profiles?id=eq.${id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ name }),
    });
    if (r.ok) { done++; console.log(`  ✓ ${id.slice(-2)} -> "${name}"`); }
    else console.error(`  ✗ ${id} ${r.status} ${await r.text()}`);
  }
  const check = await jr(await rest('profiles?select=name&phone_e164=like.%2B155501%2A'));
  console.log(`Renamed ${done}/5. Current sample names: ${Array.isArray(check) ? check.map((p) => p.name).join(', ') : check}`);
}
run().catch((e) => { console.error(e); process.exit(1); });
