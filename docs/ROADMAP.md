# Stoop Overhaul Roadmap

Written July 2026 after a full review of the codebase, docs, and product state.
This is the working plan for getting Stoop from "built" to "used." Keep the STATUS
notes current the same way SAFETY_SPEC.md is kept current.

## The honest diagnosis (why traction is stalled)

1. **RESOLVED 2026-07-14: signups work.** The docs said Twilio was still on trial
   (which would have blocked all real signups); the founder confirmed the account is
   upgraded. The funnel is open, so the rest of this list is what actually matters.
2. **The safety layer is code complete but not fully live.** Migration 0002 and the
   Vercel `ADMIN_USER_ID` env var were still pending as of the last session, and the
   live block/report tests have not been run. The whole point of that work was to make
   it safe to recruit; finish the last 5%.
3. **No faces anywhere.** Every person on Stoop is a colored square with initials.
   Meeting a stranger from the internet without ever seeing a face is a big trust ask,
   especially for the women whose presence makes the platform viable. One real photo
   per person closes a lot of that gap. (Being built now, Phase 1.)
4. **A privacy hole in the database rules.** The profiles table is readable by
   anonymous API callers, and that includes the phone number and notification email
   columns. The app never displays them, but anyone technical can query them directly.
   Must be fixed before recruiting real users. (Fix prepared in Phase 1.)
5. **Empty feed = ghost town.** The first thing a visitor sees decides whether they
   come back. DECISIONS.md already says it: seed real plans BEFORE inviting anyone.
6. **Nothing brings people back.** The only pull-back mechanism is a join/reply email.
   A person who browses once and sees three plans has no reason to return Thursday.
7. **Growth was always going to be manual at this stage.** DECISIONS.md is right:
   the first ~50 users are founder recruiting, one neighborhood, posters over lurkers.
   The roadmap below builds the product support for that motion; it does not replace it.

## Phase 0: Unblock the funnel (founder manual steps, about an hour)

These are things only you can do; no code involved. Nothing else on this roadmap
matters until these are done.

- [x] **Upgrade Twilio out of trial.** Done (confirmed by founder 2026-07-14). Still
      worth one end-to-end signup test by someone who is not you.
- [ ] **Run migration 0002** in the Supabase SQL editor (safe to run twice).
- [ ] **Confirm `ADMIN_USER_ID` is set in Vercel** (it is already in local .env.local),
      then redeploy so it takes effect.
- [ ] **Run the safety live tests**: the 8-step block test and the report/suspend test
      in SAFETY_SPEC.md.
- [ ] **Run migration 0003** (privacy hardening) in the Supabase SQL editor. The
      code it depends on is already live.
- [ ] **Run migration 0004 + set CRON_SECRET in Vercel** (any long random string,
      then redeploy) to switch on the weekly digest. Test it first with the dry run
      described in RUNBOOK "Weekly digest".
- [ ] **Seed the feed**: 5 to 10 real plans in ONE target neighborhood before inviting
      anyone. Real plans you and friends will actually host.

## Phase 1: Trust and identity (code; in progress now)

- [x] **Profile photos.** One photo per person, shown everywhere a person appears
      (nav, plan cards, landing, plan detail, inbox, chat). Upload and remove from the
      Profile page; photo is square-cropped and resized in the browser before upload.
      Built so it needs NO manual Supabase setup: the app creates its own public
      `avatars` storage bucket on first upload, and photos live at a predictable path
      per user, so no database migration is required. Initials remain the fallback.
- [x] **Privacy hardening prep.** All server reads of private profile columns now go
      through the admin client, and migration `0003_privacy_hardening.sql` locks the
      profiles table down so the public API can only read the safe columns (name,
      neighborhood, about, avatar colors, and so on). Run 0003 after this code is live.
- [x] **Photo nudge at signup.** After the profile-completion step, new members are
      offered the photo upload right away. Skippable, never forced.
- [ ] **Host context on plan cards.** "Maya has hosted 3 plans" is a cheap, honest
      trust signal once there is data for it. Build after there are real plans.

## Phase 2: First impression and reach

- [ ] **Landing page proof.** Once 10+ real plans have happened: replace abstract copy
      with photos and one-line quotes from actual meetups. Until then the current
      editorial landing is fine.
- [ ] **Verify link previews.** Plan pages already generate Open Graph images; confirm
      they render properly when a plan link is pasted into iMessage, WhatsApp, and
      Instagram DMs (that is where invites will actually be shared).
- [ ] **Neighborhood pages.** /nyc/williamsburg style pages listing that neighborhood's
      open plans. This is the SEO surface and the QR-card landing target. Only worth
      real investment after there is steady content.
- [x] **PWA basics.** Web app manifest + home-screen icons are live; "Add to Home
      Screen" now gives an app-like entry point. Runway toward push notifications later.

## Phase 3: The comeback loop (the week-eight question)

The retention shape problem from DECISIONS.md is real: after someone finds their small
circle, their need drops. The answer at this scale is a calm weekly rhythm, not
engagement mechanics.

- [x] **Weekly city digest email.** BUILT, ships dark. Sunday 22:00 UTC cron sends
      "This week on your stoop" per city, only to people whose city has plans, never
      empty, blocks respected, unsubscribe page included. To ACTIVATE: run migration
      0004 and set CRON_SECRET in Vercel (see RUNBOOK "Weekly digest"). Neighborhood-
      level targeting can come once one city has real density.
- [ ] **Post-plan follow-up.** The day after a confirmed plan: "How was it?" One tap:
      great / fine / no-show / report a problem. Doubles as a safety read and gives you
      the no-show data the group-size decision needs.
- [ ] **"Post another" nudge** inside the follow-up email for hosts whose plan filled.

## Phase 4: Measure what matters

- [x] **/admin/metrics page** (gated like /admin/reports): plans per week, join
      fraction, confirmed fraction, members, repeat posters, last 8 weeks table.
- [x] **Report review SLA**: /admin/metrics shows open report count and the oldest
      open report's age against the 24-hour commitment.

## Explicitly not doing (unchanged from DECISIONS.md)

Native iOS app, ID verification, background checks, AI moderation, larger groups,
more cities. All revisit-with-traction items. Density in one neighborhood first.

## STATUS

- 2026-07-14: Roadmap created. Phase 1 profile photos + privacy hardening built and
  pushed (see git log). Phase 0 checklist is with the founder. Migration 0003 written,
  waiting to be run AFTER the Phase 1 deploy is confirmed live.
- 2026-07-15: Twilio confirmed upgraded (funnel is open). Wave 2 shipped: signup photo
  step, weekly digest (dark until migration 0004 + CRON_SECRET), /admin/metrics,
  PWA manifest + icons. Founder to-dos now: migrations 0002/0003/0004, ADMIN_USER_ID +
  CRON_SECRET in Vercel, safety live tests, seed plans, then start recruiting.
