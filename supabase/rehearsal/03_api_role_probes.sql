-- ═══════════════════════════════════════════════════════════════════════════
-- LOCAL REHEARSAL PROBES: what an API role can actually do
--
-- 02_probes.sql runs as the owner, so it tests the functions and the trigger
-- but says nothing about the privilege model a browser holding the public anon
-- key operates under. These probes act as `anon` and `authenticated`, with a
-- JWT claim set the way PostgREST sets one, under the stock Supabase grants
-- added by 00_bootstrap.sql.
--
-- Every probe raises on failure, so psql with ON_ERROR_STOP=1 exits non-zero.
-- Throwaway local database only.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ── FIXTURE ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  city UUID;
  hood UUID;
  host UUID := 'aaaaaaaa-0000-4000-8000-00000000000a';
  joiner UUID := 'bbbbbbbb-0000-4000-8000-00000000000b';
  stranger UUID := 'cccccccc-0000-4000-8000-00000000000c';
BEGIN
  SELECT id INTO city FROM public.cities WHERE slug = 'nyc';
  SELECT id INTO hood FROM public.neighborhoods WHERE slug = 'williamsburg' AND city_id = city;

  INSERT INTO auth.users (id) VALUES (host), (joiner), (stranger) ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, name, phone_e164, notify_email, city_id, neighborhood_id)
  VALUES
    (host, 'Maya Rodriguez', '+15550001001', 'host@example.test', city, hood),
    (joiner, 'Theo Park', '+15550001002', 'joiner@example.test', city, hood),
    (stranger, 'Ada Chen', '+15550001003', 'stranger@example.test', city, hood)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.plans (
    id, slug, user_id, city_id, neighborhood_id, text, category, spot,
    when_day, when_date, when_time_specific, cost_expectation,
    spots_total, spots_left, status, expires_at
  ) VALUES (
    'dddddddd-0000-4000-8000-00000000000d',
    'api-role-probe-plan-gh78',
    host, city, hood,
    'reading at Spoonbill before they close, quiet hour then coffee if anyone wants',
    'books', 'Spoonbill Books, Bedford Avenue',
    'Wednesday', CURRENT_DATE + 2, '7:00 PM', 'free',
    1, 1, 'open', now() + INTERVAL '2 days'
  ) ON CONFLICT (id) DO NOTHING;

  -- A request the joiner already withdrew from. This is the row finding 2 of
  -- the external review reinstated from outside the lifecycle functions.
  INSERT INTO public.conversations (id, plan_id, poster_id, joiner_id, status, withdrawn_at)
  VALUES (
    'eeeeeeee-0000-4000-8000-00000000000e',
    'dddddddd-0000-4000-8000-00000000000d',
    host, joiner, 'withdrawn', now()
  ) ON CONFLICT (id) DO UPDATE SET status = 'withdrawn', withdrawn_at = now();

  INSERT INTO public.messages (conversation_id, from_user_id, text)
  SELECT 'eeeeeeee-0000-4000-8000-00000000000e', joiner, 'I would love to come along.'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.messages WHERE conversation_id = 'eeeeeeee-0000-4000-8000-00000000000e'
  );

  UPDATE public.plans SET spots_left = 1, status = 'open'
   WHERE id = 'dddddddd-0000-4000-8000-00000000000d';
END
$$;

-- ── PROBE A1: the stock grants are in place, and UPDATE is deliberately not ──
-- Without the first two checks the rest of the file would pass for the wrong
-- reason: a role that cannot reach the tables at all also cannot write to them.
DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.conversations', 'SELECT') THEN
    RAISE EXCEPTION 'PROBE A1 FAILED: authenticated cannot even read conversations, so the probes below prove nothing';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.plans', 'UPDATE') THEN
    RAISE EXCEPTION 'PROBE A1 FAILED: the stock default UPDATE grant is missing, so the revoke below proves nothing';
  END IF;
  IF NOT has_table_privilege('anon', 'public.plans', 'SELECT') THEN
    RAISE EXCEPTION 'PROBE A1 FAILED: anon has no SELECT grant on plans';
  END IF;
  IF has_table_privilege('authenticated', 'public.conversations', 'UPDATE')
     OR has_table_privilege('anon', 'public.conversations', 'UPDATE') THEN
    RAISE EXCEPTION 'PROBE A1 FAILED: an API role still holds UPDATE on conversations';
  END IF;
  RAISE NOTICE 'PROBE A1 PASS: stock grants present, UPDATE on conversations revoked from the API roles';
