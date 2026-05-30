# Architecture & Operations

Full technical reference for Stoop. The root `CLAUDE.md` is the quick brief; this is the depth.

## Stack
- **Next.js 15**, App Router, server components by default. TypeScript.
- **Supabase**: Postgres database, Auth (phone OTP), Realtime (used for live chat messages).
- **Twilio Verify**: the SMS provider configured inside Supabase Auth -> Providers -> Phone.
  Supabase calls Twilio to send and verify OTP codes. Twilio Lookup is used to block VOIP
  numbers at signup so people can't use Google Voice / Burner.
- **Resend**: transactional email. SDK in `src/lib/resend.ts`.
- **Vercel**: hosting + CI. Push to `main` triggers a build and deploy.
- **Cloudflare**: DNS only. All records must stay "DNS only" (gray cloud). Proxying (orange
  cloud) breaks Vercel's SSL and redirects. Do not enable it.

## Auth flow (phone-only)
1. User enters phone. Client calls Supabase `signInWithOtp({ phone })`.
2. Supabase (via Twilio Verify) texts a code.
3. User enters code. Client calls `verifyOtp({ phone, token, type: 'sms' })`.
4. If the profile row exists, go to feed. If not, show the profile-completion step
   (name, city, neighborhood, about, MANDATORY notify_email) and insert the profiles row.

## Critical gotchas (each one cost real debugging time)
1. **Supabase URL**: `NEXT_PUBLIC_SUPABASE_URL` must be the bare project URL
   (`https://<ref>.supabase.co`). NEVER append `/rest/v1`. This broke the build twice.
2. **auth.uid() is NULL in API routes**: Supabase SSR does not propagate the JWT to Postgres,
   so RLS policies keyed on `auth.uid()` evaluate as null inside route handlers. PATTERN:
   get the user with `supabase.auth.getUser()`, verify ownership in code (compare ids), then
   perform the mutation with the ADMIN client from `@/lib/supabase/admin` (service role).
   Used by: plan edit/delete, blocks, account deletion. Do not depend on auth.uid() in routes.
3. **Build-error suppression**: `next.config.js` sets `typescript.ignoreBuildErrors: true` and
   `eslint.ignoreDuringBuilds: true`. Type/lint errors will NOT fail the build. Still write
   correct types. Supabase's generated types are weak and sometimes infer `never`; use a
   narrow `as any` cast only where the inference genuinely fails, not as a habit.
4. **serverExternalPackages: ['twilio']** is set in next.config.js. Keep it.
5. **Date/timezone**: NEVER recompute a plan's day label on the server. Vercel runs in UTC,
   so a plan the user picked as "Thursday" gets relabeled "Tomorrow" if computed server-side
   near a date boundary. The CLIENT computes the label in the browser timezone and sends it
   as `whenDayLabel`; the server stores it verbatim. Same caution for expiry — prefer a
   generous buffer over recomputing local day boundaries server-side.
6. **Resend FROM address**: `hi@stoop.house` (NOT `.co` — that was an old fallback bug that
   sent from an unverified domain and failed silently). System emails:
   `Stoop <hi@stoop.house>`. Person-to-person alerts: `[Name] at Stoop <hi@stoop.house>`.
   `hi@stoop.house` must remain a real, monitored inbox (replies and bounces land there).
7. **Email is non-fatal**: every send is wrapped in try/catch. A failed email must never
   break the user-facing flow (posting, messaging, confirming).

## Data model (key tables)
- **profiles**: `id` (= auth user id), name, phone_e164, phone_verified_at, city_id,
  neighborhood_id, about, initials, avatar_bg, avatar_fg, notify_email, is_founding_member.
- **plans**: id, slug (unique; used in URLs), user_id, text, category, spot, when_day,
  when_date, when_time, when_time_specific, spots_total, spots_left, status, intent_tags
  (text[]), expires_at, created_at. status ∈ open | full | expired | removed.
