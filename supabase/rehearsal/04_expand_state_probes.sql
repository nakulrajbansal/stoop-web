-- ═══════════════════════════════════════════════════════════════════════════
-- LOCAL REHEARSAL PROBES: the expand state
--
-- Run AFTER the two expand migrations and BEFORE the postdeploy hardening one.
-- This is the window where the previously deployed code is still serving, so
-- what matters here is the opposite of the contract probes: the legacy paths
-- must still work, and the new ones must already be available.
--
-- Every probe raises on failure. Throwaway local database only.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ── FIXTURE ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  city UUID;
  hood UUID;
  host UUID := '9999aaaa-0000-4000-8000-0000000000e1';
  joiner UUID := '9999bbbb-0000-4000-8000-0000000000e2';
BEGIN
  SELECT id INTO city FROM public.cities WHERE slug = 'nyc';
  SELECT id INTO hood FROM public.neighborhoods WHERE slug = 'williamsburg' AND city_id = city;

  INSERT INTO auth.users (id) VALUES (host), (joiner) ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id, name, phone_e164, notify_email, city_id, neighborhood_id)
  VALUES
    (host, 'Nina Alvarez', '+15550009001', 'nina@example.test', city, hood),
    (joiner, 'Omar Haddad', '+15550009002', 'omar@example.test', city, hood)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.plans (id, slug, user_id, city_id, neighborhood_id, text, category, spot,
    when_day, when_date, when_time_specific, cost_expectation, spots_total, spots_left, status, expires_at)
  VALUES ('9999cccc-0000-4000-8000-0000000000e3', 'expand-state-plan-uv12', host, city, hood,
    'gallery wander saturday afternoon, i go slow and read every caption',
    'arts', 'Pioneer Works entrance', 'Saturday', CURRENT_DATE + 2, '2:00 PM', 'free',
    2, 2, 'open', now() + INTERVAL '2 days')
  ON CONFLICT (id) DO NOTHING;
END
$$;

-- ── PROBE E1: the old code can still do its job ─────────────────────────
-- Direct conversation and message inserts, and a direct status update, are
-- exactly what the currently deployed release does. If any of them failed here
-- the rollout would be an outage rather than an expand.
DO $$
DECLARE
  conv_id UUID := '9999dddd-0000-4000-8000-0000000000e4';
  host UUID := '9999aaaa-0000-4000-8000-0000000000e1';
  joiner UUID := '9999bbbb-0000-4000-8000-0000000000e2';
  msgs INTEGER;
  final_status TEXT;
BEGIN
  DELETE FROM public.conversations WHERE id = conv_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', joiner), true);

  INSERT INTO public.conversations (id, plan_id, poster_id, joiner_id)
  VALUES (conv_id, '9999cccc-0000-4000-8000-0000000000e3', host, joiner);

  INSERT INTO public.messages (conversation_id, from_user_id, text)
  VALUES (conv_id, joiner, 'legacy client opener');

  RESET ROLE;

  -- And the host confirming, the way the deployed code does it: a direct update.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s"}', host), true);
  UPDATE public.conversations SET status = 'confirmed' WHERE id = conv_id;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT count(*) INTO msgs FROM public.messages WHERE conversation_id = conv_id;
  SELECT status INTO final_status FROM public.conversations WHERE id = conv_id;

  IF msgs <> 1 OR final_status <> 'confirmed' THEN
    RAISE EXCEPTION 'PROBE E1 FAILED: legacy path broken (% messages, status %)', msgs, final_status;
  END IF;
  RAISE NOTICE 'PROBE E1 PASS: the deployed release still creates, messages and confirms';
END
$$;

-- ── PROBE E2: the full name is still readable, and the projection is ready ──
DO $$
DECLARE
  full_name TEXT;
  short_name TEXT;
BEGIN
  SET LOCAL ROLE anon;
  SELECT name INTO full_name FROM public.profiles WHERE id = '9999aaaa-0000-4000-8000-0000000000e1';
  SELECT display_name INTO short_name FROM public.profiles WHERE id = '9999aaaa-0000-4000-8000-0000000000e1';
  RESET ROLE;

  IF full_name <> 'Nina Alvarez' THEN
    RAISE EXCEPTION 'PROBE E2 FAILED: the old public read is already broken, name=%', full_name;
  END IF;
  IF short_name <> 'Nina' THEN
    RAISE EXCEPTION 'PROBE E2 FAILED: the new projection is not ready, display_name=%', short_name;
  END IF;
  RAISE NOTICE 'PROBE E2 PASS: old reads still work and display_name is already granted';
END
$$;

-- ── PROBE E3: the new server paths are already available ────────────────
DO $$
DECLARE
  result JSONB;
