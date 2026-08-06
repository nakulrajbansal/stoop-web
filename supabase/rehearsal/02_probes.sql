-- ═══════════════════════════════════════════════════════════════════════════
-- LOCAL REHEARSAL PROBES: does the lifecycle actually behave?
--
-- Every probe raises an exception on failure, so psql with ON_ERROR_STOP=1
-- exits non-zero the moment something is wrong. Run against the throwaway
-- local database only.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ── FIXTURE ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  city UUID;
  hood UUID;
  host UUID := '11111111-1111-4111-8111-111111111111';
  joiner_a UUID := '22222222-2222-4222-8222-222222222222';
  joiner_b UUID := '33333333-3333-4333-8333-333333333333';
BEGIN
  SELECT id INTO city FROM public.cities WHERE slug = 'nyc';
  SELECT id INTO hood FROM public.neighborhoods WHERE slug = 'williamsburg' AND city_id = city;

  INSERT INTO auth.users (id) VALUES (host), (joiner_a), (joiner_b) ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, name, phone_e164, city_id, neighborhood_id)
  VALUES
    (host, 'Maya Rodriguez', '+15550000001', city, hood),
    (joiner_a, 'Theo Park', '+15550000002', city, hood),
    (joiner_b, 'Ada Chen', '+15550000003', city, hood)
  ON CONFLICT (id) DO NOTHING;

  -- One spot, so the second confirmation has to be refused.
  INSERT INTO public.plans (
    id, slug, user_id, city_id, neighborhood_id, text, category, spot,
    when_day, when_date, when_time_specific, cost_expectation,
    spots_total, spots_left, status, expires_at
  ) VALUES (
    '44444444-4444-4444-8444-444444444444',
    'coffee-at-partners-saturday-ab12',
    host, city, hood,
    'coffee at Partners on Wythe saturday morning before the market gets busy, come sit',
    'coffee', 'Partners Coffee, 125 North 6th Street',
    'Saturday', CURRENT_DATE + 2, '9:00 AM', 'pay-own-way',
    1, 1, 'open', now() + INTERVAL '2 days'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.conversations (id, plan_id, poster_id, joiner_id)
  VALUES
    ('55555555-5555-4555-8555-555555555551', '44444444-4444-4444-8444-444444444444', host, joiner_a),
    ('55555555-5555-4555-8555-555555555552', '44444444-4444-4444-8444-444444444444', host, joiner_b)
  ON CONFLICT (id) DO NOTHING;
END
$$;

-- ── PROBE 1: only service_role may execute the lifecycle functions ────────
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.withdraw_conversation(uuid,uuid)',
    'public.confirm_conversation(uuid,uuid,text)',
    'public.start_or_reopen_conversation(uuid,uuid,text,boolean)'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'PROBE 1 FAILED: anon can execute %', fn;
    END IF;
    IF has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'PROBE 1 FAILED: authenticated can execute %', fn;
    END IF;
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'PROBE 1 FAILED: service_role cannot execute %', fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'PROBE 1 PASS: lifecycle functions are service_role only';
END
$$;

-- ── PROBE 2: every new function pins its search path ─────────────────────
DO $$
DECLARE
  bad TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('withdraw_conversation', 'confirm_conversation', 'start_or_reopen_conversation', 'handle_conversation_status_change')
     AND NOT EXISTS (
       SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::TEXT[])) c
        WHERE c LIKE 'search_path=%'
     );
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'PROBE 2 FAILED: unpinned search_path on %', bad;
  END IF;
  RAISE NOTICE 'PROBE 2 PASS: search_path pinned on every new function';
END
$$;

-- ── PROBE 3: the old confirm-only trigger is gone ────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_conversation_confirmed') THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: the old trigger is still attached';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_conversation_status_change') THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: the new trigger is missing';
  END IF;
  RAISE NOTICE 'PROBE 3 PASS: trigger replaced';
END
$$;

-- ── PROBE 4: confirm takes the spot and fills the plan ───────────────────
DO $$
DECLARE
  result JSONB;
  plan_row public.plans%ROWTYPE;