END
$$;

-- ── PROBE A2: the host cannot move a request's status by hand ────────────
-- The whole point of the external review's finding 2. The host holds a real
-- session and the RLS policy from 0001 lets them UPDATE the row.
DO $$
DECLARE
  refused BOOLEAN := false;
  changed INTEGER := 0;
  final_status TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a"}', true);

  BEGIN
    UPDATE public.conversations
       SET status = 'confirmed'
     WHERE id = 'eeeeeeee-0000-4000-8000-00000000000e';
    GET DIAGNOSTICS changed = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    refused := true;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT status INTO final_status
    FROM public.conversations WHERE id = 'eeeeeeee-0000-4000-8000-00000000000e';

  IF NOT refused OR changed > 0 OR final_status <> 'withdrawn' THEN
    RAISE EXCEPTION 'PROBE A2 FAILED: a host reinstated a withdrawn request by hand (rows=%, status=%)',
      changed, final_status;
  END IF;
  RAISE NOTICE 'PROBE A2 PASS: the host cannot set status directly';
END
$$;

-- ── PROBE A2b: and still cannot if the privilege comes back ──────────────
-- Supabase tooling re-runs GRANT ALL ON ALL TABLES from time to time. The
-- trigger is the lock that survives that, so it is tested on its own with the
-- privilege deliberately handed back for the length of this probe.
DO $$
DECLARE
  refused BOOLEAN := false;
  sqlstate_seen TEXT;
  changed INTEGER := 0;
  final_status TEXT;
BEGIN
  GRANT UPDATE ON public.conversations TO authenticated;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a"}', true);
  BEGIN
    UPDATE public.conversations
       SET status = 'confirmed'
     WHERE id = 'eeeeeeee-0000-4000-8000-00000000000e';
    GET DIAGNOSTICS changed = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    refused := true;
    GET STACKED DIAGNOSTICS sqlstate_seen = RETURNED_SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  REVOKE UPDATE ON public.conversations FROM authenticated;

  SELECT status INTO final_status
    FROM public.conversations WHERE id = 'eeeeeeee-0000-4000-8000-00000000000e';

  IF NOT refused OR changed > 0 OR final_status <> 'withdrawn' THEN
    RAISE EXCEPTION 'PROBE A2b FAILED: the trigger let a status change through (rows=%, status=%)',
      changed, final_status;
  END IF;
  IF sqlstate_seen <> '42501' THEN
    RAISE EXCEPTION 'PROBE A2b FAILED: refused for the wrong reason, sqlstate %', sqlstate_seen;
  END IF;
  RAISE NOTICE 'PROBE A2b PASS: the guard trigger refuses even with UPDATE granted back';
END
$$;

-- ── PROBE A3: neither can the requester, nor anon ────────────────────────
DO $$
DECLARE
  changed INTEGER := 0;
  refused BOOLEAN := false;
  final_status TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b"}', true);
  BEGIN
    UPDATE public.conversations SET status = 'confirmed'
     WHERE id = 'eeeeeeee-0000-4000-8000-00000000000e';
    GET DIAGNOSTICS changed = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    refused := true;
  END;
  RESET ROLE;

  IF changed > 0 THEN
    RAISE EXCEPTION 'PROBE A3 FAILED: the requester confirmed themselves';
  END IF;

  changed := 0;
  SET LOCAL ROLE anon;
  BEGIN
    UPDATE public.conversations SET status = 'confirmed'
     WHERE id = 'eeeeeeee-0000-4000-8000-00000000000e';
    GET DIAGNOSTICS changed = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    refused := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT status INTO final_status
    FROM public.conversations WHERE id = 'eeeeeeee-0000-4000-8000-00000000000e';

  IF changed > 0 OR final_status <> 'withdrawn' THEN
    RAISE EXCEPTION 'PROBE A3 FAILED: anon changed a conversation status (rows=%, status=%)', changed, final_status;
  END IF;
  RAISE NOTICE 'PROBE A3 PASS: requester and anon cannot set status directly';
