-- ═══════════════════════════════════════════════════════════════════════════
-- NATIVE PUSH TOKENS (iOS app)
--
-- One row per (device install, token). The iOS app registers its Expo push
-- token after the user grants notification permission, and revokes it on sign
-- out or when Expo tells us the device is gone.
--
-- Privacy: this table holds a device identifier tied to a person, so it is
-- treated like phone_e164 and notify_email. It is NOT granted to the anon or
-- authenticated API roles (see 0003). Only the server-side service-role client
-- reads or writes it, always after verifying the caller in the route.
--
-- Safe to run more than once. Order relative to 0002-0006 does not matter.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  -- Expo push token, e.g. ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx].
  -- Never a raw APNs token: the app talks to Expo, not Apple.
  expo_push_token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  -- Stable per app install, so re-registering the same device replaces the
  -- old row instead of piling up duplicate notifications.
  installation_id TEXT NOT NULL,
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  -- Set instead of deleting, so we keep an audit trail of revocations
  -- (sign out, permission withdrawn, Expo reported DeviceNotRegistered).
  revoked_at TIMESTAMPTZ
);

-- The only read pattern: every live token for one person.
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_active
  ON push_tokens(user_id) WHERE revoked_at IS NULL;

-- Used when a device re-registers and older rows for the same install
-- have to be revoked.
CREATE INDEX IF NOT EXISTS idx_push_tokens_installation
  ON push_tokens(installation_id);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- No policies on purpose: with RLS on and no policy, anon and authenticated
-- can do nothing at all. The service-role client bypasses RLS and is the only
-- way in. Belt and braces, revoke the table grants too.
REVOKE ALL ON public.push_tokens FROM anon, authenticated;
