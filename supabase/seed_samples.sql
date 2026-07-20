-- ═══════════════════════════════════════════════════════════════════════════
-- STOOP — INITIAL SAMPLE SEED (one-time, honest, fully reversible)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PURPOSE
--   Break the "empty feed" ghost-town problem at launch. This inserts a small
--   set of SAMPLE plans so the feed, city, and neighborhood pages read as alive
--   for the very first visitors and for demo/screenshots.
--
-- HONESTY (this is not "fake users, forever")
--   Per DECISIONS.md / SEEDING.md the product rule is: no fake profiles as a
--   growth tactic, ever. This seed is a ONE-TIME launch primer, and every row
--   it creates is explicitly tagged so it is never mistaken for a real neighbor
--   and can be removed in one command the moment real posters arrive.
--     - Sample profile names are suffixed with the marker below.
--     - Sample phone numbers use the reserved +1-555-01xx range (not dialable).
--     - Plan text is taken verbatim from SEEDING.md's ready-to-paste list.
--   Recommended: run the TEARDOWN block at the bottom during launch week once
--   you and friends have posted real plans.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
--   Safe to run once. Re-running is guarded (ON CONFLICT / marker checks).
--
-- SCOPE
--   Neighborhood: Williamsburg (NYC) — the beachhead. Change WITH-clause slug
--   below to seed a different one.
-- ═══════════════════════════════════════════════════════════════════════════

-- Marker used to identify (and later remove) everything this seed creates.
-- Do not change between seeding and teardown.
--   MARKER = '[sample]'

BEGIN;

