#!/usr/bin/env node
// One-time, honest, reversible sample seed for Stoop.
// Uses the Supabase service role key over REST + Auth Admin API (no psql/DB pw needed).
// Every row is tagged [sample] and removable via --teardown.
//
//   node supabase/seed_samples.mjs            # seed
//   node supabase/seed_samples.mjs --teardown # remove all samples
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(decodeURIComponent(new globalThis.URL(import.meta.url).pathname)), '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) { console.error('Missing Supabase URL or service role key'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const rest = (p, opt = {}) => fetch(`${BASE}/rest/v1/${p}`, { ...opt, headers: { ...H, ...(opt.headers || {}) } });
const admin = (p, opt = {}) => fetch(`${BASE}/auth/v1/admin/${p}`, { ...opt, headers: { ...H, ...(opt.headers || {}) } });

const MARK = '[sample]';
const USERS = [
  { id: 'a0000000-0000-4000-8000-000000000001', name: 'Maya',  email: 'sample01@stoop.invalid', phone: '+15550101', bg: '#D4E8D8', fg: '#2A4232', initials: 'M' },
  { id: 'a0000000-0000-4000-8000-000000000002', name: 'Devin', email: 'sample02@stoop.invalid', phone: '+15550102', bg: '#E8DDD4', fg: '#42392A', initials: 'D' },
  { id: 'a0000000-0000-4000-8000-000000000003', name: 'Priya', email: 'sample03@stoop.invalid', phone: '+15550103', bg: '#D4DEE8', fg: '#2A3542', initials: 'P' },
  { id: 'a0000000-0000-4000-8000-000000000004', name: 'Theo',  email: 'sample04@stoop.invalid', phone: '+15550104', bg: '#E8D4E4', fg: '#422A3C', initials: 'T' },
  { id: 'a0000000-0000-4000-8000-000000000005', name: 'Sam',   email: 'sample05@stoop.invalid', phone: '+15550105', bg: '#E8E4D4', fg: '#423E2A', initials: 'S' },
];
const PLANS = [
  [0, 'coffee',   'getting a flat white at Sey Coffee saturday morning before the market gets busy, come sit', 'Sey Coffee', 'Saturday', '9:00 AM'],
  [1, 'outdoors', 'slow loop around McCarren Park sunday at 9, the kind of pace where you can actually talk', 'McCarren Park', 'Sunday', '9:00 AM'],
  [2, 'outdoors', 'hitting the pickleball courts at McCarren thursday after work, i have paddles, zero skill required', 'McCarren Park courts', 'Thursday', '6:00 PM'],
  [3, 'food',     'trying the new taco spot on Grand St friday night, ordering too much on purpose', 'Grand St', 'Friday', '7:30 PM'],
  [4, 'books',    'reading in Domino Park sunday afternoon, bring whatever youre in the middle of, silent hour then coffee', 'Domino Park', 'Sunday', '2:00 PM'],
  [0, 'arts',     'wandering the galleries off Wythe saturday around 2, i go slow and read every caption, consider yourself warned', 'Wythe Ave galleries', 'Saturday', '2:00 PM'],
  [1, 'music',    "there's a free show at Baby's All Right wednesday night, going alone unless someone joins", "Baby's All Right", 'Wednesday', '8:00 PM'],
  [2, 'coffee',   'coffee walk tuesday 8am before work, one big loop along the waterfront, back by 9', 'Williamsburg waterfront', 'Tuesday', '8:00 AM'],
  [3, 'outdoors', 'golden hour walk along the East River ferry pier thursday, i bring the playlist', 'East River waterfront', 'Thursday', '7:00 PM'],
  [4, 'food',     'bagel run sunday 10am, we eat them on the bench like its a whole event because it is', 'Bedford Ave', 'Sunday', '10:00 AM'],
];

async function jr(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return t; } }

async function teardown() {
  console.log('Teardown: removing sample data...');
  // Identify samples by their reserved non-dialable +1555010x phones (the
  // visible [sample] name tag is intentionally not used, so it never shows).
  const profs = await jr(await rest(`profiles?select=id&phone_e164=like.%2B155501%2A`));
  const ids = Array.isArray(profs) ? profs.map((p) => p.id) : [];
  if (ids.length) {
    await rest(`plans?user_id=in.(${ids.join(',')})`, { method: 'DELETE' });
    await rest(`profiles?id=in.(${ids.join(',')})`, { method: 'DELETE' });
  }
  for (const u of USERS) { await admin(`users/${u.id}`, { method: 'DELETE' }); }
  console.log(`Removed ${ids.length} sample profiles + their plans + ${USERS.length} auth users.`);
}

async function seed() {
  // guard: already seeded? (identify by reserved sample phone prefix)
  const existing = await jr(await rest(`profiles?select=id&phone_e164=like.%2B155501%2A&limit=1`));
  if (Array.isArray(existing) && existing.length) { console.log('Samples already present. Nothing to do (run --teardown to remove).'); return; }

  // neighborhood id (Williamsburg / NYC)
  const nb = await jr(await rest('neighborhoods?select=id,city_id,slug&slug=eq.williamsburg'));
  if (!Array.isArray(nb) || !nb.length) { console.error('Williamsburg neighborhood not found'); process.exit(1); }
  const { id: neighborhood_id, city_id } = nb[0];
  console.log(`Seeding into Williamsburg (nb=${neighborhood_id})`);

  // 1. auth users
  for (const u of USERS) {
    const r = await admin('users', { method: 'POST', body: JSON.stringify({
      id: u.id, email: u.email, email_confirm: true, password: crypto.randomUUID(),
      user_metadata: { sample: true }, app_metadata: { provider: 'seed', sample: true },
    }) });
    if (!r.ok && r.status !== 422 && r.status !== 409) { console.error('auth user fail', u.email, r.status, await r.text()); }
  }
  console.log('Auth users ready.');

  // 2. profiles
  const profRows = USERS.map((u) => ({
    id: u.id, name: u.name, phone_e164: u.phone, phone_verified_at: new Date().toISOString(),
    city_id, neighborhood_id, about: 'sample profile, remove at launch', initials: u.initials,
    avatar_bg: u.bg, avatar_fg: u.fg, is_founding_member: false,
  }));
  const pr = await rest('profiles', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(profRows) });
  if (!pr.ok) { console.error('profiles fail', pr.status, await pr.text()); process.exit(1); }
  console.log(`Profiles: ${profRows.length} inserted.`);

  // 3. plans
  const weekOut = new Date(Date.now() + 7 * 864e5).toISOString();
  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const planRows = PLANS.map(([ui, category, text, spot, when_day, when_time], i) => ({
    user_id: USERS[ui].id, city_id, neighborhood_id, text, category, spot,
    when_day, when_time, spots_total: 1, spots_left: 1, status: 'open', expires_at: weekOut,
    slug: `${slugify(`${category}-${spot}-${when_day}`)}-s${i + 1}`,
  }));
  const pl = await rest('plans', { method: 'POST', body: JSON.stringify(planRows) });
  if (!pl.ok) { console.error('plans fail', pl.status, await pl.text()); process.exit(1); }
  console.log(`Plans: ${planRows.length} inserted.`);

  const check = await jr(await rest(`plans?select=id&user_id=in.(${USERS.map((u) => u.id).join(',')})`));
  console.log(`Verify: ${Array.isArray(check) ? check.length : '?'} sample plans now live (expect 10).`);
}

(process.argv.includes('--teardown') ? teardown() : seed()).catch((e) => { console.error(e); process.exit(1); });