BEGIN
  result := public.confirm_conversation(
    '55555555-5555-4555-8555-555555555551',
    '11111111-1111-4111-8111-111111111111',
    'confirm'
  );
  IF result->>'ok' <> 'true' THEN RAISE EXCEPTION 'PROBE 4 FAILED: %', result; END IF;

  SELECT * INTO plan_row FROM public.plans WHERE id = '44444444-4444-4444-8444-444444444444';
  IF plan_row.spots_left <> 0 OR plan_row.status <> 'full' THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: spots_left % status %', plan_row.spots_left, plan_row.status;
  END IF;
  RAISE NOTICE 'PROBE 4 PASS: confirm took the last spot and filled the plan';
END
$$;

-- ── PROBE 5: a second confirmation cannot overbook ───────────────────────
DO $$
DECLARE
  result JSONB;
  conv_status TEXT;
BEGIN
  result := public.confirm_conversation(
    '55555555-5555-4555-8555-555555555552',
    '11111111-1111-4111-8111-111111111111',
    'confirm'
  );
  IF result->>'ok' <> 'false' OR result->>'code' <> 'no_spots' THEN
    RAISE EXCEPTION 'PROBE 5 FAILED: overbooking was allowed: %', result;
  END IF;
  SELECT status INTO conv_status FROM public.conversations WHERE id = '55555555-5555-4555-8555-555555555552';
  IF conv_status <> 'pending' THEN
    RAISE EXCEPTION 'PROBE 5 FAILED: second request became %', conv_status;
  END IF;
  RAISE NOTICE 'PROBE 5 PASS: the second confirmation was refused';
END
$$;

-- ── PROBE 6: the trigger refuses an overbooking even by direct update ────
DO $$
DECLARE
  message TEXT;
BEGIN
  BEGIN
    UPDATE public.conversations
       SET status = 'confirmed'
     WHERE id = '55555555-5555-4555-8555-555555555552';
    RAISE EXCEPTION 'PROBE 6 FAILED: a direct update overbooked the plan';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
    RAISE NOTICE 'PROBE 6 PASS: direct update refused (%)', message;
  END;
END
$$;

-- ── PROBE 7: only the requester withdraws, and it restores one spot ──────
DO $$
DECLARE
  result JSONB;
  plan_row public.plans%ROWTYPE;
BEGIN
  result := public.withdraw_conversation(
    '55555555-5555-4555-8555-555555555551',
    '11111111-1111-4111-8111-111111111111'
  );
  IF result->>'ok' <> 'false' OR result->>'code' <> 'forbidden' THEN
    RAISE EXCEPTION 'PROBE 7 FAILED: the host was allowed to withdraw someone: %', result;
  END IF;

  result := public.withdraw_conversation(
    '55555555-5555-4555-8555-555555555551',
    '22222222-2222-4222-8222-222222222222'
  );
  IF result->>'ok' <> 'true' OR (result->>'already')::BOOLEAN THEN
    RAISE EXCEPTION 'PROBE 7 FAILED: withdrawal did not take: %', result;
  END IF;

  SELECT * INTO plan_row FROM public.plans WHERE id = '44444444-4444-4444-8444-444444444444';
  IF plan_row.spots_left <> 1 OR plan_row.status <> 'open' THEN
    RAISE EXCEPTION 'PROBE 7 FAILED: spots_left % status %', plan_row.spots_left, plan_row.status;
  END IF;
  RAISE NOTICE 'PROBE 7 PASS: one spot back and the plan reopened';
END
$$;

-- ── PROBE 8: withdrawing twice does not refund twice ─────────────────────
DO $$
DECLARE
  result JSONB;
  plan_row public.plans%ROWTYPE;
BEGIN
  result := public.withdraw_conversation(
    '55555555-5555-4555-8555-555555555551',
    '22222222-2222-4222-8222-222222222222'
  );
  IF result->>'ok' <> 'true' OR NOT (result->>'already')::BOOLEAN THEN
    RAISE EXCEPTION 'PROBE 8 FAILED: second withdrawal was not idempotent: %', result;
  END IF;

  SELECT * INTO plan_row FROM public.plans WHERE id = '44444444-4444-4444-8444-444444444444';
  IF plan_row.spots_left <> 1 THEN
    RAISE EXCEPTION 'PROBE 8 FAILED: spots_left drifted to %', plan_row.spots_left;
  END IF;
  RAISE NOTICE 'PROBE 8 PASS: double withdrawal changed nothing';
