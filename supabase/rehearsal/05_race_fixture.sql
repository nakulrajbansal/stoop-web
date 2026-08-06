-- ═══════════════════════════════════════════════════════════════════════════
-- RACE FIXTURE: the actors, the reset, the state reader, the invariants
--
-- Loaded once by supabase/rehearsal/races.py, which then drives two real psql
-- sessions against it. Nothing here is part of a production migration: it lives
-- in the `rehearsal` schema so it cannot be confused for one, and it is only
-- ever run against the throwaway local database.
--
-- The point of splitting it out of the driver is that the assertions stay
-- readable as SQL. A concurrency claim that can only be read as string
-- comparisons in Python is a claim nobody checks.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS rehearsal;

-- ── THE ACTORS ────────────────────────────────────────────────────────────
-- Fixed ids so the driver can name them without reading them back. Two
-- joiners, because the sender-quota race has to prove the lock is per person
-- rather than per conversation, which needs two conversations at once.
DO $$
DECLARE
  city UUID;
  hood UUID;
BEGIN
  SELECT id INTO city FROM public.cities WHERE slug = 'nyc';
  SELECT id INTO hood FROM public.neighborhoods WHERE slug = 'williamsburg' AND city_id = city;

  INSERT INTO auth.users (id) VALUES
    ('a0000000-0000-4000-8000-000000000001'),
    ('a0000000-0000-4000-8000-000000000002'),
    ('a0000000-0000-4000-8000-000000000003')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, name, phone_e164, city_id, neighborhood_id)
  VALUES
    ('a0000000-0000-4000-8000-000000000001', 'Maya Rodriguez', '+15559000001', city, hood),
    ('a0000000-0000-4000-8000-000000000002', 'Theo Park',      '+15559000002', city, hood),
    ('a0000000-0000-4000-8000-000000000003', 'Ada Chen',       '+15559000003', city, hood)
  ON CONFLICT (id) DO NOTHING;
END
$$;

