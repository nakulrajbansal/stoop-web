-- ═══════════════════════════════════════════════════════════════════════════
-- LOCAL REHEARSAL BOOTSTRAP (throwaway Postgres, never production)
--
-- Supabase gives a real project three things this repo's migrations assume:
-- the API roles, the auth schema, and the realtime publication. A plain
-- postgres container has none of them, so they are stubbed here, minimally,
-- to let the migrations run exactly as written.
--
-- Usage is in docs/RUNBOOK.md under "Local migration rehearsal".
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT
);

-- The columns create_profile_for_verified_identity actually reads. A real
-- project has these on auth.users from the start; the stub above predates the
-- three-path signup release and only had what the 0001 policies needed.
--
-- GoTrue stores `phone` as digits with no leading plus, which is why the
-- function normalizes both sides before it compares them. The fixtures in
-- 06_signup_expand_probes.sql store it the same way on purpose.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone_confirmed_at TIMESTAMPTZ;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ;

-- Present so a probe can prove the function IGNORES it. This is the column the
-- user can rewrite at will through the client library, which is exactly why no
-- identity decision may be based on it.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data JSONB DEFAULT '{}'::JSONB;

-- Written by GoTrue from the provider response, one row per linked provider.
-- This is the authority for "is there really a Google identity here". The real
-- table carries more columns; these are the ones the function reads.
CREATE TABLE IF NOT EXISTS auth.identities (
  provider_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  provider TEXT NOT NULL,
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (provider, provider_id)
);

-- Enough of auth.uid() for the policies in 0001 to compile. Reads the same two
-- settings a real Supabase project does, so a probe can act as a signed-in user
-- with SET LOCAL request.jwt.claims or the older single-claim setting.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true)::JSONB ->> 'sub', '')
  )::UUID
$$;

-- ── STOCK SUPABASE PRIVILEGES ─────────────────────────────────────────────
-- A real project grants the API roles full table privileges and lets RLS do the
-- restricting, and grants EXECUTE on new functions by default. Without these,
-- a probe acting as `authenticated` gets "permission denied for table" and
-- proves nothing about production. They are also what makes the explicit
-- REVOKEs in the lifecycle migration worth testing: the default privilege
-- would otherwise hand anon and authenticated EXECUTE on those functions.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;
