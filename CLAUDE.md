# Stoop — Project Brief for Claude Code

Read this first, every session. For deeper detail, see the `/docs` folder:
- `docs/ARCHITECTURE.md` — stack, data model, gotchas, conventions, deploy/ops
- `docs/DECISIONS.md` — settled product decisions and the reasoning behind them
- `docs/SAFETY_SPEC.md` — the active safety-layer build (requirements, design, status)

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

## Current state
See docs/SAFETY_SPEC.md "Status" section for the live build state. At time of writing:
- Core loop works end to end (post -> message -> email -> confirm -> email).
- Mandatory email + welcome/join/reply/confirm emails wired and live.
- Unread badge live.
- Safety layer IN PROGRESS: Push 1 (block) deploying. Pushes 2-4 pending.
- Twilio must be upgraded out of trial or real signups fail (error 21608).

KEEP THIS SECTION CURRENT: at the end of a working session, update the status here and
in docs/SAFETY_SPEC.md so the next session starts accurate.

## How to work with me
- Before a big change, tell me the plan in plain language and which files you'll touch.
- Make changes, show diffs, let me review before I push.
- For safety code, go slow and verify each enforcement surface (a missed filter is a real hole).
- When unsure about product direction, ask rather than assume.
