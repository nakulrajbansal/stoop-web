# Safety Layer — Requirements, Design, Build Plan, Status

This is the ACTIVE build. Why it matters and the strategic framing are in DECISIONS.md
("Why the safety layer exists"). Short version: trust & safety is the highest-leverage work
because it's what lets women feel safe posting, and their presence is what makes the whole
platform viable. Build it before recruiting real users.

Build in FOUR verifiable pushes. Each ships and is tested against the live system before the
next is stacked. Safety code is too risky to dump untested — a missed enforcement filter is a
real hole that exposes a real person.

---

## STATUS (keep this current at the end of each session)
- Push 1 (Block): CODE COMPLETE. Run the 8-step test below against the live deploy to verify.
- Push 2 (Report + Admin): CODE COMPLETE, pending two manual steps + live test:
    1. Run migration `supabase/migrations/0002_safety_push2_reports.sql` in the Supabase SQL editor.
    2. Set env var `ADMIN_USER_ID` (your profile/auth user id) in Vercel + local `.env`, so
       `/admin/reports` and `/api/admin/reports` recognize you. Without it, the admin page 404s
       for everyone (safe default).
  Surfaces: /report form (reason + optional note + "also block" default on); /api/reports
  derives the reported user from the conversation and writes via admin client; /admin/reports
  lists open reports with conversation context and Dismiss/Warn/Suspend; Suspend sets
  profiles.blocked_at (gates sign-in already) + hides their plans; isSuspended() also blocks
  posting, messaging, and joining (defense in depth).
- Push 3 (Guidance + Share): CODE COMPLETE. SafetyCard shows in the chat when a plan is
  confirmed (both parties): calm reminders + "send these details to a friend" via navigator.share
  with clipboard fallback. The confirm EMAIL guidance was already live.
- Push 4 (TOS + Community Standard): CODE COMPLETE. /terms page (Community Standard one-liner +
  24-hour review commitment), linked from landing footer, signup flow, and report form.

REMAINING TO FULLY SHIP THE SAFETY LAYER:
- Run the Push 2 migration and set ADMIN_USER_ID (above).
- Push to main so Vercel deploys, then run the Push 1 8-step test and a quick Push 2 test
  (file a report from account A, confirm it appears in /admin/reports, try Dismiss/Warn/Suspend,
  verify a suspended user can't sign in, post, or message and their plans vanish).

---

## PUSH 1 — BLOCK (highest priority)
One-tap, silent, permanent. Make another user disappear from your experience entirely.

Requirements:
- Any signed-in user can block any other from a conversation or a plan.
- Silent: the blocked person is never told.
- After block: blocker doesn't see blocked's plans anywhere; blocked doesn't see blocker's;
  neither can open or message the other. Effect is symmetric (both directions invisible).
- Blocking immediately closes any open conversation between the two.
- Cannot be circumvented via a new conversation or a different plan.

Design / implementation:
- Table `blocks` (blocker_id, blocked_id, unique) + RPC `blocked_user_ids(for_user)`
  (SECURITY DEFINER, returns both directions). Helper `getBlockedIds()` in `@/lib/blocks`.
- API `/api/block` POST (record block + close open convos via admin client) and DELETE (unblock).
- ENFORCEMENT SURFACES (all required):
  1. Feed: `/api/plans` GET excludes blocked user_ids.
  2. Conversation creation: `/api/conversations` POST refuses if blocked (403).
  3. Message send: `/api/messages` POST loads conversation, verifies sender membership,
     refuses if blocked (403).
  4. Plan detail: `/plan/[slug]` server fetch returns null -> notFound() if viewer/poster blocked.
- UI: a "⋯" menu in the chat header (inside the header row, right side) with Block + Report.
  Block confirms once, calls /api/block, returns to /inbox.

8-STEP TEST (two accounts A and B; each step verifies one surface):
1. B posts a plan; confirm A sees it in the feed.
2. A messages B's plan, exchange a message.
3. A opens "⋯" -> Block; A returns to inbox, conversation gone from A's inbox.
4. A's feed no longer shows B's plan. (feed filter)
5. A opens B's plan by direct URL -> not found. (plan-detail filter)
6. B's feed no longer shows A's plans. (symmetric filter)
7. B tries to message A (via URL if inbox hides it) -> send fails. (message filter)
8. B opens one of A's plans by URL -> not found. (symmetric plan-detail filter)
All 8 must pass before Push 2.

---

## PUSH 2 — REPORT + ADMIN REVIEW (high priority)
Blocking protects the individual; reporting protects the platform. Separate actions.

Requirements:
- Report another user with a reason category (harassment, inappropriate messages,
  no-show/unsafe behavior, fake profile, other) + optional free text.
- Report flow offers "also block this person," defaulted ON.
- Reports write to a queue the admin can review with context (reporter, reported, reason,
  detail, linked conversation).
- Admin can Dismiss / Warn / Suspend. Suspend blocks the user from sign-in, posting, messaging,
  and hides their plans.
- Documented commitment to review within 24 hours (state it in the TOS, Push 4).

Design:
- `reports` table. `/report?conversation=...` form (categories as tappable options, optional
  text, "also block" checkbox default on). Submitting writes the report and optionally the block.
- `/admin/reports` page GATED to my user id only. Lists open reports newest first with context;
  three actions. Suspend sets a flag on the reported profile that auth + posting flows check.
- The chat "⋯" menu Report button (already routes to /report in Push 1) drives this.

---

## PUSH 3 — SAFE-MEETING GUIDANCE + SHARE-WITH-A-FRIEND (medium; low effort)
Mostly copy and placement plus reuse of existing share code.

Requirements:
- On plan confirmation, both parties see a calm card: meet in public, tell someone where
  you're going, trust your gut, cancel anytime. (Email half already done in sendConfirmed.)
- Tone: warm and considerate, NOT alarming. No red, no blocking modal. A thoughtful host,
  not a liability waiver. Heavy-handed warnings increase anxiety and signal danger.
- From a confirmed plan, one tap to share details (what/where/when/with whom) via the device
  share sheet (reuse the existing navigator.share on the plan page), framed as "send these
  details to a friend so someone knows where you'll be."

---

## PUSH 4 — TOS + COMMUNITY STANDARD (do last)
- A short, plain-English Terms of Service and a one-line community standard ("Stoop is for
  genuine plans between real people; harassment, solicitation, and unsafe behavior get you
  removed"). Include the 24-hour report-review commitment.
- Link both from the footer, signup, and the report flow.
- Needed regardless of native app; required by Apple if a native app ships.

---

## Explicitly OUT OF SCOPE (see DECISIONS.md): ID verification, background checks, in-app
## emergency button, live location, AI moderation, panic features. Revisit at hundreds of users.
