# Stoop Overhaul Roadmap

Written July 2026 after a full review of the codebase, docs, and product state.
This is the working plan for getting Stoop from "built" to "used." Keep the STATUS
notes current the same way SAFETY_SPEC.md is kept current.

## The honest diagnosis (why traction is stalled)

1. **Signups may literally be broken.** Twilio is still on a trial account (per the
   runbook), which means anyone who is not a manually verified number gets NO OTP text
   (error 21608). If that is still true, zero traction is not a product signal at all;
   nobody could get in. This is the single highest-priority item on this list.
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

- [ ] **Upgrade Twilio out of trial** (runbook has the steps). Then have someone who is
      NOT you sign up end to end and confirm the OTP arrives.
- [ ] **Run migration 0002** in the Supabase SQL editor (safe to run twice).
- [ ] **Confirm `ADMIN_USER_ID` is set in Vercel** (it is already in local .env.local),
      then redeploy so it takes effect.
- [ ] **Run the safety live tests**: the 8-step block test and the report/suspend test
      in SAFETY_SPEC.md.
- [ ] **Run migration 0003** (privacy hardening, added in Phase 1 below) AFTER the
      Phase 1 code push is live.
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
- [ ] **Photo nudge at signup.** After the profile-completion step, offer the photo
      upload right away ("plans with a face get joined more"). Skippable, never forced.
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
- [ ] **PWA basics.** Web app manifest + icons so "Add to Home Screen" gives an
      app-like entry point. Cheap, and the runway toward push notifications later.

## Phase 3: The comeback loop (the week-eight question)

The retention shape problem from DECISIONS.md is real: after someone finds their small
circle, their need drops. The answer at this scale is a calm weekly rhythm, not
engagement mechanics.

- [ ] **Weekly neighborhood digest email.** Sunday evening: "This week on your stoop:
      4 plans near you." Only sends if there are actually plans (never send an empty
      digest). One-tap unsubscribe. This is THE comeback mechanism while there is no app.
- [ ] **Post-plan follow-up.** The day after a confirmed plan: "How was it?" One tap:
      great / fine / no-show / report a problem. Doubles as a safety read and gives you
      the no-show data the group-size decision needs.
- [ ] **"Post another" nudge** inside the follow-up email for hosts whose plan filled.

## Phase 4: Measure what matters

- [ ] **/admin/metrics page** (gated like /admin/reports): plans posted per week,
      fraction of plans that get at least one join, signups, and how many posters
      return to post again. Per DECISIONS.md, plans-per-week and join-fraction are the
      metrics; signups are not.
- [ ] **Report review SLA**: show oldest-open-report age on the admin page so the
      24-hour commitment is visible.

## Explicitly not doing (unchanged from DECISIONS.md)

Native iOS app, ID verification, background checks, AI moderation, larger groups,
more cities. All revisit-with-traction items. Density in one neighborhood first.

## STATUS

- 2026-07-14: Roadmap created. Phase 1 profile photos + privacy hardening built and
  pushed (see git log). Phase 0 checklist is with the founder. Migration 0003 written,
  waiting to be run AFTER the Phase 1 deploy is confirmed live.