END
$$;

-- ── PROBE 9: a withdrawn request cannot be confirmed ─────────────────────
DO $$
DECLARE
  result JSONB;
BEGIN
  result := public.confirm_conversation(
    '55555555-5555-4555-8555-555555555551',
    '11111111-1111-4111-8111-111111111111',
    'confirm'
  );
  IF result->>'ok' <> 'false' OR result->>'code' <> 'already_resolved' THEN
    RAISE EXCEPTION 'PROBE 9 FAILED: a withdrawn request was confirmable: %', result;
  END IF;
  RAISE NOTICE 'PROBE 9 PASS: withdrawn stays withdrawn without a new request';
END
$$;

-- ── PROBE 10: pending withdrawal touches no capacity; declined cannot ────
DO $$
DECLARE
  result JSONB;
  before_spots INTEGER;
  after_spots INTEGER;
BEGIN
  SELECT spots_left INTO before_spots FROM public.plans WHERE id = '44444444-4444-4444-8444-444444444444';

  result := public.withdraw_conversation(
    '55555555-5555-4555-8555-555555555552',
    '33333333-3333-4333-8333-333333333333'
  );
  IF result->>'ok' <> 'true' THEN RAISE EXCEPTION 'PROBE 10 FAILED: %', result; END IF;

  SELECT spots_left INTO after_spots FROM public.plans WHERE id = '44444444-4444-4444-8444-444444444444';
  IF before_spots <> after_spots THEN
    RAISE EXCEPTION 'PROBE 10 FAILED: a pending withdrawal moved capacity from % to %', before_spots, after_spots;
  END IF;

  -- And a declined request has nothing to withdraw.
  UPDATE public.conversations SET status = 'declined' WHERE id = '55555555-5555-4555-8555-555555555552';
  result := public.withdraw_conversation(
    '55555555-5555-4555-8555-555555555552',
    '33333333-3333-4333-8333-333333333333'
  );
  IF result->>'ok' <> 'false' OR result->>'code' <> 'declined' THEN
    RAISE EXCEPTION 'PROBE 10 FAILED: a declined request was withdrawable: %', result;
  END IF;
  RAISE NOTICE 'PROBE 10 PASS: pending withdrawal is free, declined cannot withdraw';
END
$$;

-- ── PROBE 11: a confirmed spot cannot be handed back after the plan ──────
DO $$
DECLARE
  result JSONB;
BEGIN
  UPDATE public.conversations SET status = 'pending', withdrawn_at = NULL
   WHERE id = '55555555-5555-4555-8555-555555555551';
  UPDATE public.conversations SET status = 'confirmed'
   WHERE id = '55555555-5555-4555-8555-555555555551';
  UPDATE public.plans SET expires_at = now() - INTERVAL '1 day'
   WHERE id = '44444444-4444-4444-8444-444444444444';

  result := public.withdraw_conversation(
    '55555555-5555-4555-8555-555555555551',
    '22222222-2222-4222-8222-222222222222'
  );
  IF result->>'ok' <> 'false' OR result->>'code' <> 'expired' THEN
    RAISE EXCEPTION 'PROBE 11 FAILED: a past plan gave a spot back: %', result;
  END IF;
  RAISE NOTICE 'PROBE 11 PASS: a plan that already happened keeps its roster';
END
$$;

-- ── PROBE 12: legacy plans survive, and cost is never invented ───────────
DO $$
DECLARE
  legacy UUID := '66666666-6666-4666-8666-666666666666';
  cost TEXT;