- **conversations**: id, plan_id, poster_id, joiner_id, status ∈ pending | confirmed | declined.
- **messages**: id, conversation_id, from_user_id, text, created_at.
- **conversation_reads**: (user_id, conversation_id, last_seen_at). Powers the unread badge.
  A message is "unread" if it's newer than last_seen_at and not sent by the viewer.
- **blocks**: id, blocker_id, blocked_id (unique pair), created_at. Plus RPC
  `blocked_user_ids(for_user)` (SECURITY DEFINER) returning both-direction blocked ids.
  Always read via `getBlockedIds()` in `@/lib/blocks`.
- **reports**: report queue (being built — see SAFETY_SPEC.md).
- **cities / neighborhoods**: cities have many neighborhoods; all user/plan data carries
  city_id. NYC and Austin only at launch.

## Routing & conventions
- Plan URLs use SLUGS: `/plan/[slug]`. Slugs auto-generated via `slugify()` in `utils.ts`.
- Key client pages: `/feed`, `/post`, `/inbox`, `/inbox/[id]` (chat), `/my-plans`, `/profile`, `/auth`.
- Key API routes: `/api/plans` (GET feed, POST create, PATCH edit), `/api/conversations`
  (GET list, POST create, PATCH confirm/decline), `/api/messages` (POST send),
  `/api/welcome` (welcome email), `/api/unread` + `/api/unread/seen`, `/api/block`,
  `/api/account` (delete).
- **Block enforcement must be applied at EVERY surface that surfaces users or plans**:
  feed query (`/api/plans` GET), conversation creation (`/api/conversations` POST),
  message send (`/api/messages` POST), and the plan detail server fetch (`/plan/[slug]`).
  Both directions matter; `getBlockedIds()` returns both. A missed filter is a safety hole.

## Supabase query-builder pattern (avoid the orphaned-chain bug)
Build the base query ending in `.order().limit()`, then apply conditional filters as
separate reassignments. Do NOT insert an `if` block in the middle of a chain — it strands
the `.order()/.limit()` and throws a syntax error.
```ts
let query = supabase.from('plans').select(...).eq('status','open')
  .gt('expires_at', new Date().toISOString())
  .order('created_at', { ascending: false }).limit(60);
if (cityId) query = query.eq('city_id', cityId);
if (category) query = query.eq('category', category);
if (blockedIds.length) query = query.not('user_id','in', `(${blockedIds.join(',')})`);
```

## Email system
- Templates + send functions in `src/lib/resend.ts`. Editorial style (cream/serif/coral,
  inline CSS only — Gmail strips `<style>` tags). An `escape()` helper guards against XSS.
- Functions: `sendWelcome`, `sendMessageAlert` (new join), `sendReplyAlert` (reply, only if
  recipient inactive 15+ min to avoid spam), `sendConfirmed`.
- Triggers: welcome on signup (`/api/welcome`); join alert in conversations POST; confirm
  alert in conversations PATCH; reply alert in messages POST.
- Deliverability: keep onboarding in waves to warm the domain; DMARC currently p=none,
  tighten to p=quarantine after a few clean weeks; test with mail-tester.com (aim 9-10/10).

## Operations / deploy
- Deploy = `git push origin main`. Vercel auto-builds. NEVER deploy from Claude Code.
- Env vars live in Vercel project settings and local `.env.local`. Keys: Supabase URL +
  anon key + service role key, Resend API key, NEXT_PUBLIC_APP_URL, Twilio creds.
- **Twilio trial blocker**: a trial account can only SMS verified numbers (error 21608 on
  real signups). The account must be upgraded (add billing) before recruiting users.
- DNS records (Cloudflare, all DNS-only): root CNAME -> Vercel, www CNAME -> cname.vercel-dns.com,
  SES MX, one DMARC TXT (only one — two breaks DMARC), DKIM (resend._domainkey), SPF, Vercel verify TXT.
