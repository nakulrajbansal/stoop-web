-- ═══════════════════════════════════════════════════════════════════════════
-- EXPAND: an account can exist without a phone number
--
-- Three independent ways in: Continue with Google, Continue with Apple, or the
-- existing phone verification. A Google or Apple member is never asked for a
-- number, which means profiles.phone_e164 can no longer be NOT NULL, and the
-- row can no longer be written by the browser.
--
-- Safe to run more than once, and safe to run BEFORE the application deploy.
-- Everything here is additive: a dropped NOT NULL that the current production
-- code never relies on (it always sends a number), and a function that nothing
-- calls until the new code is live. The privilege that the old code depends on,
-- INSERT on public.profiles, is deliberately NOT touched here. That is the
-- contract migration's job and it runs after the deploy.
--
-- Run order: this file, then deploy, then
-- 20260807123000_postdeploy_profile_insert_contract.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. THE PHONE NUMBER BECOMES OPTIONAL ──────────────────────────────────
ALTER TABLE public.profiles
  ALTER COLUMN phone_e164 DROP NOT NULL;

COMMENT ON COLUMN public.profiles.phone_e164 IS
  'The verified mobile number, or NULL for a Google or Apple account. Written only by create_profile_for_verified_identity, from auth.users.phone.';

-- Uniqueness has to survive, and only for real numbers. Postgres treats NULLs
-- as distinct in a unique index, so the original constraint from 0001 already
-- does exactly the right thing the moment the NOT NULL is gone: any number of
-- social accounts hold NULL, and two people still cannot claim one number.
--
-- So this does not drop and rebuild anything. It asserts. A project that
-- drifted (a restored dump, a hand-edited staging database) and lost the index
-- would otherwise silently start accepting duplicate numbers the day the NOT
-- NULL came off, and nothing would notice until two accounts shared a mobile.
DO $unique$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
     WHERE i.indrelid = 'public.profiles'::regclass
       AND i.indisunique
       AND i.indnatts = 1
       AND a.attname = 'phone_e164'
  ) THEN
    RAISE NOTICE 'no UNIQUE index on profiles.phone_e164, creating one';
    CREATE UNIQUE INDEX profiles_phone_e164_unique ON public.profiles (phone_e164);
  END IF;
END
$unique$;

