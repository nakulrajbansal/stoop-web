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