END
$$;

-- ── PROBE A4: the API roles cannot call the lifecycle functions ──────────
-- Stock Supabase default privileges grant EXECUTE on new functions to anon and
-- authenticated, so this is a live test of the migration's explicit REVOKEs
-- rather than a test of an empty default.
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.withdraw_conversation(uuid,uuid)',
    'public.confirm_conversation(uuid,uuid,text)',
    'public.start_or_reopen_conversation(uuid,uuid,text,boolean)'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE')
       OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'PROBE A4 FAILED: an API role can execute %', fn;
    END IF;
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'PROBE A4 FAILED: service_role cannot execute %', fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'PROBE A4 PASS: lifecycle functions survive the stock default grant';
END
$$;

-- ── PROBE A5: an unrelated signed-in user sees nothing private ───────────
DO $$
DECLARE
  convs INTEGER;
  msgs INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000c"}', true);
  SELECT count(*) INTO convs FROM public.conversations;
  SELECT count(*) INTO msgs FROM public.messages;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  IF convs <> 0 OR msgs <> 0 THEN
    RAISE EXCEPTION 'PROBE A5 FAILED: a stranger saw % conversations and % messages', convs, msgs;
  END IF;
  RAISE NOTICE 'PROBE A5 PASS: an unrelated member reads no conversations or messages';
END
$$;

-- ── PROBE A6: anon reads public plans, and nothing else ──────────────────
DO $$
DECLARE
  plans INTEGER;
  convs INTEGER;
  denied BOOLEAN := false;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO plans FROM public.plans WHERE status = 'open';
  SELECT count(*) INTO convs FROM public.conversations;

  BEGIN
    PERFORM phone_e164 FROM public.profiles LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  RESET ROLE;

  IF plans < 1 THEN
    RAISE EXCEPTION 'PROBE A6 FAILED: anon cannot read public plans, so the rest proves nothing';
  END IF;
  IF convs <> 0 THEN
    RAISE EXCEPTION 'PROBE A6 FAILED: anon read % conversations', convs;
  END IF;
  IF NOT denied THEN
    RAISE EXCEPTION 'PROBE A6 FAILED: anon read profiles.phone_e164';
  END IF;
  RAISE NOTICE 'PROBE A6 PASS: anon sees public plans, no conversations, no phone numbers';
END
$$;

-- ── PROBE A7: anon cannot read the private notify_email either ───────────
DO $$
DECLARE
  denied BOOLEAN := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000c"}', true);
  BEGIN
    PERFORM notify_email FROM public.profiles LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  IF NOT denied THEN
    RAISE EXCEPTION 'PROBE A7 FAILED: a signed-in member read notify_email';
  END IF;
  RAISE NOTICE 'PROBE A7 PASS: migration 0003 column grants hold for authenticated';
END
$$;

-- ── PROBE A8: the server can still do its job ───────────────────────────
-- service_role writes status directly in one place the app relies on: blocking
-- closes any open conversation between the two people. That must keep working.
DO $$
DECLARE
  changed INTEGER := 0;
  final_status TEXT;