-- ── RESET ─────────────────────────────────────────────────────────────────
-- Conversations are DELETEd and re-INSERTed rather than UPDATEd into place.
-- An UPDATE would fire the capacity trigger and the status guard, so the setup
-- would be exercising the very thing under test; an INSERT fires neither, which
-- makes the starting state exactly what it says it is.
CREATE OR REPLACE FUNCTION rehearsal.reset_race(
  p_spots_total INTEGER DEFAULT 1,
  p_spots_left INTEGER DEFAULT 1,
  p_status_a TEXT DEFAULT 'pending',      -- or 'absent' for no row at all
  p_status_b TEXT DEFAULT 'pending',      -- or 'absent', which is how the
                                          -- request-vs-block drift starts
  p_block TEXT DEFAULT NULL,          -- NULL, 'host_blocks_a' or 'a_blocks_host'
  p_messages_from_a INTEGER DEFAULT 0 -- backdated sends, for the daily quota
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  city UUID;
  hood UUID;
  host UUID := 'a0000000-0000-4000-8000-000000000001';
  joiner_a UUID := 'a0000000-0000-4000-8000-000000000002';
  joiner_b UUID := 'a0000000-0000-4000-8000-000000000003';
  plan UUID := 'b0000000-0000-4000-8000-000000000001';
  conv_a UUID := 'c0000000-0000-4000-8000-000000000001';
  conv_b UUID := 'c0000000-0000-4000-8000-000000000002';
BEGIN
  SELECT id INTO city FROM public.cities WHERE slug = 'nyc';
  SELECT id INTO hood FROM public.neighborhoods WHERE slug = 'williamsburg' AND city_id = city;

  -- By plan, not by the seeded ids: one scenario has the race create a
  -- conversation of its own, and leaving it behind would poison the next one.
  DELETE FROM public.messages
   WHERE conversation_id IN (SELECT id FROM public.conversations WHERE plan_id = plan);
  DELETE FROM public.conversations WHERE plan_id = plan;
  DELETE FROM public.blocks
   WHERE blocker_id IN (host, joiner_a, joiner_b)
      OR blocked_id IN (host, joiner_a, joiner_b);
  DELETE FROM public.plans WHERE id = plan;

  INSERT INTO public.plans (
    id, slug, user_id, city_id, neighborhood_id, text, category, spot,
    when_day, when_date, when_time_specific, cost_expectation,
    spots_total, spots_left, status, expires_at
  ) VALUES (
    plan,
    'race-coffee-at-partners-saturday-rc01',
    host, city, hood,
    'coffee at Partners on Wythe saturday morning before the market gets busy, come sit',
    'coffee', 'Partners Coffee, 125 North 6th Street',
    'Saturday', CURRENT_DATE + 2, '9:00 AM', 'pay-own-way',
    p_spots_total, p_spots_left,
    CASE WHEN p_spots_left < 1 THEN 'full' ELSE 'open' END,
    now() + INTERVAL '2 days'
  );

  IF p_status_a <> 'absent' THEN
    INSERT INTO public.conversations (id, plan_id, poster_id, joiner_id, status)
    VALUES (conv_a, plan, host, joiner_a, p_status_a);
  END IF;

  IF p_status_b <> 'absent' THEN
    INSERT INTO public.conversations (id, plan_id, poster_id, joiner_id, status)
    VALUES (conv_b, plan, host, joiner_b, p_status_b);
  END IF;

  IF p_block = 'host_blocks_a' THEN
    INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (host, joiner_a);
  ELSIF p_block = 'a_blocks_host' THEN
    INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (joiner_a, host);
  END IF;

  -- Backdated by an hour so they are inside the rolling 24 hours but cannot be
  -- confused with anything the race itself writes.
  IF p_messages_from_a > 0 THEN
    INSERT INTO public.messages (conversation_id, from_user_id, text, created_at)
    SELECT conv_a, joiner_a, 'earlier message ' || g, now() - INTERVAL '1 hour'
      FROM generate_series(1, p_messages_from_a) g;
  END IF;
END;
$$;

-- ── WHAT HAPPENED ─────────────────────────────────────────────────────────
-- One row of JSON the driver compares against the scenario's expectation.
--
-- Conversations are found by who is in them, not by the seeded id, because one
-- scenario deliberately has the race itself create the row: the drift case
-- where a request and a block commit without either seeing the other.
--
-- `fresh_messages` counts only what the race wrote, so a quota scenario that
-- seeds four backdated sends still reads as "one more, or none".
CREATE OR REPLACE FUNCTION rehearsal.race_state()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'conv_a', (SELECT status FROM public.conversations
                WHERE plan_id = 'b0000000-0000-4000-8000-000000000001'
                  AND joiner_id = 'a0000000-0000-4000-8000-000000000002'),
    'conv_b', (SELECT status FROM public.conversations
                WHERE plan_id = 'b0000000-0000-4000-8000-000000000001'
                  AND joiner_id = 'a0000000-0000-4000-8000-000000000003'),
    'spots_left', (SELECT spots_left FROM public.plans WHERE id = 'b0000000-0000-4000-8000-000000000001'),
    'spots_total', (SELECT spots_total FROM public.plans WHERE id = 'b0000000-0000-4000-8000-000000000001'),
    'plan_status', (SELECT status FROM public.plans WHERE id = 'b0000000-0000-4000-8000-000000000001'),
    'blocks', (SELECT count(*) FROM public.blocks
                WHERE blocker_id IN ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003')
                   OR blocked_id IN ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003')),
    'fresh_messages', (SELECT count(*) FROM public.messages m
                        JOIN public.conversations c ON c.id = m.conversation_id
                       WHERE c.plan_id = 'b0000000-0000-4000-8000-000000000001'
                         AND m.created_at > now() - INTERVAL '5 minutes'),
    'reopen_count', (SELECT reopen_count FROM public.conversations
                      WHERE plan_id = 'b0000000-0000-4000-8000-000000000001'
                        AND joiner_id = 'a0000000-0000-4000-8000-000000000002')
  );
$$;

-- ── THE INVARIANTS ────────────────────────────────────────────────────────
-- Checked after EVERY scenario, whatever that scenario was about. These are the
-- two things the release promises and the two things a race would break.
CREATE OR REPLACE FUNCTION rehearsal.assert_invariants()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  bad RECORD;
BEGIN
  -- 1. Nobody is seated across a block, in either direction.
  SELECT c.id, c.poster_id, c.joiner_id INTO bad
    FROM public.conversations c
   WHERE c.status = 'confirmed'
     AND EXISTS (
       SELECT 1 FROM public.blocks b
        WHERE (b.blocker_id = c.poster_id AND b.blocked_id = c.joiner_id)
           OR (b.blocker_id = c.joiner_id AND b.blocked_id = c.poster_id)
     );
  IF FOUND THEN
    RAISE EXCEPTION 'INVARIANT FAILED: conversation % is confirmed across a block', bad.id;
  END IF;

  -- 2. Capacity is exactly what the confirmed rows say it is. A leak in either
  --    direction is a bug: spots that vanished cost the host a joiner, spots
  --    that came back twice overbook the plan.
  SELECT p.id, p.spots_left, p.spots_total, count(c.id) FILTER (WHERE c.status = 'confirmed') AS seated
    INTO bad
    FROM public.plans p
    LEFT JOIN public.conversations c ON c.plan_id = p.id
   WHERE p.id = 'b0000000-0000-4000-8000-000000000001'
   GROUP BY p.id, p.spots_left, p.spots_total
  HAVING p.spots_left <> p.spots_total - count(c.id) FILTER (WHERE c.status = 'confirmed');
  IF FOUND THEN
    RAISE EXCEPTION 'INVARIANT FAILED: plan % has spots_left % with % confirmed of % total',
      bad.id, bad.spots_left, bad.seated, bad.spots_total;
  END IF;

  -- 3. Capacity stays inside its own bounds even if the arithmetic above ever
  --    agreed with itself for the wrong reason.
  IF EXISTS (
    SELECT 1 FROM public.plans
     WHERE id = 'b0000000-0000-4000-8000-000000000001'
       AND (spots_left < 0 OR spots_left > spots_total)
  ) THEN
    RAISE EXCEPTION 'INVARIANT FAILED: spots_left is outside 0..spots_total';
  END IF;

  RETURN 'INVARIANTS OK';
END;
$$;
