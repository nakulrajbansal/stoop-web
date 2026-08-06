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
- [ ] **Run migration 0005** to switch on the day-after "How was it?" follow-up
      (uses the same CRON_SECRET; see RUNBOOK "Post-plan follow-up").
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
- [x] **Host context on plan pages.** The plan page now shows "has posted N plans"
      next to the host once they have posted at least 2 (a first-timer gets no
      empty badge). Turns on by itself as real data accumulates.

## Phase 2: First impression and reach

- [ ] **Landing page proof.** Once 10+ real plans have happened: replace abstract copy
      with photos and one-line quotes from actual meetups. Until then the current
      editorial landing is fine.
- [ ] **Verify link previews.** Plan pages already generate Open Graph images; confirm
      they render properly when a plan link is pasted into iMessage, WhatsApp, and
      Instagram DMs (that is where invites will actually be shared).
- [x] **Neighborhood pages.** /nyc/williamsburg style pages listing that neighborhood's
      open plans, plus /nyc and /austin neighborhood indexes, a generated sitemap.xml,
      and robots.txt. This is the SEO surface and the QR-card landing target. Founder
      step after launch: submit the sitemap in Google Search Console.
- [x] **PWA basics.** Web app manifest + home-screen icons are live; "Add to Home
      Screen" now gives an app-like entry point. Runway toward push notifications later.
- [x] **SEO layer.** Keyword-targeted titles and on-page copy (make friends in {city},
      things to do in {neighborhood} this week), FAQ section on the landing page, and
      structured data throughout (FAQPage, WebSite, BreadcrumbList, ItemList,
      SocialEvent per dated plan). Founder steps and honest expectations: RUNBOOK
      "Neighborhood pages and SEO".

## Phase 3: The comeback loop (the week-eight question)

The retention shape problem from DECISIONS.md is real: after someone finds their small
circle, their need drops. The answer at this scale is a calm weekly rhythm, not
engagement mechanics.

- [x] **Weekly city digest email.** BUILT, ships dark. Sunday 22:00 UTC cron sends
      "This week on your stoop" per city, only to people whose city has plans, never
      empty, blocks respected, unsubscribe page included. To ACTIVATE: run migration
      0004 and set CRON_SECRET in Vercel (see RUNBOOK "Weekly digest"). Neighborhood-
      level targeting can come once one city has real density.
- [x] **Post-plan follow-up.** BUILT, ships dark. The day after a confirmed plan both
      people get "How was it?" with one-tap great / fine / no-show on the /followup
      page (plus a report link). Answers land in the plan_feedback table. To ACTIVATE:
      run migration 0005 (CRON_SECRET is shared with the digest). See RUNBOOK
      "Post-plan follow-up".
- [x] **"Post another" nudge** inside the follow-up email for hosts whose plan filled.

## Phase 4: Measure what matters

- [x] **/admin/metrics page** (gated like /admin/reports): plans per week, join
      fraction, confirmed fraction, members, repeat posters, last 8 weeks table.
- [x] **Report review SLA**: /admin/metrics shows open report count and the oldest
      open report's age against the 24-hour commitment.

## Phase 5: Uncertainty reduction (code complete, August 2026)

The objection was not "I do not like it", it was "I cannot tell what happens next".
Six answers, in the product rather than the FAQ. Details and rationale in
DECISIONS.md; the measurement contract is in GROWTH_GRAPH.md sections 7 and 10.

- [x] **Contract copy before signup**: homepage "Before you sign up" section, the
      four-step sequence, three new FAQ entries, feed and neighborhood pages, and an
      `/auth` screen that says what happens next and why the phone and email are
      asked for. One source of truth in `src/lib/product-copy.ts`.
- [x] **Minimum plan clarity contract**: exact time (no publishable "no time"),
      required public meeting point with a home-address warning, required cost
      expectation, group size 1 to 3, shared client and server validation, and a
      pre-publish summary of exactly what a neighbor will see.
- [x] **Public host preview** on the plan page, and a **private requester card** for
      the host above Accept and Decline.
- [x] **Private confirmed roster** at `/api/plans/[id]/participants`, host and
      confirmed participants only, fetched after sign in and never server rendered.
- [x] **Withdrawal and capacity correctness**: four states everywhere, atomic
      transitions in Postgres, exactly one spot restored, no overbooking.
- [x] **Honest empty states and real counts** on the homepage, feed and neighborhood
      pages. Samples stay labelled Sample and are never counted.
- [x] **Aggregate first-party measures** on `/admin/metrics`: complete plans, contract
      rate, conversations per plan, confirmed and withdrawn shares, plans with a
      confirmed participant, repeat hosts, blocks and reports.
- [x] **Asking again**: somebody who withdrew can ask once more, deliberately, with a
      new opener and an email to the host. A decline is final for that plan.