BEGIN
  IF NOT has_function_privilege('service_role', 'public.send_conversation_message(uuid,uuid,text,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.start_or_reopen_conversation(uuid,uuid,text,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.block_and_close(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROBE E3 FAILED: a new function is missing before the deploy';
  END IF;

  result := public.send_conversation_message(
    '9999dddd-0000-4000-8000-0000000000e4',
    '9999bbbb-0000-4000-8000-0000000000e2',
    'sent through the new path while the old one still works'
  );
  IF result->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'PROBE E3 FAILED: the new send path does not work yet: %', result;
  END IF;
  RAISE NOTICE 'PROBE E3 PASS: new and old paths both work in the expand state';
END
$$;

-- ── PROBE E4: blocking a confirmed participant gives the seat back ───────
-- The leak: closing a confirmed request as declined removed the person from the
-- roster and left the plan full.
DO $$
DECLARE
  v_plan_id UUID := '9999cccc-0000-4000-8000-0000000000e3';
  conv_id UUID := '9999dddd-0000-4000-8000-0000000000e4';
  host UUID := '9999aaaa-0000-4000-8000-0000000000e1';
  joiner UUID := '9999bbbb-0000-4000-8000-0000000000e2';
  result JSONB;
  plan_row public.plans%ROWTYPE;
  conv_status TEXT;
  roster INTEGER;
  blocked INTEGER;
BEGIN
  -- One seat taken, plan full.
  UPDATE public.plans SET spots_total = 1, spots_left = 0, status = 'full' WHERE id = v_plan_id;
  UPDATE public.conversations SET status = 'confirmed' WHERE id = conv_id;

  result := public.block_and_close(host, joiner);
  IF result->>'ok' <> 'true' OR (result->>'seats_returned')::INTEGER <> 1 THEN
    RAISE EXCEPTION 'PROBE E4 FAILED: the block did not return the seat: %', result;
  END IF;

  SELECT * INTO plan_row FROM public.plans WHERE id = v_plan_id;
  SELECT status INTO conv_status FROM public.conversations WHERE id = conv_id;
  SELECT count(*) INTO roster FROM public.conversations WHERE plan_id = v_plan_id AND status = 'confirmed';
  SELECT count(*) INTO blocked FROM public.blocks WHERE blocker_id = host AND blocked_id = joiner;

  IF conv_status <> 'declined' THEN
    RAISE EXCEPTION 'PROBE E4 FAILED: conversation is % rather than declined', conv_status;
  END IF;
  IF plan_row.spots_left <> 1 OR plan_row.status <> 'open' THEN
    RAISE EXCEPTION 'PROBE E4 FAILED: spots_left=% status=%, the seat leaked', plan_row.spots_left, plan_row.status;
  END IF;
  IF roster <> 0 THEN
    RAISE EXCEPTION 'PROBE E4 FAILED: % people still on the roster', roster;
  END IF;
  IF blocked <> 1 THEN
    RAISE EXCEPTION 'PROBE E4 FAILED: the block itself did not land';
  END IF;
  RAISE NOTICE 'PROBE E4 PASS: blocking a confirmed participant returns exactly one seat and reopens the plan';
END
$$;

-- ── PROBE E5: blocking again changes nothing, and a plain decline is free ──
DO $$
DECLARE
  v_plan_id UUID := '9999cccc-0000-4000-8000-0000000000e3';
  host UUID := '9999aaaa-0000-4000-8000-0000000000e1';
  joiner UUID := '9999bbbb-0000-4000-8000-0000000000e2';
  result JSONB;
  spots_before INTEGER;
  spots_after INTEGER;
BEGIN
  SELECT spots_left INTO spots_before FROM public.plans WHERE id = v_plan_id;
  result := public.block_and_close(host, joiner);
  SELECT spots_left INTO spots_after FROM public.plans WHERE id = v_plan_id;

  IF result->>'ok' <> 'true' OR (result->>'seats_returned')::INTEGER <> 0 THEN
    RAISE EXCEPTION 'PROBE E5 FAILED: a repeat block refunded again: %', result;
  END IF;
  IF spots_before <> spots_after THEN
    RAISE EXCEPTION 'PROBE E5 FAILED: capacity moved from % to % on a repeat block', spots_before, spots_after;
  END IF;

  -- An ordinary decline of a pending request must not move capacity.
  UPDATE public.conversations SET status = 'pending' WHERE id = '9999dddd-0000-4000-8000-0000000000e4';
  SELECT spots_left INTO spots_before FROM public.plans WHERE id = v_plan_id;
  PERFORM public.confirm_conversation('9999dddd-0000-4000-8000-0000000000e4', host, 'decline');
  SELECT spots_left INTO spots_after FROM public.plans WHERE id = v_plan_id;

  IF spots_before <> spots_after THEN
    RAISE EXCEPTION 'PROBE E5 FAILED: a plain decline moved capacity from % to %', spots_before, spots_after;
  END IF;
  RAISE NOTICE 'PROBE E5 PASS: repeat blocks are idempotent and an ordinary decline is free';
END
$$;

-- ── PROBE E6: a failed close rolls the block back with it ───────────────
CREATE OR REPLACE FUNCTION public.rehearsal_break_conversations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rehearsal: conversation update refused';
END;
$$;

DO $$
DECLARE
  host UUID := '9999aaaa-0000-4000-8000-0000000000e1';
  joiner UUID := '9999bbbb-0000-4000-8000-0000000000e2';
  conv_id UUID := '9999dddd-0000-4000-8000-0000000000e4';
  failed BOOLEAN := false;
  blocked INTEGER;
BEGIN
  DELETE FROM public.blocks WHERE blocker_id = host AND blocked_id = joiner;
  UPDATE public.conversations SET status = 'pending' WHERE id = conv_id;

  CREATE TRIGGER rehearsal_break_conversations
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION public.rehearsal_break_conversations();

  BEGIN
    PERFORM public.block_and_close(host, joiner);
  EXCEPTION WHEN OTHERS THEN
    failed := true;
  END;

  DROP TRIGGER rehearsal_break_conversations ON public.conversations;

  SELECT count(*) INTO blocked FROM public.blocks WHERE blocker_id = host AND blocked_id = joiner;

  IF NOT failed THEN
    RAISE EXCEPTION 'PROBE E6 FAILED: the broken update did not raise';
  END IF;
  IF blocked <> 0 THEN
    RAISE EXCEPTION 'PROBE E6 FAILED: the block survived a failed close';
  END IF;
  RAISE NOTICE 'PROBE E6 PASS: a failed close takes the block with it';
END
$$;

DROP FUNCTION IF EXISTS public.rehearsal_break_conversations();

SELECT 'ALL EXPAND STATE PROBES PASSED' AS result;
