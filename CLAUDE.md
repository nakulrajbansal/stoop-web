# Stoop — Project Brief for Claude Code

Read this first, every session. For deeper detail, see the `/docs` folder:
- `docs/ARCHITECTURE.md` — stack, data model, gotchas, conventions, deploy/ops
- `docs/DECISIONS.md` — settled product decisions and the reasoning behind them
- `docs/SAFETY_SPEC.md` — the safety-layer build (requirements, design, status)
- `docs/ROADMAP.md` — the overhaul roadmap (phases, status, founder checklist)
- `docs/RUNBOOK.md` — operational procedures (deploy, DNS, Twilio, test scripts)

## What this is
Stoop is a hyperlocal social platform. Tagline: "Plans, not profiles."
People post a real plan they're already doing this week (coffee, a run, pickleball),
and a few others can join. No swiping, no algorithm, no profiles to browse.
Live at https://stoop.house. Two cities at launch: NYC and Austin.

## My working context
- I am the founder, not a developer. Explain changes in plain terms.
- You (Claude Code) edit files directly and commit. I review diffs and push.
- NEVER run a deploy. Deployment is automatic: I push to GitHub `main`, Vercel builds
  and deploys. Your job ends at the commit.
- I work on a Mac (project at ~/stoop-app) and sometimes Windows.
- Writing convention: NO em dashes anywhere, including code comments and UI copy.
  Use commas, periods, parentheses, or semicolons.

## Stack (summary — full detail in docs/ARCHITECTURE.md)
- Next.js 15 (App Router). Server components by default.
- Supabase (Postgres + Auth + Realtime). Auth is PHONE-ONLY via OTP.
- Twilio Verify is the SMS provider behind Supabase phone auth.
- Resend for transactional email. Sending domain stoop.house (SPF+DKIM+DMARC live).
- Vercel hosting. Cloudflare DNS, all records "DNS only" (never proxied).

## The gotchas that have bitten me (respect these — see ARCHITECTURE.md for full list)
1. SUPABASE URL must be the bare project URL. NEVER append /rest/v1. Broke the build twice.
2. auth.uid() is NULL in API routes (SSR doesn't propagate the JWT). Verify ownership
   manually in the route, then mutate with the admin client `@/lib/supabase/admin`.
3. next.config.js has ignoreBuildErrors + ignoreDuringBuilds ON. Type errors won't fail
   the build, but still write correct types. It's a safety net, not a license to be sloppy.
4. Date labels: never recompute a plan's day label server-side (UTC mislabels Tomorrow vs
   Thursday). Client computes it in browser TZ and sends `whenDayLabel`; server stores verbatim.
5. Resend FROM is hi@stoop.house (NOT .co). System: "Stoop <hi@stoop.house>".

## Product rules (settled — don't re-litigate without asking; rationale in docs/DECISIONS.md)
- Group size: organizer + 1 to 3 joiners. Max 4 total. spots ∈ {1,2,3}.
- Auth is phone-only by design.
- Notification email is MANDATORY at signup (profiles.notify_email). No app means email
  is the only way a user learns someone joined.
- Categories (fixed set): coffee, outdoors, sports, arts, food, books, music.
- URLs use plan SLUGS not ids: /plan/[slug].
- Founding member badge: auto-granted to the first 50 members who PUBLISH a plan
  (in /api/plans POST). Never seed fake profiles or fake plans; seeding is real
  founder/friend plans only (see DECISIONS.md "Founding member badge").

## Current state
See docs/ROADMAP.md and docs/SAFETY_SPEC.md STATUS sections. At time of writing (July 2026):
- Core loop works end to end (post -> message -> email -> confirm -> email).
- Mandatory email + welcome/join/reply/confirm emails wired and live.
- Unread badge live.
- Safety layer CODE COMPLETE for all 4 pushes (block, report+admin, guidance+share, TOS).
  Before it is fully live: run migration 0002 in Supabase, confirm ADMIN_USER_ID in Vercel,
  then run the live tests in docs/SAFETY_SPEC.md. See that file's STATUS for specifics.
- PROFILE PHOTOS live in code: one photo per person, uploaded from /profile, shown on
  every avatar surface via src/components/Avatar.tsx. Photos live in the public
  "avatars" storage bucket at {userId}.jpg; the app creates the bucket on first upload,
  so there is NO manual Supabase step and NO DB column for it.
- PRIVACY HARDENING code is in (all notify_email reads go through the admin client).
  Migration 0003 (locks phone/email columns away from the public API) must be run in
  Supabase AFTER that code is deployed. Until it runs, the old exposure remains.
- Twilio is UPGRADED (off trial, July 2026). Real signups work.
- SIGNUP now ends with an optional add-a-photo step.
- WEEKLY DIGEST built but DARK: Sunday cron emails each member their city's open
  plans. Activates only when migration 0004 is run AND CRON_SECRET is set in Vercel.
  Ops + safe testing: RUNBOOK "Weekly digest".
