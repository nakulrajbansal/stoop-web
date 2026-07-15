-- ═══════════════════════════════════════════════════════════════════════════
-- WEEKLY DIGEST: opt-out column (and activation switch)
--
-- The Sunday digest email code refuses to send while this column is missing,
-- because without it there is no working unsubscribe. Running this migration
-- is what activates the digest (together with the CRON_SECRET env var in
-- Vercel; see RUNBOOK "Weekly digest").
-- Safe to run more than once. Order relative to 0003 does not matter.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS digest_opt_out_at TIMESTAMPTZ;

-- Note: digest_opt_out_at is intentionally NOT granted to the API roles
-- (see 0003). Only the server-side admin client reads and writes it.