BEGIN
  INSERT INTO public.plans (
    id, slug, user_id, city_id, neighborhood_id, text, category,
    when_day, spots_total, spots_left, status, expires_at, intent_tags
  )
  SELECT legacy, 'legacy-plan-with-no-time-or-spot-cd34',
         '11111111-1111-4111-8111-111111111111', c.id, n.id,
         'walking around the neighborhood at some point this week, come along if you want',
         'outdoors', 'Saturday', 2, 2, 'open', now() + INTERVAL '3 days', ARRAY['paid']::TEXT[]
    FROM public.cities c
    JOIN public.neighborhoods n ON n.city_id = c.id AND n.slug = 'williamsburg'
   WHERE c.slug = 'nyc'
  ON CONFLICT (id) DO NOTHING;

  SELECT cost_expectation INTO cost FROM public.plans WHERE id = legacy;
  IF cost IS NOT NULL THEN
    RAISE EXCEPTION 'PROBE 12 FAILED: a cost was invented for an ambiguous legacy plan: %', cost;
  END IF;

  -- And an unrelated update to a legacy row still works: no constraint added
  -- by this release fires on a plan that predates the contract.
  UPDATE public.plans SET spots_left = 1 WHERE id = legacy;
  RAISE NOTICE 'PROBE 12 PASS: legacy plans stay readable and writable';
END
$$;

-- ── PROBE 13: a withdrawn requester can ask again, once, with an opener ──
DO $$
DECLARE
  v_plan_id UUID := '99999999-9999-4999-8999-999999999999';
  v_conv_id UUID := 'aaaa1111-9999-4999-8999-999999999991';
  joiner UUID := '22222222-2222-4222-8222-222222222222';
  result JSONB;
  conv public.conversations%ROWTYPE;
  plan_row public.plans%ROWTYPE;
  msgs INTEGER;
BEGIN
  DELETE FROM public.conversations WHERE plan_id = v_plan_id;
  DELETE FROM public.plans WHERE id = v_plan_id;

  INSERT INTO public.plans (id, slug, user_id, city_id, neighborhood_id, text, category, spot,
    when_day, when_date, when_time_specific, cost_expectation, spots_total, spots_left, status, expires_at)
  SELECT v_plan_id, 'ask-again-plan-ij90', '11111111-1111-4111-8111-111111111111', c.id, n.id,
    'slow loop around McCarren sunday at 9, the kind of pace where you can actually talk',
    'outdoors', 'McCarren Park track', 'Sunday', CURRENT_DATE + 4, '9:00 AM', 'free',
    2, 2, 'open', now() + INTERVAL '4 days'
  FROM public.cities c JOIN public.neighborhoods n ON n.city_id = c.id AND n.slug = 'williamsburg'
  WHERE c.slug = 'nyc';

  INSERT INTO public.conversations (id, plan_id, poster_id, joiner_id, status, withdrawn_at)
  VALUES (v_conv_id, v_plan_id, '11111111-1111-4111-8111-111111111111', joiner, 'withdrawn', now());

  result := public.start_or_reopen_conversation(v_plan_id, joiner, 'I would love back in if there is room.', true);
  IF result->>'ok' <> 'true' OR result->>'status' <> 'pending' THEN
    RAISE EXCEPTION 'PROBE 13 FAILED: asking again was refused: %', result;
  END IF;
  IF (result->>'reopened')::BOOLEAN IS NOT TRUE OR (result->>'notify_host')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'PROBE 13 FAILED: the host would not be told: %', result;
  END IF;

  SELECT * INTO conv FROM public.conversations WHERE id = v_conv_id;
  SELECT * INTO plan_row FROM public.plans WHERE id = v_plan_id;
  SELECT count(*) INTO msgs FROM public.messages WHERE conversation_id = v_conv_id;

  IF conv.status <> 'pending' OR conv.reopen_count <> 1 OR conv.reopened_at IS NULL THEN
    RAISE EXCEPTION 'PROBE 13 FAILED: row not reopened cleanly (status=%, count=%)', conv.status, conv.reopen_count;
  END IF;
  IF conv.withdrawn_at IS NULL THEN
    RAISE EXCEPTION 'PROBE 13 FAILED: the withdrawal was erased from the record';
  END IF;
  IF msgs <> 1 THEN
    RAISE EXCEPTION 'PROBE 13 FAILED: the opener did not land, % messages', msgs;
  END IF;
  IF plan_row.spots_left <> 2 THEN
    RAISE EXCEPTION 'PROBE 13 FAILED: asking again moved capacity to %', plan_row.spots_left;
  END IF;
  RAISE NOTICE 'PROBE 13 PASS: withdrawn to pending with its opener, history kept, no spot taken';