- [x] **Only Stoop moves a request**: UPDATE on conversations revoked from the API
      roles, plus a guard trigger, so a status cannot be written from a browser.
- [ ] **Founder gates, not code**: run migrations `20260805210000` then
      `20260805211500` in Supabase **before** pushing the code, then confirm the plan
      page, a request, an accept, the roster, a withdrawal and an ask-again on the live
      site. Confirm, decline, withdraw and ask-again all answer 503 and write nothing
      until the second migration is in, by design.
- [ ] **Comprehension test**: five first-impression sessions, at least three on mobile
      and at least two women, before optimizing conversion. Four of five should be able
      to explain the state model and who sees whom, unprompted.
- [ ] **Supply gate**: see SEEDING.md. Unmet until real plans exist.

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
- 2026-07-15 (wave 3, UI review): walked the live site as a first-time visitor and
  fixed the conversion path. Logged-out visitors can now write a full plan and sign
  up at publish time (draft saved and restored); after signup they land back on the
  plan or post they came from. Empty states stopped announcing failure ("0 plans"
  headline replaced, landing shows an example plan). Disabled publish button now says
  what is missing. Phone-number reassurance added at signup. Em dashes removed from
  UI copy per the writing convention.
- 2026-07-15 (wave 4, design polish): fonts moved to next/font self-hosting with
  real 600/700 weights (no more faux bold or font flash). Muted gray darkened to
  #6E675E for WCAG AA contrast in the app, all emails, and the OG image. Site-wide
  keyboard focus ring. Sports category got its missing pill color; music, arts, and
  plan-card pills reworked into one warm per-category palette so no tag looks like a
  button. Success banner recolored to sage. Feed shows skeleton rows while loading.
  Dead dark-mode CSS deleted.
- 2026-07-15 (wave 5, rebrand): founder flagged that the site read as a dating
  app; chose the "neighborhood noticeboard" direction. Accent went from
  terracotta to civic green (#2F6B3F) across app, icons, OG image, and emails;
  mustard (#8A681E) now carries the italic headline emphasis; a separate danger
  red (#B3402A) covers errors, delete, and the report/suspend flows. All
  anti-dating copy ("no swiping, no algorithm", "meet the person who shows up")
  rewritten to neighborly language in the app, metadata, manifest, and both
  email code paths. Tagline unchanged.
- 2026-07-15 (wave 6, roadmap completion): built every remaining code item that
  does not require real users. Post-plan follow-up loop (dark until migration
  0005; daily 16:00 UTC cron, one-tap great/fine/no-show on /followup, answers
  in plan_feedback, "post another" nudge for hosts whose plan filled).
  Neighborhood SEO surface (/nyc + /austin indexes, /city/neighborhood plan
  listings, sitemap.xml, robots.txt). Host trust signal on plan pages ("has
  posted N plans" from 2 plans up). Remaining roadmap items all need real-world
  traction first: landing-page proof photos, link-preview spot checks, and the
  founder checklist in Phase 0.
- 2026-08-05 (uncertainty reduction): built Phase 5 above. New pure modules with
  tests: `plan-contract`, `conversation-lifecycle`, `participants`, `product-copy`,
  `metrics`. New migrations `20260805210000_plan_clarity_contract.sql` and
  `20260805211500_conversation_withdrawal.sql`, neither run in production yet.
  Rehearsed locally against Postgres 16 in Docker: full migration chain applied to a
  fresh database, 12 lifecycle and security probes passed, both new migrations
  re-applied twice with no error or data change, and a two-session race on the last
  spot produced exactly one confirmation. Test suite 58 to 164. Typecheck went from
  103 inherited errors to 90, with no new diagnostic identity. Founder to-dos are the
  three unchecked boxes above.
- 2026-08-06 (independent review, then refinement): an external review passed the
  release with required fixes and found one thing the original rehearsal could not:
  under Supabase's stock table grants, a host could set a withdrawn request back to
  confirmed with a plain UPDATE, because the guarantee lived in the function rather
  than at the table. Reproduced locally, then closed at the database boundary (UPDATE
  revoked from the API roles, plus a guard trigger) and covered by new probes that act
  as anon and authenticated with a JWT claim. Also fixed: the migration order is
  migrations-first and no longer claims to be order independent; the non-atomic confirm
  fallback is gone and the route fails closed with a 503; withdrawn requesters can ask
  again once, on purpose, and declines are final; public surfaces render and serialize
  first names only, including the JSON-LD organizer; the roster denies rather than
  proceeding when the block lookup fails; a POST onto a resolved conversation returns
  its real status; action buttons keep their names while busy; counts say when they are
  filtered or capped. Component tests now exist for PlanSummary, RequesterCard and
  ConfirmedRoster on jsdom. Test suite 164 to 226.
