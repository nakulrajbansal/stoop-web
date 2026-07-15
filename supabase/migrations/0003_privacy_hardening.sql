-- ═══════════════════════════════════════════════════════════════════════════
-- PRIVACY HARDENING: lock private profile columns away from the public API
--
-- Problem: RLS on profiles allows SELECT to anon and authenticated with no
-- column restrictions, so anyone holding the public anon key could query
-- phone_e164 and notify_email for every user directly against the REST API.
-- The app never shows them, but the API would hand them over.
--
-- Fix: revoke table-level SELECT for the API roles and grant back ONLY the
-- columns the app actually displays. RLS policies still apply on top.
-- The service-role (admin) client is unaffected and keeps full access.
--
-- ORDER MATTERS: run this AFTER the code push that moved all notify_email
-- reads to the admin client (July 2026, "profile photos + privacy" commit).
-- Running it before that push would break join/reply/confirm emails.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE SELECT ON public.profiles FROM anon, authenticated;

-- Everything the app reads through the API as of the July 2026 audit:
--   Nav:                id, name, initials, avatar_bg, avatar_fg
--   /profile:           + about, city_id, neighborhood_id, is_founding_member
--   /post:              city_id, neighborhood_id
--   plan feeds/detail:  id, name, initials, avatar_bg, avatar_fg, about,
--                       is_founding_member
--   conversations/chat: id, name, initials, avatar_bg, avatar_fg
-- NOT granted (admin client only): phone_e164, phone_verified_at,
--   notify_email, blocked_at, warned_at
GRANT SELECT (
  id,
  name,
  city_id,
  neighborhood_id,
  about,
  avatar_bg,
  avatar_fg,
  initials,
  is_founding_member,
  created_at
) ON public.profiles TO anon, authenticated;