END
$$;

-- ── PROBE 14: asking again is capped, and a repeat message is not news ───
DO $$
DECLARE
  v_plan_id UUID := '99999999-9999-4999-8999-999999999999';
  v_conv_id UUID := 'aaaa1111-9999-4999-8999-999999999991';
  joiner UUID := '22222222-2222-4222-8222-222222222222';
  result JSONB;
BEGIN
  -- Already pending: the message goes in, the host is not told twice.
  result := public.start_or_reopen_conversation(v_plan_id, joiner, 'one more thought before sunday', true);
  IF result->>'ok' <> 'true' OR (result->>'notify_host')::BOOLEAN IS NOT FALSE THEN
    RAISE EXCEPTION 'PROBE 14 FAILED: a repeat message notified the host again: %', result;
  END IF;

  PERFORM public.withdraw_conversation(v_conv_id, joiner);
  result := public.start_or_reopen_conversation(v_plan_id, joiner, 'sorry, changed my mind again', true);
  IF result->>'ok' <> 'false' OR result->>'code' <> 'reopen_limit' THEN
    RAISE EXCEPTION 'PROBE 14 FAILED: the second re-request was allowed: %', result;
  END IF;
  RAISE NOTICE 'PROBE 14 PASS: one re-request per plan, and no double notification';
END
$$;

-- ── PROBE 15: a decline stands, and a host cannot request on their own plan ──
DO $$
DECLARE
  v_plan_id UUID := '99999999-9999-4999-8999-999999999999';
  v_conv_id UUID := 'aaaa1111-9999-4999-8999-999999999991';
  host UUID := '11111111-1111-4111-8111-111111111111';
  joiner UUID := '22222222-2222-4222-8222-222222222222';
  result JSONB;
BEGIN
  result := public.start_or_reopen_conversation(v_plan_id, host, 'can I join my own plan please', true);
  IF result->>'ok' <> 'false' OR result->>'code' <> 'own_plan' THEN
    RAISE EXCEPTION 'PROBE 15 FAILED: the host started a request on their own plan: %', result;
  END IF;

  UPDATE public.conversations SET status = 'declined', reopen_count = 0 WHERE id = v_conv_id;
  result := public.start_or_reopen_conversation(v_plan_id, joiner, 'any chance you would reconsider', true);
  IF result->>'ok' <> 'false' OR result->>'code' <> 'declined' THEN
    RAISE EXCEPTION 'PROBE 15 FAILED: a declined request was reopened: %', result;
  END IF;
  RAISE NOTICE 'PROBE 15 PASS: declines are final and a host cannot request on their own plan';
END
$$;

-- ── PROBE 16: a closed plan says so, rather than blaming capacity ────────
DO $$
DECLARE
  v_plan_id UUID := '99999999-9999-4999-8999-999999999999';
  v_conv_id UUID := 'aaaa1111-9999-4999-8999-999999999991';
  joiner UUID := '22222222-2222-4222-8222-222222222222';
  result JSONB;
BEGIN
  UPDATE public.conversations SET status = 'withdrawn', reopen_count = 0 WHERE id = v_conv_id;
  UPDATE public.plans SET status = 'removed' WHERE id = v_plan_id;

  result := public.start_or_reopen_conversation(v_plan_id, joiner, 'still keen if it is happening', true);
  IF result->>'code' <> 'plan_closed' THEN
    RAISE EXCEPTION 'PROBE 16 FAILED: a removed plan answered %', result;
  END IF;

  UPDATE public.plans SET status = 'open', expires_at = now() - INTERVAL '1 day' WHERE id = v_plan_id;
  UPDATE public.conversations SET status = 'pending' WHERE id = v_conv_id;
  result := public.confirm_conversation(v_conv_id, '11111111-1111-4111-8111-111111111111', 'confirm');
  IF result->>'code' <> 'plan_closed' THEN
    RAISE EXCEPTION 'PROBE 16 FAILED: confirming a past plan answered %', result;
  END IF;
  RAISE NOTICE 'PROBE 16 PASS: closed and full are told apart';