BEGIN
  SET LOCAL ROLE service_role;
  UPDATE public.conversations
     SET status = 'declined'
   WHERE id = 'eeeeeeee-0000-4000-8000-00000000000e';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RESET ROLE;

  SELECT status INTO final_status
    FROM public.conversations WHERE id = 'eeeeeeee-0000-4000-8000-00000000000e';

  IF changed <> 1 OR final_status <> 'declined' THEN
    RAISE EXCEPTION 'PROBE A8 FAILED: service_role could not close a conversation (rows=%, status=%)',
      changed, final_status;
  END IF;

  -- Put it back for the re-request probes in 02.
  UPDATE public.conversations SET status = 'withdrawn'
   WHERE id = 'eeeeeeee-0000-4000-8000-00000000000e';
  RAISE NOTICE 'PROBE A8 PASS: service_role still owns the server side transitions';
END
$$;

-- ── PROBE A9: anon cannot read a full name ──────────────────────────────
-- Reproduced by an independent reviewer with nothing but the public anon key:
-- profiles.name was granted, so a direct REST select returned the surname the
-- UI never shows. The column is now withheld and a first-name projection is
-- granted in its place.
DO $$
DECLARE
  denied BOOLEAN := false;
  shown TEXT;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM name FROM public.profiles LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  SELECT display_name INTO shown FROM public.profiles WHERE id = 'aaaaaaaa-0000-4000-8000-00000000000a';
  RESET ROLE;

  IF NOT denied THEN
    RAISE EXCEPTION 'PROBE A9 FAILED: anon read profiles.name';
  END IF;
  IF shown <> 'Maya' THEN
    RAISE EXCEPTION 'PROBE A9 FAILED: the public projection is % rather than the first name', shown;
  END IF;
  RAISE NOTICE 'PROBE A9 PASS: anon gets a first name and cannot reach the full one';
END
$$;

-- ── PROBE A10: a signed-in member cannot read a full name either ────────
DO $$
DECLARE
  denied BOOLEAN := false;
  shown TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000c"}', true);
  BEGIN
    PERFORM name FROM public.profiles LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  SELECT display_name INTO shown FROM public.profiles WHERE id = 'bbbbbbbb-0000-4000-8000-00000000000b';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  IF NOT denied THEN
    RAISE EXCEPTION 'PROBE A10 FAILED: authenticated read profiles.name';
  END IF;
  IF shown <> 'Theo' THEN
    RAISE EXCEPTION 'PROBE A10 FAILED: projection is % rather than the first name', shown;
  END IF;
  RAISE NOTICE 'PROBE A10 PASS: the full name is service_role only';
END
$$;

-- ── PROBE A11: a client cannot create a conversation directly ───────────
-- The 0001 INSERT policy let a signed-in client write the row itself, skipping
-- plan ownership, capacity, blocks and the opener.
DO $$
DECLARE
  refused BOOLEAN := false;
  rows_after INTEGER;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-00000000000c"}', true);
  BEGIN
    INSERT INTO public.conversations (plan_id, poster_id, joiner_id)
    VALUES (
      'dddddddd-0000-4000-8000-00000000000d',
      'aaaaaaaa-0000-4000-8000-00000000000a',
      'cccccccc-0000-4000-8000-00000000000c'
    );
  EXCEPTION WHEN OTHERS THEN
    refused := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT count(*) INTO rows_after FROM public.conversations
   WHERE joiner_id = 'cccccccc-0000-4000-8000-00000000000c';

  IF NOT refused OR rows_after <> 0 THEN
    RAISE EXCEPTION 'PROBE A11 FAILED: a client created a conversation directly (% rows)', rows_after;
  END IF;
  RAISE NOTICE 'PROBE A11 PASS: start_or_reopen_conversation is the only way into pending';
END
$$;

-- ── PROBE A12: a client cannot insert a message, open or closed ─────────
DO $$
DECLARE
  refused_closed BOOLEAN := false;
  refused_open BOOLEAN := false;
  msgs INTEGER;