-- ── 1. Create sample auth users (required: profiles.id FK -> auth.users) ────
-- We mint deterministic UUIDs so the script is idempotent and easy to remove.
-- Passwords are random/unusable; these accounts are not meant to be logged into.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
VALUES
  ('a0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sample01@stoop.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(), '{"provider":"seed","sample":true}', '{"sample":true}'),
  ('a0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sample02@stoop.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(), '{"provider":"seed","sample":true}', '{"sample":true}'),
  ('a0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sample03@stoop.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(), '{"provider":"seed","sample":true}', '{"sample":true}'),
  ('a0000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sample04@stoop.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(), '{"provider":"seed","sample":true}', '{"sample":true}'),
  ('a0000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sample05@stoop.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(), '{"provider":"seed","sample":true}', '{"sample":true}')
ON CONFLICT (id) DO NOTHING;

-- ── 2. Create sample profiles in Williamsburg ──────────────────────────────
-- Names carry the [sample] marker. Phones use reserved +1555010x (non-routable).
WITH nb AS (
  SELECT n.id AS neighborhood_id, n.city_id
  FROM neighborhoods n JOIN cities c ON c.id = n.city_id
  WHERE c.slug = 'nyc' AND n.slug = 'williamsburg'
)
INSERT INTO profiles (id, name, phone_e164, phone_verified_at, city_id,
                      neighborhood_id, about, initials, avatar_bg, avatar_fg,
                      is_founding_member, created_at)
SELECT * FROM (
  SELECT 'a0000000-0000-4000-8000-000000000001'::uuid, 'Maya [sample]', '+15550101', now(), nb.city_id, nb.neighborhood_id, 'sample profile, remove at launch', 'M',  '#D4E8D8','#2A4232', false, now() FROM nb
  UNION ALL SELECT 'a0000000-0000-4000-8000-000000000002'::uuid, 'Devin [sample]', '+15550102', now(), nb.city_id, nb.neighborhood_id, 'sample profile, remove at launch', 'D', '#E8DDD4','#42392A', false, now() FROM nb
  UNION ALL SELECT 'a0000000-0000-4000-8000-000000000003'::uuid, 'Priya [sample]', '+15550103', now(), nb.city_id, nb.neighborhood_id, 'sample profile, remove at launch', 'P', '#D4DEE8','#2A3542', false, now() FROM nb
  UNION ALL SELECT 'a0000000-0000-4000-8000-000000000004'::uuid, 'Theo [sample]',  '+15550104', now(), nb.city_id, nb.neighborhood_id, 'sample profile, remove at launch', 'T', '#E8D4E4','#422A3C', false, now() FROM nb
  UNION ALL SELECT 'a0000000-0000-4000-8000-000000000005'::uuid, 'Sam [sample]',   '+15550105', now(), nb.city_id, nb.neighborhood_id, 'sample profile, remove at launch', 'S', '#E8E4D4','#423E2A', false, now() FROM nb
) AS s
ON CONFLICT (id) DO NOTHING;

-- ── 3. Create sample plans (verbatim text from SEEDING.md) ─────────────────
-- Spread across the week so the date column looks alive top to bottom.
-- 1 spot each (honest scarcity). expires_at set a week out.
WITH nb AS (
  SELECT n.id AS neighborhood_id, n.city_id
  FROM neighborhoods n JOIN cities c ON c.id = n.city_id
  WHERE c.slug = 'nyc' AND n.slug = 'williamsburg'
)
INSERT INTO plans (user_id, city_id, neighborhood_id, text, category, spot,
                   when_day, when_time, spots_total, spots_left, status,
                   expires_at, created_at)
SELECT * FROM (
  SELECT 'a0000000-0000-4000-8000-000000000001'::uuid, nb.city_id, nb.neighborhood_id,
    'getting a flat white at Sey Coffee saturday morning before the market gets busy, come sit',
    'coffee', 'Sey Coffee', 'Saturday', '9:00 AM', 1, 1, 'open', now() + interval '7 days', now() FROM nb
  UNION ALL SELECT 'a0000000-0000-4000-8000-000000000002'::uuid, nb.city_id, nb.neighborhood_id,
    'slow loop around McCarren Park sunday at 9, the kind of pace where you can actually talk',
    'outdoors', 'McCarren Park', 'Sunday', '9:00 AM', 1, 1, 'open', now() + interval '7 days', now() FROM nb
  UNION ALL SELECT 'a0000000-0000-4000-8000-000000000003'::uuid, nb.city_id, nb.neighborhood_id,
    'hitting the pickleball courts at McCarren thursday after work, i have paddles, zero skill required',
    'outdoors', 'McCarren Park courts', 'Thursday', '6:00 PM', 1, 1, 'open', now() + interval '7 days', now() FROM nb
  UNION ALL SELECT 'a0000000-0000-4000-8000-000000000004'::uuid, nb.city_id, nb.neighborhood_id,
    'trying the new taco spot on Grand St friday night, ordering too much on purpose',
    'food', 'Grand St', 'Friday', '7:30 PM', 1, 1, 'open', now() + interval '7 days', now() FROM nb
  UNION ALL SELECT 'a0000000-0000-4000-8000-000000000005'::uuid, nb.city_id, nb.neighborhood_id,
    'reading in Domino Park sunday afternoon, bring whatever youre in the middle of, silent hour then coffee',
    'books', 'Domino Park', 'Sunday', '2:00 PM', 1, 1, 'open', now() + interval '7 days', now() FROM nb
  UNION ALL SELECT 'a0000000-0000-4000-8000-000000000001'::uuid, nb.city_id, nb.neighborhood_id,
    'wandering the galleries off Wythe saturday around 2, i go slow and read every caption, consider yourself warned',
    'arts', 'Wythe Ave galleries', 'Saturday', '2:00 PM', 1, 1, 'open', now() + interval '7 days', now() FROM nb
  UNION ALL SELECT 'a0000000-0000-4000-8000-000000000002'::uuid, nb.city_id, nb.neighborhood_id,
    'theres a free show at Baby''s All Right wednesday night, going alone unless someone joins',
    'music', 'Baby''s All Right', 'Wednesday', '8:00 PM', 1, 1, 'open', now() + interval '7 days', now() FROM nb
  UNION ALL SELECT 'a0000000-0000-4000-8000-000000000003'::uuid, nb.city_id, nb.neighborhood_id,
    'coffee walk tuesday 8am before work, one big loop along the waterfront, back by 9',
    'coffee', 'Williamsburg waterfront', 'Tuesday', '8:00 AM', 1, 1, 'open', now() + interval '7 days', now() FROM nb
  UNION ALL SELECT 'a0000000-0000-4000-8000-000000000004'::uuid, nb.city_id, nb.neighborhood_id,
    'golden hour walk along the East River ferry pier thursday, i bring the playlist',
    'outdoors', 'East River waterfront', 'Thursday', '7:00 PM', 1, 1, 'open', now() + interval '7 days', now() FROM nb
  UNION ALL SELECT 'a0000000-0000-4000-8000-000000000005'::uuid, nb.city_id, nb.neighborhood_id,
    'bagel run sunday 10am, we eat them on the bench like its a whole event because it is',
    'food', 'Bedford Ave', 'Sunday', '10:00 AM', 1, 1, 'open', now() + interval '7 days', now() FROM nb
) AS s
-- guard against double-seeding: only insert if no sample plans exist yet
WHERE NOT EXISTS (
  SELECT 1 FROM plans p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE pr.name LIKE '%[sample]%'
);

COMMIT;

-- Quick check after running:
--   SELECT count(*) FROM plans p JOIN profiles pr ON pr.id=p.user_id
--   WHERE pr.name LIKE '%[sample]%';   -- expect 10

-- ═══════════════════════════════════════════════════════════════════════════
-- TEARDOWN — run this during launch week once real plans exist.
-- Removes every sample profile + its plans + the auth users, cleanly.
-- (Cascades handle conversations/messages if any were created.)
-- ═══════════════════════════════════════════════════════════════════════════
-- BEGIN;
--   DELETE FROM plans    WHERE user_id IN (SELECT id FROM profiles WHERE name LIKE '%[sample]%');
--   DELETE FROM profiles WHERE name LIKE '%[sample]%';
--   DELETE FROM auth.users WHERE raw_user_meta_data ->> 'sample' = 'true';
-- COMMIT;