END
$$;

-- ── PROBE 17: a failed opener leaves no orphan pending request ───────────
-- The whole reason the two writes were merged. This trigger stands in for
-- whatever makes a message insert fail in production: a constraint, a disk, a
-- deploy landing mid request.
CREATE OR REPLACE FUNCTION public.rehearsal_break_messages()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rehearsal: message insert refused';
END;
$$;

DO $$
DECLARE
  v_plan_id UUID := 'bbbb2222-9999-4999-8999-999999999992';
  joiner UUID := '33333333-3333-4333-8333-333333333333';
  convs INTEGER;
  msgs INTEGER;
  failed BOOLEAN := false;
BEGIN
  DELETE FROM public.conversations WHERE plan_id = v_plan_id;
  DELETE FROM public.plans WHERE id = v_plan_id;
  INSERT INTO public.plans (id, slug, user_id, city_id, neighborhood_id, text, category, spot,
    when_day, when_date, when_time_specific, cost_expectation, spots_total, spots_left, status, expires_at)
  SELECT v_plan_id, 'rollback-plan-kl12', '11111111-1111-4111-8111-111111111111', c.id, n.id,
    'reading at Spoonbill before they close, quiet hour then coffee if anyone wants',
    'books', 'Spoonbill Books', 'Wednesday', CURRENT_DATE + 2, '7:00 PM', 'free',
    2, 2, 'open', now() + INTERVAL '2 days'
  FROM public.cities c JOIN public.neighborhoods n ON n.city_id = c.id AND n.slug = 'williamsburg'
  WHERE c.slug = 'nyc';

  CREATE TRIGGER rehearsal_break_messages
    BEFORE INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.rehearsal_break_messages();

  BEGIN
    PERFORM public.start_or_reopen_conversation(v_plan_id, joiner, 'would love to come along on wednesday');
  EXCEPTION WHEN OTHERS THEN
    failed := true;
  END;

  DROP TRIGGER rehearsal_break_messages ON public.messages;

  SELECT count(*) INTO convs FROM public.conversations WHERE plan_id = v_plan_id;
  SELECT count(*) INTO msgs FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id WHERE c.plan_id = v_plan_id;

  IF NOT failed THEN
    RAISE EXCEPTION 'PROBE 17 FAILED: the broken insert did not raise';
  END IF;
  IF convs <> 0 OR msgs <> 0 THEN
    RAISE EXCEPTION 'PROBE 17 FAILED: orphan left behind (% conversations, % messages)', convs, msgs;
  END IF;
  RAISE NOTICE 'PROBE 17 PASS: a failed opener leaves no pending request behind';
END
$$;

-- ── PROBE 18: and a failed opener does not spend a re-request ────────────
DO $$
DECLARE
  v_plan_id UUID := 'bbbb2222-9999-4999-8999-999999999992';
  v_conv_id UUID := 'cccc3333-9999-4999-8999-999999999993';
  joiner UUID := '33333333-3333-4333-8333-333333333333';
  conv public.conversations%ROWTYPE;
  failed BOOLEAN := false;
BEGIN
  INSERT INTO public.conversations (id, plan_id, poster_id, joiner_id, status, withdrawn_at, reopen_count)
  VALUES (v_conv_id, v_plan_id, '11111111-1111-4111-8111-111111111111', joiner, 'withdrawn', now(), 0);

  CREATE TRIGGER rehearsal_break_messages
    BEFORE INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.rehearsal_break_messages();

  BEGIN
    PERFORM public.start_or_reopen_conversation(v_plan_id, joiner, 'asking again, if that is alright', true);
  EXCEPTION WHEN OTHERS THEN
    failed := true;
  END;

  DROP TRIGGER rehearsal_break_messages ON public.messages;

  SELECT * INTO conv FROM public.conversations WHERE id = v_conv_id;

  IF NOT failed THEN
    RAISE EXCEPTION 'PROBE 18 FAILED: the broken insert did not raise';
  END IF;
  IF conv.status <> 'withdrawn' OR conv.reopen_count <> 0 OR conv.reopened_at IS NOT NULL THEN
    RAISE EXCEPTION 'PROBE 18 FAILED: reopen partially committed (status=%, count=%, at=%)',
      conv.status, conv.reopen_count, conv.reopened_at;
  END IF;
  RAISE NOTICE 'PROBE 18 PASS: a failed opener leaves the request withdrawn, with its reopen unspent';