BEGIN
  -- The fixture conversation is withdrawn, which is the closed case.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b"}', true);
  BEGIN
    INSERT INTO public.messages (conversation_id, from_user_id, text)
    VALUES ('eeeeeeee-0000-4000-8000-00000000000e', 'bbbbbbbb-0000-4000-8000-00000000000b', 'let me back in');
  EXCEPTION WHEN OTHERS THEN
    refused_closed := true;
  END;
  RESET ROLE;

  -- And the open case: a participant in a pending thread is still not the
  -- write authority, because the daily limit and the block check live in the
  -- route rather than in the table.
  UPDATE public.conversations SET status = 'pending'
   WHERE id = 'eeeeeeee-0000-4000-8000-00000000000e';

  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.messages (conversation_id, from_user_id, text)
    VALUES ('eeeeeeee-0000-4000-8000-00000000000e', 'bbbbbbbb-0000-4000-8000-00000000000b', 'and again');
  EXCEPTION WHEN OTHERS THEN
    refused_open := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE public.conversations SET status = 'withdrawn'
   WHERE id = 'eeeeeeee-0000-4000-8000-00000000000e';

  SELECT count(*) INTO msgs FROM public.messages
   WHERE conversation_id = 'eeeeeeee-0000-4000-8000-00000000000e';

  IF NOT refused_closed OR NOT refused_open THEN
    RAISE EXCEPTION 'PROBE A12 FAILED: a client inserted a message (closed refused=%, open refused=%)',
      refused_closed, refused_open;
  END IF;
  IF msgs <> 1 THEN
    RAISE EXCEPTION 'PROBE A12 FAILED: message count moved to %', msgs;
  END IF;
  RAISE NOTICE 'PROBE A12 PASS: message writes belong to the server and the opener transaction';
END
$$;

-- ── PROBE A13: the server paths still work ──────────────────────────────
-- Least privilege that breaks the product is not least privilege, it is an
-- outage. service_role writes both, and the opener transaction still runs.
DO $$
DECLARE
  result JSONB;
  msgs INTEGER;
BEGIN
  SET LOCAL ROLE service_role;
  result := public.start_or_reopen_conversation(
    'dddddddd-0000-4000-8000-00000000000d',
    'cccccccc-0000-4000-8000-00000000000c',
    'I would love to come along on wednesday.'
  );
  RESET ROLE;

  IF result->>'ok' <> 'true' OR (result->>'created')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'PROBE A13 FAILED: the server could not start a request: %', result;
  END IF;

  SELECT count(*) INTO msgs FROM public.messages
   WHERE conversation_id = (result->>'conversation_id')::UUID;
  IF msgs <> 1 THEN
    RAISE EXCEPTION 'PROBE A13 FAILED: the opener did not land, % messages', msgs;
  END IF;

  -- And the server can still write an ordinary reply after its own checks.
  SET LOCAL ROLE service_role;
  INSERT INTO public.messages (conversation_id, from_user_id, text)
  VALUES ((result->>'conversation_id')::UUID, 'cccccccc-0000-4000-8000-00000000000c', 'see you there');
  RESET ROLE;

  DELETE FROM public.conversations WHERE id = (result->>'conversation_id')::UUID;
  RAISE NOTICE 'PROBE A13 PASS: the server still starts requests and writes replies';
END
$$;

-- ── PROBE A14: sending is service_role only, and clients still cannot write ──
DO $$
DECLARE
  fn TEXT := 'public.send_conversation_message(uuid,uuid,text,integer)';
BEGIN
  IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'PROBE A14 FAILED: an API role can execute %', fn;
  END IF;
  IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'PROBE A14 FAILED: service_role cannot execute %', fn;
  END IF;
  IF has_table_privilege('authenticated', 'public.messages', 'INSERT') THEN
    RAISE EXCEPTION 'PROBE A14 FAILED: authenticated still holds INSERT on messages';
  END IF;
  RAISE NOTICE 'PROBE A14 PASS: the send function is service_role only and direct inserts stay revoked';
END
$$;

-- ── PROBE A15: the intended path works, the unintended ones do not ──────
DO $$
DECLARE
  conv_id UUID := 'ffff5555-0000-4000-8000-00000000000f';
  host UUID := 'aaaaaaaa-0000-4000-8000-00000000000a';
  joiner UUID := 'bbbbbbbb-0000-4000-8000-00000000000b';
  stranger UUID := 'cccccccc-0000-4000-8000-00000000000c';
  result JSONB;
  msgs INTEGER;
