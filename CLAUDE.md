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
- UNCERTAINTY REDUCTION (Aug 2026) is code complete, PARTLY DARK. The product
  contract is now stated in the product: browsing is public, signup is only for
  posting or messaging, a message starts a private conversation and reserves
  nothing, the host confirms, and confirmed participants privately see the
  roster. Copy lives once in src/lib/product-copy.ts.
  - PLAN CLARITY CONTRACT (src/lib/plan-contract.ts): every new plan and every
    edited legacy plan needs activity, date, EXACT time (the "No time" chip is
    gone), a public meeting point, group size, and a cost expectation
    (free | pay-own-way | ticket-required). Validated on the client AND in
    /api/plans; the composer shows a pre-publish summary of what neighbors see.
    Legacy plans stay readable; the editor asks for the gaps on next save.
  - PRIVATE ROSTER: GET /api/plans/[id]/participants, host and confirmed
    participants only, fetched client side so no unauthorized viewer's HTML ever
    contains a name. Authorization matrix in src/lib/participants.ts.
  - WITHDRAWAL: four states (pending, confirmed, declined, withdrawn) named the
    same everywhere. Capacity moves inside Postgres under a plan row lock, so a
    confirmed withdrawal restores exactly one spot, a repeat does nothing, and
    two simultaneous confirmations cannot overbook. Clients cannot write a
    status at all: UPDATE on conversations is revoked from anon/authenticated and
    a BEFORE UPDATE trigger refuses any status change not made by service_role or
    from inside the lifecycle functions.
  - ASKING AGAIN: someone who withdrew can ask once more, deliberately, with a
    new opener; the host gets an email that says they left earlier. A DECLINE IS
    FINAL for that plan. Pressing Message on a plan you left does nothing without
    the explicit re-request.
  - ONE TRANSACTION PER REQUEST: start_or_reopen_conversation writes the
    conversation (or the reopen) AND the opening message together, so a failed
    opener leaves no pending request with nothing in it and does not spend the
    one allowed reopen. It is the only way into pending; there is deliberately no
    separate reopen function. The host email is sent after the commit, once, only
    when the function says notify_host.
  - RUN BOTH MIGRATIONS BEFORE DEPLOYING THE CODE:
    20260805210000_plan_clarity_contract.sql then
    20260805211500_conversation_withdrawal.sql. NOT order independent. The code
    selects and writes cost_expectation, so deploying first breaks posting,
    editing and every neighborhood page; and confirm/decline/withdraw/ask-again
    have NO fallback, they answer 503 and write nothing until migration two is
    in. Rehearsed locally against Postgres 16 in Docker (supabase/rehearsal,
    RUNBOOK "Local migration rehearsal"), including probes that act as anon and
    authenticated under Supabase's stock grants; NOT run against production.
  - /admin/metrics gained aggregate loop measures (complete plans, contract rate,
    conversations per plan, confirmed and withdrawn shares, repeat hosts, blocks,
    reports). Counts only. The new private routes are NOT on the analytics
    allowlist and must not be added.
