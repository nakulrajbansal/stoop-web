-- ═══════════════════════════════════════════════════════════════════════════
-- LOCAL REHEARSAL PROBES: three-path signup, the expand state
--
-- Run AFTER 20260807120000_three_path_signup_expand.sql and BEFORE
-- 20260807123000_postdeploy_profile_insert_contract.sql.
--
-- Two things are being proved at once, and they pull in opposite directions.
--
--   1. The new function works, and refuses everything it is supposed to
--      refuse. Every rejection listed in the release brief has a probe here.
--   2. The PREVIOUSLY DEPLOYED code still works. That is the whole reason the
--      expand file is separate: it runs before the deploy, so while it is in
--      and the new code is not, the old browser insert has to keep going. If
--      probe E9 ever fails, the two migrations have been merged into one and
--      running them will take signup off the air.
--
-- Every probe raises on failure, so psql with ON_ERROR_STOP=1 exits non-zero.
-- Throwaway local database only. No credentials, no network, no production.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ── FIXTURE: realistic auth.users and auth.identities rows ────────────────
DO $fixture$
DECLARE
  phone_user UUID := '11110000-0000-4000-8000-00000000a001';
  google_user UUID := '11110000-0000-4000-8000-00000000a002';
  apple_user UUID := '11110000-0000-4000-8000-00000000a003';
  password_user UUID := '11110000-0000-4000-8000-00000000a004';
  liar UUID := '11110000-0000-4000-8000-00000000a005';
  unconfirmed UUID := '11110000-0000-4000-8000-00000000a006';
  repeat_user UUID := '11110000-0000-4000-8000-00000000a007';
  second_social UUID := '11110000-0000-4000-8000-00000000a008';
  dup_phone UUID := '11110000-0000-4000-8000-00000000a009';