- /admin/metrics (ADMIN_USER_ID-gated): plans/week, join rate, repeat posters,
  report SLA. PWA manifest live (Add to Home Screen works).
- /admin/ops built but DARK until migration 0006 is run: owner-only board of
  high-level tasks and pending approvals (create, edit, approve/reject,
  complete, reopen) via /api/admin/ops. Same ADMIN_USER_ID gate, 404 for
  everyone else. Domain rules and transitions live in src/lib/ops.ts with
  tests in src/lib/ops.test.ts. Migration 0006 seeds the real work in flight
  and is safe to re-run.
- POST-PLAN FOLLOW-UP built but DARK: daily cron (16:00 UTC) emails both people
  the day after a confirmed plan; one tap on /followup records great/fine/noshow
  into plan_feedback (service-role only). Activates when migration 0005 is run
  (CRON_SECRET shared with digest). Ops: RUNBOOK "Post-plan follow-up".
- NEIGHBORHOOD PAGES live: /nyc, /austin, /{city}/{neighborhood} (5-min cache,
  via the cookie-free anon client src/lib/supabase/public.ts), plus generated
  sitemap.xml and robots.txt. Plan pages show "has posted N plans" from 2 up.
- DESIGN SYSTEM (July 2026, "neighborhood noticeboard" rebrand): the old
  terracotta accent read as a dating app, so the palette is now cream paper +
  civic GREEN accent #2F6B3F (buttons, links, icons, emails), MUSTARD #8A681E
  for italic headline emphasis and pending badges, DANGER #B3402A reserved for
  errors/delete/report (never CTAs), sage for success. Fonts self-hosted via
  next/font in src/app/layout.tsx (Fraunces, DM Sans variable incl. real bold,
  DM Mono). Muted gray is --muted #6A635A (4.99:1 on cream, 4.60:1 on cream-2;
  don't lighten). MUSTARD #8A681E is DISPLAY TYPE ONLY (3:1 large-text); at body
  size use --gold-2 #6F5312 (Founding-member lines, pending badges, /admin/ops
  labels). Per-category tag colors in globals.css (.tag-*, all 7 incl. sports).
  Site-wide :focus-visible ring. No dark mode. Copy rule: never define Stoop
  against dating apps (no "no swiping / no algorithm" lines); talk like a block
  noticeboard. Tagline "Plans, not profiles." stays.
  Do not stack a Tailwind opacity-* on --muted or on the accent for text: both
  are already at their contrast limit, and that is what caused the two failures
  fixed on the homepage.
- ANALYTICS PRIVACY LAYER live in code (src/components/Analytics.tsx,
  src/lib/analytics-policy.ts, src/lib/referrer-shim.ts). Plan slugs are made
  from the plan text, so the stock Vercel component was sending user content,
  conversation ids and auth destinations to a third party. Reporting is now an
  ALLOWLIST of compile-time route tokens (anything unrecognised is dropped, so
  a new private route is invisible by default), plan pages report as the literal
  "/plan/[slug]", and an inline head script clamps document.referrer to a bare
  origin before any script can read it. It fails closed: no clamp, no analytics.
  Consequences you will see in the dashboard: per-plan reach is gone, referrers
  coarsen to origins, and a gate failure records nothing at all. Full contract
  in docs/GROWTH_GRAPH.md section 7. Do not "fix" a route by adding it to the
  allowlist without reading that section.
- DEPENDENCIES: npm audit --omit=dev reports 0 vulnerabilities (was five high:
  next, axios, form-data, and postcss + sharp nested under next). The postcss
  and sharp fixes need the "overrides" block in package.json, scoped to next,
  because next pins them. engines.node is >=20.9.0, which is sharp 0.35's floor,
  so Vercel must not be pinned to Node 18. Still Next 15, React 18, twilio 5.
- CHECKS: `npm test` (vitest, 58 tests across analytics-policy, referrer-shim
  and ops) and `npm run typecheck` are the only checks. The `lint` script was
  REMOVED: it ran `next lint`, which Next 15.5 deprecates, and with no ESLint
  installed it dropped into an interactive prompt that hangs. This project has
  no linter. Typecheck baseline is 103 inherited errors from @supabase/ssr's
  stale types; that is why ignoreBuildErrors stays on. Do not let it grow.

KEEP THIS SECTION CURRENT: at the end of a working session, update the status here and
in docs/SAFETY_SPEC.md so the next session starts accurate.

## How to work with me
- Before a big change, tell me the plan in plain language and which files you'll touch.
- Make changes, show diffs, let me review before I push.
- For safety code, go slow and verify each enforcement surface (a missed filter is a real hole).
- When unsure about product direction, ask rather than assume.