- VISUAL SYSTEM (Aug 2026) needs no migration, no env var and no ops step: it is
  presentation only. Full detail in docs/ARCHITECTURE.md "Visual system" and
  docs/VISUAL_ASSETS.md.
  STATUS: the first release of this shipped and was ROLLED BACK. The visible
  "Photograph, not a plan" caption under every picture read as a disclaimer
  dropped into the layout, and the phone got a stack of desktop sections:
  6,871px of homepage at 320px, five serif headlines all at the same size, ten
  bordered cards, three standalone photo blocks. Production is on the previous
  deployment. What is described below is the SECOND pass, built on
  feature/visual-staging-v2 and NOT deployed: preview only until reviewed. It is
  presentation and copy-placement only; no API, database, migration, analytics
  or lifecycle behaviour was touched.
  - DRAWINGS, not an icon package: src/components/CategoryArt.tsx (one authored
    SVG per category, all seven) and src/components/StoopArt.tsx (pinned card,
    conversation, host deciding, table for four, empty board, unplugged line).
    currentColor throughout, sized in px, decorative (aria-hidden) wherever the
    category or the state is already written next to them. Category ink and wash
    live in globals.css beside the matching .tag-* pill.
    On the two surfaces that do NOT write the category out (the homepage's
    featured rows and the composer's pre-publish summary) the art gets an
    accessible name from categoryLabelOf, which answers null for a stored
    category we no longer draw rather than calling it Coffee out loud.
  - PHOTOGRAPHY: exactly two CC0 photographs in public/photos (134,376 bytes
    total, down from three and 148,230), homepage only, always through
    src/components/Photograph.tsx. They are DECORATIVE: empty alt, NO caption,
    and no free-text alt prop, so the only wording a photograph can ever be
    given is the alt on its record in src/lib/photos.ts (spoken only if a call
    site passes `informative`, and nothing does). Placement is what keeps them
    apart from plan data: a masked band under the nameplate, and a layer inside
    the closing panel. No photograph shows an identifiable face and nobody in
    one may be presented as a member; the masthead does contain distant
    pedestrians, cropped below the shoulder. No alt text may mention a host,
    member or attendee. Provenance (source page, creator, licence, download
    date, encode recipe) is in docs/VISUAL_ASSETS.md, including for the one that
    was dropped. A photograph must never appear on a plan, feed, inbox or
    profile surface; the test scans for it, including the /[city]/[hood]
    neighborhood routes, and also fails on an unreferenced file left in
    public/photos. Both originals are 960px wide, so a full-bleed band on a
    1440px desktop is painted ~1.5x up; that ceiling is written down in
    VISUAL_ASSETS.md and the fix is a larger CC0 original, never an upscale.
  - STRUCTURED DATA: every JSON-LD block in the app goes through
    src/components/JsonLd.tsx, which escapes < and > (and U+2028/U+2029) after
    JSON.stringify (src/lib/json-ld.ts). Plan text is user-authored, and a plan
    containing "</script>" would otherwise have closed the script element.
    That is now the ONE authority and there are no exceptions: the homepage's
    three blocks, the SocialEvent on /plan/[slug], the BreadcrumbList on
    /[city], the BreadcrumbList and plan ItemList on /[city]/[hood], and the
    Article on /guides/[slug]. The plan block was the exploitable one, since
    its name is raw plan text and its location is the raw meeting spot.
    src/app/structured-data.test.tsx holds the line: it parses the rendered
    component with a real HTML parser and walks every file under src/app,
    failing on a hand-written ld+json script or a JSON.stringify handed to
    dangerouslySetInnerHTML. The only inline script written by hand anywhere in
    src/app is the referrer shim in layout.tsx, which inlines a compile-time
    constant and carries no runtime value.
  - MOTION: entrance only (.rise, .rise-art), opacity and transform, one run, no
    loops but the spinner. prefers-reduced-motion names them explicitly and
    leaves them in their finished state, and its .lift selectors must stay
    identical to the live rule (:hover and :focus-within). No animation library,
    no new dependency. The composer's pinned publish bar needs THREE rules and
    they are all in globals.css: .has-sticky-action (scroll-margin on every
    focusable control), html:has(.has-sticky-action) (scroll-padding, because
    scroll margin never fires for a control already partly on screen), and
    @media (max-height: 640px) which un-pins the bar entirely, because at
    320x568 it owns 135px of the viewport and parks over the plan textarea
    before any scroll is asked for. Presentation only: same button, same
    disabled logic, same status line. Verified by keyboard sweep at four
    viewports, 51 stops, none covered.
  - MOBILE SCALE: .sec/.sec-tight, .gut, .h-sec and .rows/.rows-flat-sm in
    globals.css are the ONE place section padding, page gutter, heading size
    and hairline lists are set, and each grows at the 640px breakpoint. A
    section must not type its own clamp(); home-page.test.ts fails if a
    section heading does, and visual-system.test.ts reads the numbers out of
    the stylesheet and fails if one stops growing at sm.
  - THE SURFACES: homepage (masthead photo band, promise and primary action
    above the fold at 320px, the live board second, the four steps as a
    scannable list, category tiles into the feed, the six contract answers as
    hairline rows, FAQ as native details, closing panel with the second
    photograph layered into it), feed (category art per row, capacity segments,
    distinct loading/empty/outage graphics), plan detail (category header band,
    capacity meter, logistics still directly under the title), composer (visual
    category picker, illustrated pre-publish summary). Product facts, copy and
    API behaviour are unchanged; CONTRACT_STEPS gained a `short` line for the
    drawn sequence and the full `body` is still the contract. The feed's outage state
    is ONE role="alert" holding the headline, the drawing, the explanation, the
    retry and the way out, in the headline slot with nothing in the list below;
    split in two, a screen reader heard the body without the headline.
- CHECKS: `npm test` (vitest) and `npm run typecheck` are the only checks. The
  suite covers analytics-policy, referrer-shim, ops, plan-contract,
  conversation-lifecycle, participants, product-copy, public-plan, metrics,
  blocks, db-migrations, busy-buttons, analytics-private-routes, photos,
  visual-system, json-ld, structured-data (the plan, city, neighborhood and
  guide blocks), the homepage's shape, the plans and conversations and
  participants routes, and the components (PlanSummary, RequesterCard,
  ConfirmedRoster, CategoryArt, CapacityMeter, FaqList, Photograph). Component tests run on jsdom with React
  Testing Library, opted into per file with a `@vitest-environment jsdom`
  docblock; everything else stays on the node environment. The `lint` script was
  REMOVED: it ran `next lint`, which Next 15.5 deprecates, and with no ESLint
  installed it dropped into an interactive prompt that hangs. This project has no
  linter. Typecheck baseline was 103 inherited errors from @supabase/ssr's stale
  types and is now 55 (measured Aug 2026 on origin/main AND on this branch: the
  same 55, none of them new; the "90" recorded here before was stale, and a
  stale ceiling is worse than none). That is why ignoreBuildErrors stays on.
  Do not let it grow.
  The database is NOT covered by `npm test`: db-migrations.test.ts reads the SQL
  as text. The executable database proof is the rehearsal in supabase/rehearsal.

KEEP THIS SECTION CURRENT: at the end of a working session, update the status here and
in docs/SAFETY_SPEC.md so the next session starts accurate.

## How to work with me
- Before a big change, tell me the plan in plain language and which files you'll touch.
- Make changes, show diffs, let me review before I push.
- For safety code, go slow and verify each enforcement surface (a missed filter is a real hole).
- When unsure about product direction, ask rather than assume.