BEGIN
  -- A confirmed phone signup. Note the number is stored the way GoTrue stores
  -- it: digits, no plus.
  INSERT INTO auth.users (id, phone, phone_confirmed_at)
  VALUES (phone_user, '15551230001', now() - INTERVAL '2 minutes')
  ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, phone_confirmed_at = EXCLUDED.phone_confirmed_at;

  -- Google. Email confirmed, and the identity row GoTrue writes.
  INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  VALUES (google_user, 'ada@gmail.example', now(), '{"full_name":"Ada Lovelace","given_name":"Ada"}'::JSONB)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, email_confirmed_at = EXCLUDED.email_confirmed_at;
  INSERT INTO auth.identities (provider_id, user_id, provider, identity_data)
  VALUES ('108422', google_user, 'google', '{"email":"ada@gmail.example","email_verified":true}'::JSONB)
  ON CONFLICT DO NOTHING;

  -- Apple, first authorization, private relay on and no name shared.
  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES (apple_user, 'zx9q2h4k7t@privaterelay.appleid.com', now())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, email_confirmed_at = EXCLUDED.email_confirmed_at;
  INSERT INTO auth.identities (provider_id, user_id, provider, identity_data)
  VALUES ('001234.abcd', apple_user, 'apple',
          '{"email":"zx9q2h4k7t@privaterelay.appleid.com","email_verified":true}'::JSONB)
  ON CONFLICT DO NOTHING;

  -- Email and password. Stoop does not offer this, and an identity that exists
  -- in auth must not be able to walk in through a door we never opened.
  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES (password_user, 'someone@example.test', now())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (provider_id, user_id, provider, identity_data)
  VALUES (password_user::TEXT, password_user, 'email', '{"email":"someone@example.test"}'::JSONB)
  ON CONFLICT DO NOTHING;

  -- Claims to be Google in the one place the user can write, and has no
  -- identity row at all. This is the attack the function exists to refuse.
  INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  VALUES (liar, 'attacker@example.test', now(),
          '{"provider":"google","providers":["google"],"iss":"https://accounts.google.com"}'::JSONB)
  ON CONFLICT (id) DO NOTHING;

  -- Started phone verification and never finished it.
  INSERT INTO auth.users (id, phone, phone_confirmed_at)
  VALUES (unconfirmed, '15551230006', NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users (id, phone, phone_confirmed_at)
  VALUES (repeat_user, '15551230007', now())
  ON CONFLICT (id) DO NOTHING;

  -- A second social account, to prove two NULL phone numbers can coexist.
  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES (second_social, 'grace@gmail.example', now())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (provider_id, user_id, provider, identity_data)
  VALUES ('108423', second_social, 'google', '{"email":"grace@gmail.example","email_verified":true}'::JSONB)
  ON CONFLICT DO NOTHING;

  -- Confirmed on a number somebody already holds.
  INSERT INTO auth.users (id, phone, phone_confirmed_at)
  VALUES (dup_phone, '15551230001', now())
  ON CONFLICT (id) DO NOTHING;
END
$fixture$;

-- ── PROBE E0: the probes below can prove something ────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.create_profile_for_verified_identity(uuid, text, text, text, text, text, text, text)') IS NULL THEN
    RAISE EXCEPTION 'PROBE E0 FAILED: the expand migration has not been run';
  END IF;
  IF (SELECT attnotnull FROM pg_attribute
       WHERE attrelid = 'public.profiles'::regclass AND attname = 'phone_e164') THEN
    RAISE EXCEPTION 'PROBE E0 FAILED: profiles.phone_e164 is still NOT NULL';
  END IF;
  -- Without this the whole file would pass for the wrong reason.
  IF NOT has_table_privilege('authenticated', 'public.profiles', 'INSERT') THEN
    RAISE EXCEPTION 'PROBE E0 FAILED: the legacy INSERT grant is already gone, so E9 proves nothing';
  END IF;
  RAISE NOTICE 'PROBE E0 PASS: expand state is in place';
END
$$;

-- ── PROBE E1: a verified phone signup ─────────────────────────────────────
DO $$
DECLARE
  actor UUID := '11110000-0000-4000-8000-00000000a001';
  result JSONB;
  row_after public.profiles%ROWTYPE;
BEGIN
  result := public.create_profile_for_verified_identity(
    actor, 'phone', '  Maya   Rodriguez ', 'nyc', 'williamsburg',
    'reads on stoops', 'Maya@Example.TEST', '+1 (555) 123-0001'
  );

  IF (result ->> 'created')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'PROBE E1 FAILED: created flag is not true';
  END IF;

  SELECT * INTO row_after FROM public.profiles WHERE id = actor;

  IF row_after.phone_e164 <> '+15551230001' THEN
    RAISE EXCEPTION 'PROBE E1 FAILED: stored phone is %, expected the authoritative one', row_after.phone_e164;
  END IF;
  IF row_after.phone_verified_at IS DISTINCT FROM (SELECT phone_confirmed_at FROM auth.users WHERE id = actor) THEN
    RAISE EXCEPTION 'PROBE E1 FAILED: phone_verified_at did not come from auth';
  END IF;
  IF row_after.notify_email <> 'maya@example.test' THEN
    RAISE EXCEPTION 'PROBE E1 FAILED: the typed notification email was not kept and lowercased';
  END IF;
  IF row_after.name <> 'Maya Rodriguez' OR row_after.display_name <> 'Maya' THEN
    RAISE EXCEPTION 'PROBE E1 FAILED: name normalization or the generated projection is wrong (% / %)',
      row_after.name, row_after.display_name;
  END IF;
  IF row_after.initials <> 'MR' THEN
    RAISE EXCEPTION 'PROBE E1 FAILED: initials are %', row_after.initials;
  END IF;
  IF row_after.is_founding_member IS TRUE THEN
    RAISE EXCEPTION 'PROBE E1 FAILED: signup granted the founding badge, which is earned by publishing';
  END IF;

  RAISE NOTICE 'PROBE E1 PASS: verified phone signup, values taken from auth';
END
$$;

-- ── PROBE E2: a Google signup, with no phone number anywhere ──────────────
DO $$
DECLARE
  actor UUID := '11110000-0000-4000-8000-00000000a002';
  row_after public.profiles%ROWTYPE;
BEGIN
  PERFORM public.create_profile_for_verified_identity(
    actor, 'google', 'Ada Lovelace', 'nyc', 'williamsburg', NULL, NULL, NULL
  );

  SELECT * INTO row_after FROM public.profiles WHERE id = actor;

  IF row_after.phone_e164 IS NOT NULL OR row_after.phone_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'PROBE E2 FAILED: a Google account was given phone fields';
  END IF;
  IF row_after.notify_email <> 'ada@gmail.example' THEN
    RAISE EXCEPTION 'PROBE E2 FAILED: notify_email is %, expected the provider address', row_after.notify_email;
  END IF;
  IF row_after.display_name <> 'Ada' THEN
    RAISE EXCEPTION 'PROBE E2 FAILED: public name is %', row_after.display_name;
  END IF;

  RAISE NOTICE 'PROBE E2 PASS: Google signup, no phone, provider address kept';
END
$$;

-- ── PROBE E3: an Apple signup, private relay address ──────────────────────
DO $$
DECLARE
  actor UUID := '11110000-0000-4000-8000-00000000a003';
  row_after public.profiles%ROWTYPE;
BEGIN
  -- No name from Apple after the first authorization, so the person typed one.
  PERFORM public.create_profile_for_verified_identity(
    actor, 'apple', 'Theo Park', 'austin', 'hyde-park', 'new in town', NULL, NULL
  );

  SELECT * INTO row_after FROM public.profiles WHERE id = actor;

  IF row_after.phone_e164 IS NOT NULL THEN
    RAISE EXCEPTION 'PROBE E3 FAILED: an Apple account was given a phone number';
  END IF;
  IF row_after.notify_email <> 'zx9q2h4k7t@privaterelay.appleid.com' THEN
    RAISE EXCEPTION 'PROBE E3 FAILED: the relay address was not accepted as real (%)', row_after.notify_email;
  END IF;
  IF row_after.city_id <> (SELECT id FROM public.cities WHERE slug = 'austin') THEN
    RAISE EXCEPTION 'PROBE E3 FAILED: the wrong city was resolved';
  END IF;

  RAISE NOTICE 'PROBE E3 PASS: Apple signup, private relay address kept';
END
$$;

-- ── PROBE E4: every refusal ───────────────────────────────────────────────
-- One block, because each of these is the same shape: call it, expect a
-- refusal, and fail loudly if a profile row appeared anyway.
DO $$
DECLARE
  password_user UUID := '11110000-0000-4000-8000-00000000a004';
  liar UUID := '11110000-0000-4000-8000-00000000a005';
  unconfirmed UUID := '11110000-0000-4000-8000-00000000a006';
  phone_user UUID := '11110000-0000-4000-8000-00000000a001';
  google_user UUID := '11110000-0000-4000-8000-00000000a002';
  nobody UUID := 'deadbeef-0000-4000-8000-00000000dead';
  dup_phone UUID := '11110000-0000-4000-8000-00000000a009';
  refused BOOLEAN;
BEGIN
  -- (a) An email and password identity, asked for as 'google'.
  refused := FALSE;
  BEGIN
    PERFORM public.create_profile_for_verified_identity(
      password_user, 'google', 'Someone', 'nyc', 'williamsburg', NULL, NULL, NULL);
  EXCEPTION WHEN insufficient_privilege THEN refused := TRUE;
  END;
  IF NOT refused OR EXISTS (SELECT 1 FROM public.profiles WHERE id = password_user) THEN
    RAISE EXCEPTION 'PROBE E4a FAILED: an email/password identity got in as Google';
  END IF;

  -- (b) An unknown provider.
  refused := FALSE;
  BEGIN
    PERFORM public.create_profile_for_verified_identity(
      password_user, 'facebook', 'Someone', 'nyc', 'williamsburg', NULL, NULL, NULL);
  EXCEPTION WHEN insufficient_privilege THEN refused := TRUE;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'PROBE E4b FAILED: an unknown provider was accepted';
  END IF;

  -- (c) Provider claimed in user metadata only, with no identity row. The user
  -- can write that field themselves, so this is the whole point of the design.
  refused := FALSE;
  BEGIN
    PERFORM public.create_profile_for_verified_identity(
      liar, 'google', 'Attacker', 'nyc', 'williamsburg', NULL, NULL, NULL);
  EXCEPTION WHEN insufficient_privilege THEN refused := TRUE;
  END;
  IF NOT refused OR EXISTS (SELECT 1 FROM public.profiles WHERE id = liar) THEN
    RAISE EXCEPTION 'PROBE E4c FAILED: client-written metadata was treated as a Google identity';
  END IF;

  -- (d) A phone that was never confirmed.
  refused := FALSE;
  BEGIN
    PERFORM public.create_profile_for_verified_identity(
      unconfirmed, 'phone', 'Half Way', 'nyc', 'williamsburg', NULL, 'half@example.test', NULL);
  EXCEPTION WHEN insufficient_privilege THEN refused := TRUE;
  END;
  IF NOT refused OR EXISTS (SELECT 1 FROM public.profiles WHERE id = unconfirmed) THEN
    RAISE EXCEPTION 'PROBE E4d FAILED: an unconfirmed phone was accepted';
  END IF;

  -- (e) A number that is not the one auth confirmed.
  refused := FALSE;
  BEGIN
    PERFORM public.create_profile_for_verified_identity(
      unconfirmed, 'phone', 'Half Way', 'nyc', 'williamsburg', NULL, 'half@example.test', '+15559999999');
  EXCEPTION WHEN insufficient_privilege THEN refused := TRUE;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'PROBE E4e FAILED: a mismatched phone was accepted';
  END IF;

  -- (f) An actor id that is not an auth user at all.
  refused := FALSE;
  BEGIN
    PERFORM public.create_profile_for_verified_identity(
      nobody, 'phone', 'Nobody', 'nyc', 'williamsburg', NULL, 'nobody@example.test', NULL);
  EXCEPTION WHEN insufficient_privilege THEN refused := TRUE;
  END;
  IF NOT refused OR EXISTS (SELECT 1 FROM public.profiles WHERE id = nobody) THEN
    RAISE EXCEPTION 'PROBE E4f FAILED: an arbitrary actor id was accepted';
  END IF;

  -- (g) A neighborhood that is in the other city.
  refused := FALSE;
  BEGIN
    PERFORM public.create_profile_for_verified_identity(
      dup_phone, 'phone', 'Wrong Place', 'nyc', 'hyde-park', NULL, 'wrong@example.test', NULL);
  EXCEPTION WHEN invalid_parameter_value THEN refused := TRUE;
  END;
  IF NOT refused OR EXISTS (SELECT 1 FROM public.profiles WHERE id = dup_phone) THEN
    RAISE EXCEPTION 'PROBE E4g FAILED: an Austin neighborhood was accepted for a New York city';
  END IF;

  -- (h) A social caller trying to name its own notification address.
  refused := FALSE;
  BEGIN
    PERFORM public.create_profile_for_verified_identity(
      '11110000-0000-4000-8000-00000000a008'::UUID, 'google', 'Grace Hopper',
      'nyc', 'williamsburg', NULL, 'attacker@example.test', NULL);
  EXCEPTION WHEN insufficient_privilege THEN refused := TRUE;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'PROBE E4h FAILED: a social signup chose where its mail goes';
  END IF;

  -- (i) A phone signup with no notification email, which has no other source.
  refused := FALSE;
  BEGIN
    PERFORM public.create_profile_for_verified_identity(
      dup_phone, 'phone', 'No Mail', 'nyc', 'williamsburg', NULL, 'not-an-email', NULL);
  EXCEPTION WHEN invalid_parameter_value THEN refused := TRUE;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'PROBE E4i FAILED: a malformed notification email was accepted';
  END IF;

  -- (j) A name longer than the column, and an over-long line about you.
  refused := FALSE;
  BEGIN
    PERFORM public.create_profile_for_verified_identity(
      dup_phone, 'phone', repeat('A', 51), 'nyc', 'williamsburg', NULL, 'long@example.test', NULL);
  EXCEPTION WHEN invalid_parameter_value THEN refused := TRUE;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'PROBE E4j FAILED: an over-long name was accepted';
  END IF;

  refused := FALSE;
  BEGIN
    PERFORM public.create_profile_for_verified_identity(
      dup_phone, 'phone', 'Fine Name', 'nyc', 'williamsburg', repeat('x', 141), 'long@example.test', NULL);
  EXCEPTION WHEN invalid_parameter_value THEN refused := TRUE;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'PROBE E4j FAILED: an over-long about line was accepted';
  END IF;

  RAISE NOTICE 'PROBE E4 PASS: all ten refusals hold, and none of them left a row behind';
END
$$;

-- ── PROBE E5: a double submit changes nothing ─────────────────────────────
DO $$
DECLARE
  actor UUID := '11110000-0000-4000-8000-00000000a007';
  first_result JSONB;
  second_result JSONB;
  before_row public.profiles%ROWTYPE;
  after_row public.profiles%ROWTYPE;
BEGIN
  first_result := public.create_profile_for_verified_identity(
    actor, 'phone', 'Nina Alvarez', 'nyc', 'williamsburg', 'plays chess', 'nina@example.test', NULL);
  SELECT * INTO before_row FROM public.profiles WHERE id = actor;

  -- The second submit carries completely different answers. It must be treated
  -- as a double tap, not as an edit: this is signup, not the profile editor.
  second_result := public.create_profile_for_verified_identity(
    actor, 'phone', 'Someone Else', 'austin', 'clarksville', 'rewritten', 'attacker@example.test', NULL);
  SELECT * INTO after_row FROM public.profiles WHERE id = actor;

  IF (first_result ->> 'created')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'PROBE E5 FAILED: the first call did not report creating anything';
  END IF;
  IF (second_result ->> 'created')::BOOLEAN IS NOT FALSE THEN
    RAISE EXCEPTION 'PROBE E5 FAILED: the second call claimed to create a profile, so a second welcome email would be sent';
  END IF;
  IF before_row IS DISTINCT FROM after_row THEN
    RAISE EXCEPTION 'PROBE E5 FAILED: the repeat call mutated the existing profile';
  END IF;

  RAISE NOTICE 'PROBE E5 PASS: a repeat submit returns the existing row untouched and creates nothing';
END
$$;

-- ── PROBE E6: nullable phone, still unique when present ───────────────────
DO $$
DECLARE
  second_social UUID := '11110000-0000-4000-8000-00000000a008';
  dup_phone UUID := '11110000-0000-4000-8000-00000000a009';
  social_count INT;
  refused BOOLEAN := FALSE;
BEGIN
  PERFORM public.create_profile_for_verified_identity(
    second_social, 'google', 'Grace Hopper', 'nyc', 'williamsburg', NULL, NULL, NULL);

  SELECT count(*) INTO social_count FROM public.profiles WHERE phone_e164 IS NULL;
  IF social_count < 3 THEN
    RAISE EXCEPTION 'PROBE E6 FAILED: only % profiles hold a NULL phone, so NULLs are not being treated as distinct', social_count;
  END IF;

  -- And a real number is still one person's.
  BEGIN
    PERFORM public.create_profile_for_verified_identity(
      dup_phone, 'phone', 'Copy Cat', 'nyc', 'williamsburg', NULL, 'copy@example.test', NULL);
  EXCEPTION WHEN unique_violation THEN refused := TRUE;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'PROBE E6 FAILED: two accounts were allowed to claim one phone number';
  END IF;

  RAISE NOTICE 'PROBE E6 PASS: any number of NULL phones, still one account per real number';
END
$$;

-- ── PROBE E7: the function is service-role only ───────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon',
       'public.create_profile_for_verified_identity(uuid, text, text, text, text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.create_profile_for_verified_identity(uuid, text, text, text, text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROBE E7 FAILED: an API role can execute the creation function directly';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.create_profile_for_verified_identity(uuid, text, text, text, text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROBE E7 FAILED: service_role cannot execute it, so nothing can create an account';
  END IF;
  RAISE NOTICE 'PROBE E7 PASS: service_role only';
END
$$;

-- ── PROBE E8: an API role calling it directly is refused ──────────────────
DO $$
DECLARE
  refused BOOLEAN := FALSE;
BEGIN
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.create_profile_for_verified_identity(
      '11110000-0000-4000-8000-00000000a005'::UUID, 'google', 'Attacker',
      'nyc', 'williamsburg', NULL, NULL, NULL);
  EXCEPTION WHEN insufficient_privilege THEN refused := TRUE;
  END;
  RESET ROLE;

  IF NOT refused THEN
    RAISE EXCEPTION 'PROBE E8 FAILED: authenticated executed the creation function';
  END IF;
  RAISE NOTICE 'PROBE E8 PASS: a browser role cannot call it at all';
END
$$;

-- ── PROBE E9: the CURRENTLY DEPLOYED code still works ─────────────────────
-- The reason this file runs before the contract migration. Until the new
-- application is live, the old signup screen inserts its own row, and the
-- expand migration must not have taken that away.
DO $$
DECLARE
  legacy UUID := '11110000-0000-4000-8000-00000000b001';
  city UUID;
  hood UUID;
BEGIN
  SELECT id INTO city FROM public.cities WHERE slug = 'nyc';
  SELECT id INTO hood FROM public.neighborhoods WHERE slug = 'williamsburg' AND city_id = city;
  INSERT INTO auth.users (id, phone, phone_confirmed_at)
  VALUES (legacy, '15551230099', now()) ON CONFLICT (id) DO NOTHING;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', legacy)::TEXT, true);

  INSERT INTO public.profiles (id, name, phone_e164, phone_verified_at, city_id, neighborhood_id, notify_email, initials)
  VALUES (legacy, 'Legacy Member', '+15551230099', now(), city, hood, 'legacy@example.test', 'LM');

  RESET ROLE;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = legacy) THEN
    RAISE EXCEPTION 'PROBE E9 FAILED: the previously deployed signup path no longer works';
  END IF;
  RAISE NOTICE 'PROBE E9 PASS: the expand migration is backward compatible, so it is safe to run before the deploy';
END
$$;

DO $$ BEGIN RAISE NOTICE 'ALL EXPAND-STATE SIGNUP PROBES PASSED'; END $$;
