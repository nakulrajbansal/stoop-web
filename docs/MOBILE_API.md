# Mobile API boundary (iOS app)

What the native app needs from this codebase, why each piece exists, and the
exact steps to deploy it. Everything here is additive: the web app's behavior,
auth, and routes are unchanged.

Companion repo: `stoop-ios` (Expo + React Native). Bundle ID `house.stoop.app`.

---

## 1. Why any backend change was needed

Every API route authenticated the caller through `@/lib/supabase/server`, which
reads the Supabase session from **browser cookies**. A native app has no cookie
jar, so without a change every mobile request would have been anonymous, which
would silently defeat block filtering on the feed (an anonymous feed request
skips `getBlockedIds`). That is a safety hole, not an inconvenience.

## 2. What was added

### `src/lib/bearer.ts`
Parses `Authorization: Bearer <token>`. Pure, unit tested, rejects anything that
is not a well-formed JWT so a malformed header falls back to cookie auth rather
than half-authenticating.

### `src/lib/supabase/route.ts` -> `getRouteAuth(req)`
The single auth entry point for API routes:

- **No bearer header** (every browser request): behaves exactly as before,
  cookie session via `@supabase/ssr`.
- **Bearer header**: builds an anon-key client carrying that token and calls
  `supabase.auth.getUser(token)`, which round-trips to Supabase Auth. A forged
  or expired token fails there. The verified token is then used for the data
  queries, so Postgres sees a real `auth.uid()` and RLS applies as that user.

Service-role credentials are never involved in authentication. Routes that need
to bypass RLS still use `@/lib/supabase/admin` **after** verifying ownership in
code, the pre-existing pattern.

Routes converted (identical logic, one auth line changed each): `plans`,
`conversations`, `messages`, `unread`, `unread/seen`, `block`, `reports`,
`account`, `avatar`, `welcome`.

### `GET /api/plans/[slug]`
The native equivalent of the `/plan/[slug]` server component: same query, same
block enforcement (404 when either party has blocked the other), plus
`hostPlanCount` and `existingConversationId`. Removed plans are already hidden
by the RLS policy on `plans`.

### `GET /api/me`
The caller's own profile plus a suspension check. Read through the admin client
because `blocked_at` is not granted to the API roles (migration 0003). Returns
`403 { code: 'account_suspended' }` for a suspended user so the app fails closed
at launch instead of discovering it one action at a time. `phone_e164` and
`notify_email` are never returned.

Every suspension response across the API now carries
`code: 'account_suspended'` alongside the existing message. Additive field, web
ignores it.

### Push notifications
- `supabase/migrations/0007_push_tokens.sql` creates `push_tokens`
  (user, Expo token, platform, installation id, app version, created/updated/
  last-used/revoked timestamps). RLS on with **no policies** and grants revoked
  from `anon`/`authenticated`: service-role only, same treatment as phone and
  email columns.
- `src/lib/push.ts` builds and sends Expo push messages.
  **Privacy rule, enforced by tests:** a notification never contains message
  text, plan text, names, emails, or phone numbers. It carries generic copy plus
  `{ kind, path }` so the app can deep link and fetch the real content over an
  authenticated connection.
  Dead tokens (Expo `DeviceNotRegistered`) are revoked automatically.
- `POST /api/push/register` and `DELETE /api/push/register` register and revoke a
  device. Re-registering an installation revokes that installation's earlier
  tokens, so a shared or reinstalled phone never receives the previous account's
  notifications.
- Events pushed: **join request** (new conversation), **reply** (only when the
  recipient has not sent a message in 15 minutes, the same gate the reply email
  already used), **confirmed**. Every send is best effort and wrapped so it can
  never break posting, messaging, or confirming. **Email behavior is unchanged.**

### Universal links
`GET /api/apple-app-site-association`, served at
`/.well-known/apple-app-site-association` through a rewrite in `next.config.js`.
A route handler (not a static file) guarantees the `application/json` content
type Apple requires. It returns 404 while `APPLE_TEAM_ID` is unset, so a wrong
association is never published. Paths opened by the app: `/plan/*` and
`/inbox/*`.

---

## 3. Environment variables

| Variable | Where | Required for | Notes |
| --- | --- | --- | --- |
| `APPLE_TEAM_ID` | Vercel + local | Universal links | Apple Developer Team ID, e.g. `A1B2C3D4E5`. Not a secret. Until set, the AASA route 404s. |
| `EXPO_ACCESS_TOKEN` | Vercel | Push, only if enabled | Needed only when the Expo project turns on push security. Leave unset otherwise. |

No new secrets. Push sends use Expo's public endpoint; APNs credentials live in
the Expo project, never in this repo.

---

## 4. Deploy order (each step is a manual gate)

1. **Merge and push** this branch to `main`. Vercel builds and deploys.
   Nothing user-visible changes yet: mobile endpoints exist but no app calls them.
2. **Run migration 0007** in the Supabase SQL editor:
   `supabase/migrations/0007_push_tokens.sql`. Safe to re-run. Until it runs,
   `POST /api/push/register` returns 500 and push is simply off; every other
   route is unaffected.
3. **Set `APPLE_TEAM_ID`** in Vercel (Production, Preview) once the Apple
   Developer account exists. Redeploy. Then verify:
   ```
   curl -i https://stoop.house/.well-known/apple-app-site-association
   ```
   Expect `200`, `content-type: application/json`, and your team id in `appIDs`.
   Apple requires no redirect, so also check that `www.stoop.house` serves it.
4. **Verify the web is unchanged** (see checklist below).
5. Only then point a TestFlight build at production.

## 5. Web regression checklist (run after deploying)

Signed in on the web, in a browser:

- [ ] `/feed` loads plans, city and category filters work
- [ ] `/plan/<slug>` loads, "Message <name>" starts a conversation
- [ ] `/inbox` lists conversations, `/inbox/<id>` sends and receives in realtime
- [ ] Accept and decline still work, confirmation email arrives
- [ ] `/post` publishes a plan and routes to the plan page
- [ ] `/profile` saves, photo upload and remove work
- [ ] Unread badge appears and clears
- [ ] Block from a conversation still hides that person from the feed
- [ ] `/report` submits with "also block" on
- [ ] Delete account works and signs you out

All of these ran through `getRouteAuth`, whose cookie branch is byte-for-byte
the previous code path.

## 6. Rollback

The mobile surface is additive. To disable it without reverting code:

- Push: revoke rows in `push_tokens` (`update push_tokens set revoked_at = now()`).
  Sends stop, email keeps working.
- Universal links: unset `APPLE_TEAM_ID` and redeploy. The AASA route 404s and
  links open in the browser again.
- Bearer auth: reverting `src/lib/supabase/route.ts` to only call the cookie
  client disables mobile auth entirely while leaving the web untouched.