END
$$;

DROP FUNCTION IF EXISTS public.rehearsal_break_messages();


-- ── PROBE 19: an active conversation is not a new request ───────────────
-- Reusing the request path on a pending or confirmed thread used to insert
-- another message, which is a way around the daily limit in /api/messages.
DO $$
DECLARE
  v_plan_id UUID := 'dddd4444-9999-4999-8999-999999999994';
  joiner UUID := '22222222-2222-4222-8222-222222222222';
  result JSONB;
  conv_id UUID;
  msgs INTEGER;
BEGIN
  DELETE FROM public.conversations WHERE plan_id = v_plan_id;
  DELETE FROM public.plans WHERE id = v_plan_id;
  INSERT INTO public.plans (id, slug, user_id, city_id, neighborhood_id, text, category, spot,
    when_day, when_date, when_time_specific, cost_expectation, spots_total, spots_left, status, expires_at)
  SELECT v_plan_id, 'active-thread-plan-mn34', '11111111-1111-4111-8111-111111111111', c.id, n.id,
    'bagel run sunday at 10, we eat them on the bench like it is a whole event',
    'food', 'Bagel Store on Bedford', 'Sunday', CURRENT_DATE + 3, '10:00 AM', 'pay-own-way',
    2, 2, 'open', now() + INTERVAL '3 days'
  FROM public.cities c JOIN public.neighborhoods n ON n.city_id = c.id AND n.slug = 'williamsburg'
  WHERE c.slug = 'nyc';

  result := public.start_or_reopen_conversation(v_plan_id, joiner, 'mind if I come along on sunday?');
  conv_id := (result->>'conversation_id')::UUID;
  IF (result->>'created')::BOOLEAN IS NOT TRUE OR (result->>'message_written')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'PROBE 19 FAILED: the first request did not write its opener: %', result;
  END IF;

  -- Same call again on the now pending thread.
  result := public.start_or_reopen_conversation(v_plan_id, joiner, 'and another thing');
  IF result->>'ok' <> 'true' OR result->>'status' <> 'pending' THEN
    RAISE EXCEPTION 'PROBE 19 FAILED: the second call did not report the state: %', result;
  END IF;
  IF (result->>'message_written')::BOOLEAN IS NOT FALSE
     OR (result->>'notify_host')::BOOLEAN IS NOT FALSE
     OR (result->>'created')::BOOLEAN IS NOT FALSE THEN
    RAISE EXCEPTION 'PROBE 19 FAILED: an active thread was treated as a new request: %', result;
  END IF;

  SELECT count(*) INTO msgs FROM public.messages WHERE conversation_id = conv_id;
  IF msgs <> 1 THEN
    RAISE EXCEPTION 'PROBE 19 FAILED: % messages, so the daily limit can be walked around', msgs;
  END IF;

  -- The same holds once the host has confirmed.
  PERFORM public.confirm_conversation(conv_id, '11111111-1111-4111-8111-111111111111', 'confirm');
  result := public.start_or_reopen_conversation(v_plan_id, joiner, 'one more thing', true);
  SELECT count(*) INTO msgs FROM public.messages WHERE conversation_id = conv_id;
  IF result->>'status' <> 'confirmed' OR (result->>'message_written')::BOOLEAN IS NOT FALSE OR msgs <> 1 THEN
    RAISE EXCEPTION 'PROBE 19 FAILED: a confirmed thread accepted a request message: % (% messages)', result, msgs;
  END IF;
  RAISE NOTICE 'PROBE 19 PASS: an active thread is reported, not written to';
END
$$;

SELECT 'ALL PROBES PASSED' AS result;
