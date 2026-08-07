-- ═══════════════════════════════════════════════════════════════════════════
-- LOCAL REHEARSAL PROBES: three-path signup, the contract state
--
-- Run AFTER 20260807123000_postdeploy_profile_insert_contract.sql.
--
-- 06_signup_expand_probes.sql proved the function is right. This file proves
-- the door beside it is shut: that the browser can no longer insert a profiles
-- row at all, by policy OR by grant, and that closing it did not break the
-- server path or anything else on the table.
--
-- These act as `anon` and `authenticated` with a JWT claim set the way
-- PostgREST sets one, under the stock Supabase grants from 00_bootstrap.sql.
-- Running as the owner would prove nothing: the owner was never the problem.
--
-- Every probe raises on failure. Throwaway local database only.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ── PROBE C1: the privilege itself is gone ────────────────────────────────
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.profiles', 'INSERT') THEN
    RAISE EXCEPTION 'PROBE C1 FAILED: anon still holds INSERT on profiles';
  END IF;
  IF has_table_privilege('authenticated', 'public.profiles', 'INSERT') THEN
    RAISE EXCEPTION 'PROBE C1 FAILED: authenticated still holds INSERT on profiles';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'PROBE C1 FAILED: an INSERT policy on profiles survived';
  END IF;
  RAISE NOTICE 'PROBE C1 PASS: no INSERT grant and no INSERT policy on profiles';
END
$$;

-- ── PROBE C2: a signed-in browser cannot create a profile ─────────────────
-- The real test, not the catalog one. A grant can look revoked and a policy can
-- look dropped while some other path is still open, so this actually tries it,
-- as the role a browser holding the public anon key operates under, with its
-- own id in the claim so the old policy would have allowed it.
DO $$
DECLARE
  intruder UUID := '22220000-0000-4000-8000-00000000c001';
  city UUID;
  hood UUID;
  refused BOOLEAN := FALSE;
BEGIN
  SELECT id INTO city FROM public.cities WHERE slug = 'nyc';
  SELECT id INTO hood FROM public.neighborhoods WHERE slug = 'williamsburg' AND city_id = city;
  INSERT INTO auth.users (id, phone, phone_confirmed_at)
  VALUES (intruder, '15551231001', now()) ON CONFLICT (id) DO NOTHING;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', intruder)::TEXT, true);

  BEGIN
    INSERT INTO public.profiles (id, name, phone_e164, phone_verified_at, city_id, neighborhood_id, notify_email)
    VALUES (intruder, 'Intruder', '+15551231001', now(), city, hood, 'intruder@example.test');
  EXCEPTION WHEN insufficient_privilege THEN refused := TRUE;
  END;

  RESET ROLE;

  IF NOT refused OR EXISTS (SELECT 1 FROM public.profiles WHERE id = intruder) THEN
    RAISE EXCEPTION 'PROBE C2 FAILED: a signed-in browser still created its own profile row';
  END IF;
  RAISE NOTICE 'PROBE C2 PASS: authenticated cannot insert a profile, even its own';
END
$$;

-- ── PROBE C3: nor can an anonymous one ────────────────────────────────────
DO $$
DECLARE
  refused BOOLEAN := FALSE;
  city UUID;
BEGIN
  SELECT id INTO city FROM public.cities WHERE slug = 'nyc';

  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.profiles (id, name, phone_e164, city_id)
    VALUES ('22220000-0000-4000-8000-00000000c002', 'Anon', '+15551231002', city);
  EXCEPTION WHEN insufficient_privilege THEN refused := TRUE;
  END;
  RESET ROLE;

  IF NOT refused THEN
    RAISE EXCEPTION 'PROBE C3 FAILED: anon inserted a profile';
  END IF;
  RAISE NOTICE 'PROBE C3 PASS: anon cannot insert a profile';
END
$$;

-- ── PROBE C4: the server path still works, all three ways ─────────────────
-- The revoke must not have caught the thing it exists to protect.
DO $$
DECLARE
  phone_actor UUID := '22220000-0000-4000-8000-00000000c003';
  google_actor UUID := '22220000-0000-4000-8000-00000000c004';
  apple_actor UUID := '22220000-0000-4000-8000-00000000c005';
BEGIN
  INSERT INTO auth.users (id, phone, phone_confirmed_at)
  VALUES (phone_actor, '15551231003', now()) ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES (google_actor, 'post@gmail.example', now()) ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (provider_id, user_id, provider, identity_data)
  VALUES ('208422', google_actor, 'google', '{"email":"post@gmail.example","email_verified":true}'::JSONB)
  ON CONFLICT DO NOTHING;

  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES (apple_actor, 'q7w8e9r0t1@privaterelay.appleid.com', now()) ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.identities (provider_id, user_id, provider, identity_data)
  VALUES ('002234.efgh', apple_actor, 'apple',
          '{"email":"q7w8e9r0t1@privaterelay.appleid.com","email_verified":true}'::JSONB)
  ON CONFLICT DO NOTHING;

  PERFORM public.create_profile_for_verified_identity(
    phone_actor, 'phone', 'Post Contract', 'nyc', 'williamsburg', NULL, 'post@example.test', NULL);
  PERFORM public.create_profile_for_verified_identity(
    google_actor, 'google', 'Google After', 'nyc', 'williamsburg', NULL, NULL, NULL);
  PERFORM public.create_profile_for_verified_identity(
    apple_actor, 'apple', 'Apple After', 'austin', 'clarksville', NULL, NULL, NULL);

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = phone_actor AND phone_e164 = '+15551231003')
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = google_actor AND phone_e164 IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = apple_actor AND phone_e164 IS NULL) THEN
    RAISE EXCEPTION 'PROBE C4 FAILED: the service path is broken after the contract migration';
  END IF;
  RAISE NOTICE 'PROBE C4 PASS: phone, Google and Apple all still create accounts through the function';
END
$$;

-- ── PROBE C5: everything else on profiles is untouched ────────────────────
-- A revoke that took the reads or the edit with it would sign every member out
-- of their own profile page, which is the failure this release must not repeat.
DO $$
DECLARE
  member UUID := '22220000-0000-4000-8000-00000000c003';
  seen TEXT;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', member)::TEXT, true);

  SELECT display_name INTO seen FROM public.profiles WHERE id = member;
  IF seen IS DISTINCT FROM 'Post' THEN
    RAISE EXCEPTION 'PROBE C5 FAILED: a signed-in member can no longer read a public name (got %)', seen;
  END IF;

  UPDATE public.profiles SET about = 'still editable' WHERE id = member;

  RESET ROLE;

  IF (SELECT about FROM public.profiles WHERE id = member) <> 'still editable' THEN
    RAISE EXCEPTION 'PROBE C5 FAILED: the profile editor stopped working';
  END IF;
  RAISE NOTICE 'PROBE C5 PASS: reads and the owner edit still work';
END
$$;

-- ── PROBE C6: running it twice is not an error ────────────────────────────
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
  REVOKE INSERT ON public.profiles FROM anon, authenticated;
  RAISE NOTICE 'PROBE C6 PASS: the contract migration is safe to re-run';
END
$$;

DO $$ BEGIN RAISE NOTICE 'ALL CONTRACT-STATE SIGNUP PROBES PASSED'; END $$;
