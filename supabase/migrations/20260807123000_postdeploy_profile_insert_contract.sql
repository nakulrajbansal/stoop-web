-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT: the browser stops being able to create a profile
--
-- RUN THIS ONLY AFTER the reviewed three-path signup application is deployed
-- and serving. It breaks the previous release on purpose.
--
-- Until the new code is live, the deployed signup screen inserts its own
-- profiles row from the browser. Revoking that first does not harden anything;
-- it takes signup off the air, on the one screen where a failure costs a
-- member. The expand migration before it
-- (20260807120000_three_path_signup_expand.sql) is additive and is the one that
-- runs first, before the deploy.
--
-- After this file:
--   * anon and authenticated cannot INSERT into public.profiles at all;
--   * the only way an account is created is
--     public.create_profile_for_verified_identity, which only service_role may
--     execute, called by POST /api/profile after it has verified the session;
--   * every other privilege on profiles is untouched, so the signed-in app
--     keeps reading display_name and keeps editing its own row.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. THE LEGACY BROWSER INSERT GOES AWAY ────────────────────────────────
-- The policy from 0001. It checked that the id matched auth.uid(), which made
-- the id honest and said nothing about the phone number, the verification
-- timestamp or the notification address in the same row. All three were the
-- browser's to choose.
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;

-- The policy is only half of it. RLS narrows a privilege that has already been
-- granted; it is not the grant. Supabase hands the API roles table privileges
-- by default, and an older project may also carry a broad table-level GRANT
-- that a policy drop leaves completely intact. With RLS satisfied some other
-- way, or disabled by a future migration, that grant is still an open door.
-- So the privilege itself is removed, which is effective either way.
REVOKE INSERT ON public.profiles FROM anon, authenticated;

-- ── 2. WHAT DELIBERATELY STAYS ────────────────────────────────────────────
-- Not revoked here, and each one for a reason:
--   SELECT      the app reads display_name and the public profile columns.
--               profiles.name was already narrowed to service_role by
--               20260806090000_postdeploy_boundary_hardening.sql.
--   UPDATE      "Users update own profile" is the editor behind
--               PATCH /api/profile, and it is scoped to auth.uid() = id.
--   service_role every server path, including the creation function, runs as
--               the owner or as service_role and is unaffected by all of this.
--
-- The function itself is not touched either. Dropping and recreating it here
-- would put its definition in two files and let them drift.

-- ── 3. PROOF, NOT ASSUMPTION ──────────────────────────────────────────────
-- A revoke that quietly did nothing looks identical to a revoke that worked.
-- This fails the migration rather than reporting success on a database where
-- the privilege survived, which is exactly the case a legacy grant produces.
DO $verify$
BEGIN
  IF has_table_privilege('anon', 'public.profiles', 'INSERT')
     OR has_table_privilege('authenticated', 'public.profiles', 'INSERT') THEN
    RAISE EXCEPTION
      'an API role still holds INSERT on public.profiles after the revoke';
  END IF;

  IF to_regprocedure(
       'public.create_profile_for_verified_identity(uuid, text, text, text, text, text, text, text)'
     ) IS NULL THEN
    RAISE EXCEPTION
      'the creation function is missing: run 20260807120000_three_path_signup_expand.sql first';
  END IF;

  IF NOT has_function_privilege(
       'service_role',
       'public.create_profile_for_verified_identity(uuid, text, text, text, text, text, text, text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'service_role cannot execute the creation function, so nothing can create an account';
  END IF;

  RAISE NOTICE 'profile creation is now service-role only';
END
$verify$;