-- ── 2. THE ONLY WAY A PROFILE GETS CREATED ────────────────────────────────
-- Until now the browser inserted its own row: it chose the id, the phone
-- number, the timestamp claiming that number was verified, and the address
-- every notification would go to. An RLS policy pinned the id to auth.uid(),
-- which made the id honest and nothing else. The rest was taken on trust.
--
-- That was survivable while a verified phone was the only door. It stops being
-- survivable with a Google session, because there is no verified number in the
-- row to anchor anything to, and "which provider is this" would become a string
-- the client sends about itself.
--
-- So the client asserts nothing. This function is handed an actor id by the
-- server route (from getUser(), never from a request body) and then goes and
-- asks auth.users and auth.identities what actually happened. It reads
-- identity_data, which GoTrue writes from the provider response, and it never
-- reads user_metadata, which the user can PATCH at will.
--
-- Three accepted paths and nothing else:
--   phone   a confirmed auth.users.phone; the number and the verified time are
--           both taken from auth, and the typed notification email is kept
--           because there is no other source for it;
--   google  an auth.identities row for this actor with provider = 'google' and
--           an available provider email; no phone is stored at all;
--   apple   the same, and an Apple private relay address is a real address.
--
-- Anything else (email and password, an unknown provider, an unconfirmed
-- number, a number that is not the one auth confirmed) is refused with 42501.
-- Bad input the caller could fix is refused with 22023. Neither refusal repeats
-- anything back to whoever provoked it.
CREATE OR REPLACE FUNCTION public.create_profile_for_verified_identity(
  p_actor UUID,
  p_provider TEXT,
  p_name TEXT,
  p_city_slug TEXT,
  p_neighborhood_slug TEXT,
  p_about TEXT DEFAULT NULL,
  p_notify_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  -- The same separator class as the generated display_name column in
  -- 20260805211500_conversation_withdrawal.sql and as normalizeFullName in
  -- src/lib/profile-identity.ts. A name joined by a pasted no-break space has
  -- to be stored the way the public projection expects to split it.
  SEPARATORS CONSTANT TEXT := '[ \t\n\r\f\v\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]+';
  EMAIL_SHAPE CONSTANT TEXT := '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';

  auth_phone TEXT;
  auth_phone_confirmed TIMESTAMPTZ;
  auth_email TEXT;
  auth_email_confirmed TIMESTAMPTZ;
  identity_says_verified BOOLEAN;

  stored_phone TEXT;
  stored_verified TIMESTAMPTZ;
  stored_email TEXT;

  clean_name TEXT;
  clean_about TEXT;
  clean_initials TEXT;
  city UUID;
  hood UUID;
  row_out public.profiles%ROWTYPE;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'no verified actor' USING ERRCODE = '42501';
  END IF;

  -- ── WHO AUTH SAYS THIS IS ───────────────────────────────────────────────
  SELECT u.phone, u.phone_confirmed_at, u.email, u.email_confirmed_at
    INTO auth_phone, auth_phone_confirmed, auth_email, auth_email_confirmed
    FROM auth.users u
   WHERE u.id = p_actor;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no verified actor' USING ERRCODE = '42501';
  END IF;

  IF p_provider = 'phone' THEN
    IF auth_phone IS NULL OR btrim(auth_phone) = '' OR auth_phone_confirmed IS NULL THEN
      RAISE EXCEPTION 'phone identity is not confirmed' USING ERRCODE = '42501';
    END IF;

    -- GoTrue stores the number without a leading plus. Both sides are reduced
    -- to digits and given one back, so the column keeps the E.164 shape the
    -- rest of the app reads and a comparison cannot fail on punctuation.
    stored_phone := '+' || regexp_replace(auth_phone, '[^0-9]', '', 'g');
    stored_verified := auth_phone_confirmed;

    -- The caller may say which number it thinks it verified. It is not how the
    -- number is chosen; it is a second chance to notice that a session and a
    -- form have come apart.
    IF p_phone IS NOT NULL
       AND '+' || regexp_replace(p_phone, '[^0-9]', '', 'g') IS DISTINCT FROM stored_phone THEN
      RAISE EXCEPTION 'phone does not match the confirmed identity' USING ERRCODE = '42501';
    END IF;

    -- A phone signup has no provider address, so the typed one is the only
    -- source there is. It is bounded here as well as in the route.
    stored_email := lower(btrim(COALESCE(p_notify_email, '')));
    IF stored_email !~ EMAIL_SHAPE OR length(stored_email) > 254 THEN
      RAISE EXCEPTION 'a notification email is required' USING ERRCODE = '22023';
    END IF;

  ELSIF p_provider IN ('google', 'apple') THEN
    SELECT COALESCE(lower(i.identity_data ->> 'email_verified') = 'true', false)
      INTO identity_says_verified
      FROM auth.identities i
     WHERE i.user_id = p_actor
       AND i.provider = p_provider
     LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'no verified identity for that provider' USING ERRCODE = '42501';
    END IF;

    IF auth_email IS NULL OR btrim(auth_email) = '' THEN
      RAISE EXCEPTION 'provider supplied no address' USING ERRCODE = '42501';
    END IF;

    IF auth_email_confirmed IS NULL AND identity_says_verified IS NOT TRUE THEN
      RAISE EXCEPTION 'provider address is not confirmed' USING ERRCODE = '42501';
    END IF;

    -- No number at all. This is the whole point of the release.
    stored_phone := NULL;
    stored_verified := NULL;

    -- The provider owns this address. An Apple private relay
    -- (...@privaterelay.appleid.com) is a real one and is kept as given.
    stored_email := lower(btrim(auth_email));

    -- The route does not forward a social caller's email at all, so reaching
    -- here with one means something upstream changed. Refused rather than
    -- ignored: silently overwriting it would hide the change.
    IF p_notify_email IS NOT NULL
       AND lower(btrim(p_notify_email)) IS DISTINCT FROM stored_email THEN
      RAISE EXCEPTION 'the provider sets the notification address' USING ERRCODE = '42501';
    END IF;

  ELSE
    RAISE EXCEPTION 'unsupported identity path' USING ERRCODE = '42501';
  END IF;

  -- ── ALREADY A MEMBER ────────────────────────────────────────────────────
  -- A double submit is a double submit, not a request to rewrite an account.
  -- The existing row is returned untouched and the caller is told it created
  -- nothing, which is how exactly one welcome email gets sent. There is
  -- deliberately no UPDATE anywhere in this function: /api/profile PATCH is the
  -- edit path and it has its own rules.
  SELECT * INTO row_out FROM public.profiles WHERE id = p_actor;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', row_out.id,
      'name', row_out.name,
      'display_name', row_out.display_name,
      'initials', row_out.initials,
      'notify_email', row_out.notify_email,
      'created', false
    );
  END IF;

  -- ── WHAT THEY TYPED ─────────────────────────────────────────────────────
  clean_name := btrim(regexp_replace(COALESCE(p_name, ''), SEPARATORS, ' ', 'g'));
  IF clean_name = '' OR length(clean_name) > 50 THEN
    RAISE EXCEPTION 'a name is required' USING ERRCODE = '22023';
  END IF;

  clean_about := NULLIF(btrim(COALESCE(p_about, '')), '');
  IF clean_about IS NOT NULL AND length(clean_about) > 140 THEN
    RAISE EXCEPTION 'that line about you is too long' USING ERRCODE = '22023';
  END IF;

  -- Slugs, never ids. An id straight off a form is an id nobody checked, and
  -- the neighborhood is resolved inside the chosen city so it cannot be pointed
  -- at a place in the other one.
  SELECT c.id INTO city FROM public.cities c WHERE c.slug = p_city_slug;
  IF city IS NULL THEN
    RAISE EXCEPTION 'pick your city and neighborhood' USING ERRCODE = '22023';
  END IF;

  SELECT n.id INTO hood
    FROM public.neighborhoods n
   WHERE n.city_id = city
     AND n.slug = p_neighborhood_slug;
  IF hood IS NULL THEN
    RAISE EXCEPTION 'pick your city and neighborhood' USING ERRCODE = '22023';
  END IF;

  SELECT left(COALESCE(string_agg(upper(left(part, 1)), '' ORDER BY ord), ''), 2)
    INTO clean_initials
    FROM unnest(string_to_array(clean_name, ' ')) WITH ORDINALITY AS t(part, ord)
   WHERE part <> '';

  -- ── THE ROW ─────────────────────────────────────────────────────────────
  -- display_name is absent because Postgres generates it from name, so signup
  -- and the profile editor cannot drift apart. is_founding_member is absent
  -- because it is earned by publishing a plan, not by signing up.
  INSERT INTO public.profiles (
    id, name, phone_e164, phone_verified_at,
    city_id, neighborhood_id, about, notify_email, initials
  ) VALUES (
    p_actor, clean_name, stored_phone, stored_verified,
    city, hood, clean_about, stored_email, clean_initials
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO row_out;

  IF row_out.id IS NULL THEN
    -- Two submits landed at once and the other one won. Same answer as above:
    -- the account exists, and this call created nothing.
    SELECT * INTO row_out FROM public.profiles WHERE id = p_actor;
    RETURN jsonb_build_object(
      'id', row_out.id,
      'name', row_out.name,
      'display_name', row_out.display_name,
      'initials', row_out.initials,
      'notify_email', row_out.notify_email,
      'created', false
    );
  END IF;

  RETURN jsonb_build_object(
    'id', row_out.id,
    'name', row_out.name,
    'display_name', row_out.display_name,
    'initials', row_out.initials,
    'notify_email', row_out.notify_email,
    'created', true
  );
END
$fn$;

COMMENT ON FUNCTION public.create_profile_for_verified_identity(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'The only way a profiles row is created. Service role only. Verifies the identity against auth.users and auth.identities; never trusts a provider, an email or a verification time supplied by the caller.';

-- Supabase grants EXECUTE on new functions to the API roles by default, so the
-- revoke is what actually closes this, and it has to name PUBLIC as well as the
-- two roles. Only the server route, holding the service key, may create an
-- account.
REVOKE ALL ON FUNCTION public.create_profile_for_verified_identity(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_profile_for_verified_identity(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;