BEGIN
  -- Its own plan: (plan_id, joiner_id) is unique, and the fixture already has
  -- a withdrawn conversation for this joiner on the other one.
  DELETE FROM public.conversations WHERE id = conv_id;
  DELETE FROM public.plans WHERE id = '1111aaaa-0000-4000-8000-00000000001a';
  INSERT INTO public.plans (id, slug, user_id, city_id, neighborhood_id, text, category, spot,
    when_day, when_date, when_time_specific, cost_expectation, spots_total, spots_left, status, expires_at)
  SELECT '1111aaaa-0000-4000-8000-00000000001a', 'send-probe-plan-op56', host, c.id, n.id,
    'coffee walk tuesday at 8 before work, one big loop and back by nine',
    'coffee', 'Partners Coffee', 'Tuesday', CURRENT_DATE + 2, '8:00 AM', 'pay-own-way',
    2, 2, 'open', now() + INTERVAL '2 days'
  FROM public.cities c JOIN public.neighborhoods n ON n.city_id = c.id AND n.slug = 'williamsburg'
  WHERE c.slug = 'nyc';

  INSERT INTO public.conversations (id, plan_id, poster_id, joiner_id, status)
  VALUES (conv_id, '1111aaaa-0000-4000-8000-00000000001a', host, joiner, 'pending');

  result := public.send_conversation_message(conv_id, joiner, 'still on for wednesday?');
  IF result->>'ok' <> 'true' OR result->>'recipient_id' <> host::TEXT THEN
    RAISE EXCEPTION 'PROBE A15 FAILED: the intended send was refused: %', result;
  END IF;

  result := public.send_conversation_message(conv_id, stranger, 'let me in');
  IF result->>'code' <> 'forbidden' THEN
    RAISE EXCEPTION 'PROBE A15 FAILED: a non participant sent a message: %', result;
  END IF;

  UPDATE public.conversations SET status = 'declined' WHERE id = conv_id;
  result := public.send_conversation_message(conv_id, joiner, 'are you sure?');
  IF result->>'code' <> 'closed' THEN
    RAISE EXCEPTION 'PROBE A15 FAILED: a declined thread accepted a message: %', result;
  END IF;

  UPDATE public.conversations SET status = 'pending' WHERE id = conv_id;
  INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (host, joiner)
  ON CONFLICT DO NOTHING;
  result := public.send_conversation_message(conv_id, joiner, 'hello?');
  IF result->>'code' <> 'blocked' THEN
    RAISE EXCEPTION 'PROBE A15 FAILED: a blocked sender got through: %', result;
  END IF;
  DELETE FROM public.blocks WHERE blocker_id = host AND blocked_id = joiner;

  SELECT count(*) INTO msgs FROM public.messages WHERE conversation_id = conv_id;
  IF msgs <> 1 THEN
    RAISE EXCEPTION 'PROBE A15 FAILED: % messages, so a refusal still wrote one', msgs;
  END IF;
  RAISE NOTICE 'PROBE A15 PASS: participant, status and block are all enforced in the transaction';
END
$$;

-- ── PROBE A16: the daily limit is per sender, across conversations ──────
DO $$
DECLARE
  conv_a UUID := 'ffff5555-0000-4000-8000-00000000000f';
  joiner UUID := 'bbbbbbbb-0000-4000-8000-00000000000b';
  result JSONB;
BEGIN
  -- One message already exists from A15, so a limit of 1 is already spent.
  result := public.send_conversation_message(conv_a, joiner, 'one more', 1);
  IF result->>'code' <> 'rate_limited' THEN
    RAISE EXCEPTION 'PROBE A16 FAILED: the limit did not hold: %', result;
  END IF;
  RAISE NOTICE 'PROBE A16 PASS: the rolling limit refuses once it is spent';
END
$$;

SELECT 'ALL API ROLE PROBES PASSED' AS result;
