-- ═══════════════════════════════════════════════════════════════════════════
-- POSTDEPLOY HARDENING: close the legacy write and read paths
--
-- RUN THIS ONLY AFTER the reviewed application code is deployed and serving.
--
-- Everything here breaks the PREVIOUS release on purpose. Until the new code is
-- live, the deployed app still creates conversations and messages directly, and
-- still reads profiles.name; revoking any of it earlier is an outage, not a
-- hardening. The expand migrations before it are additive and safe to run while
-- the old code is serving.
--
-- After this file:
--   * anon and authenticated can read display_name, never name;
--   * they cannot INSERT conversations or messages;
--   * they cannot UPDATE a conversation status, by grant or by trigger;
--   * every lifecycle write goes through the service-role-only functions.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. THE FULL NAME GOES AWAY ────────────────────────────────────────────
-- display_name was added and granted in the expand migration, so the deployed
-- code is already reading it by the time this runs.
REVOKE SELECT (name) ON public.profiles FROM anon, authenticated;

-- ── 2. DIRECT WRITES GO AWAY ──────────────────────────────────────────────
-- The 0001 policies let a signed-in client create a conversation, skipping plan
-- ownership, capacity, blocks and the opener, and insert into a conversation
-- that was declined or withdrawn. start_or_reopen_conversation and
-- send_conversation_message are the only paths now.
DROP POLICY IF EXISTS "Joiner starts conversation" ON public.conversations;
REVOKE INSERT ON public.conversations FROM anon, authenticated;

DROP POLICY IF EXISTS "Send to own conversations" ON public.messages;
REVOKE INSERT ON public.messages FROM anon, authenticated;

-- ── 3. ONLY STOOP MOVES A REQUEST ────────────────────────────────────────────
-- The RLS policy from 0001 lets the host UPDATE their own conversation rows,
-- and Supabase grants the API roles table privileges by default. Together that
-- was a way to write any status the CHECK constraint allows, straight from a
-- browser holding the public anon key: a host could set a withdrawn request
-- back to confirmed, reinstating somebody who deliberately left, with no email
-- and no consent. Reproduced against Postgres 16 under the stock grants.
--
-- Two locks, because either one alone can be undone:
--   1. UPDATE is revoked from the API roles entirely. Nothing in the app needs
--      it: joiners insert conversations, and every status change now goes
--      through the service role.
--   2. A BEFORE UPDATE trigger refuses any status change that is not made by
--      service_role or from inside these SECURITY DEFINER functions, which
--      survives a future `GRANT ALL ON ALL TABLES` from Supabase tooling.
REVOKE UPDATE ON public.conversations FROM anon, authenticated;

-- SECURITY INVOKER on purpose, and it matters. A SECURITY DEFINER trigger runs
-- as its own owner, so current_user would read as the owner no matter who made
-- the request and the check below would pass for everyone. As an invoker
-- function it sees the real caller, while statements issued from inside the
-- SECURITY DEFINER lifecycle functions still run as their owner and pass.
CREATE OR REPLACE FUNCTION public.guard_conversation_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  table_owner OID;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT relowner INTO table_owner FROM pg_class WHERE oid = 'public.conversations'::regclass;

  -- Inside a SECURITY DEFINER function current_user is the function owner, so
  -- the lifecycle functions pass. A client role holds neither membership.
  IF pg_has_role(current_user, table_owner, 'USAGE')
     OR (to_regrole('service_role') IS NOT NULL AND pg_has_role(current_user, 'service_role', 'USAGE'))
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'conversation status is set by Stoop, not by a client'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_conversation_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_conversation_status ON public.conversations;
CREATE TRIGGER guard_conversation_status
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_status();
