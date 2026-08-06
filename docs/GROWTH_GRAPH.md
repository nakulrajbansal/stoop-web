# Stoop Growth Graph

How a stranger becomes someone who posts a plan, meets a neighbor, and comes back.
This file is the map: the nodes, the edges between them, what we actually know about
each edge, and what we are still guessing.

Read `docs/ARCHITECTURE.md` for the stack and `docs/DECISIONS.md` for settled product
rules. Nothing here overrides those.

---

## 1. Read this before you read a number

**Route reach is not conversion.** Vercel Web Analytics counts visitors and pageviews
per route. It does not follow one person from one route to the next. When this document
says "/post reached 14 visitors", it means 14 distinct visitors loaded /post at some
point in the window. It does not mean 14 people came from the homepage, and it does not
mean the 4 visitors who reached /auth were 4 of those 14. Treating reach as a funnel
is the single easiest way to be confidently wrong here.

Other things that are true about the current data:

- The window is tiny. 58 visitors is not a sample you can run an experiment against.
- **Internal and admin traffic is mixed in.** Founder and test sessions are not
  excluded, so on a route with single-digit reach, a meaningful share of it may be us.
- First recorded data is 2026-07-27, so the "previous period" (Jul 23 to Jul 29) only
  contains three days of data. Period-over-period comparison is not valid yet.
- The current Vercel plan does not expose custom events or UTM dimensions without a
  paid add-on, so there is no event-level instrumentation at all.

Everything below is a hypothesis with a mechanism attached, not a finding.

---

## 2. Evidence of record

Checked 2026-08-05 06:14 UTC. Provider: Vercel Web Analytics only. PostHog, session
replay, and Speed Insights are not installed and are not being added.

**Jul 30 to Aug 5** (Aug 5 partial): 58 visitors, 168 pageviews, 2.9 pages/visitor.
**Jul 23 to Jul 29** (only Jul 27 to 29 recorded): 31 visitors, 128 pageviews, 4.1 pages/visitor.

Route reach, latest window (visitors / views):

| Route | Latest | Prior |
| --- | --- | --- |
| Homepage | 45 / 88 | 14 / 49 |
| /post | 14 / 19 | 2 / 4 |
| /feed | 12 / 13 | 6 / 11 |
| /auth | 4 / 4 | 3 / 3 |
| Leading plan page | 3 / 5 | 15 / 26 (one shared plan) |
| Williamsburg | 3 / 3 | not in top routes |

Acquisition, latest window: 53 visitors and 157 views direct or unattributed; Google 3;
Reddit app 3; Reddit web 1; Facebook up to 2; ChatGPT 1; DuckDuckGo 1.

Audience: US 52 of 58 visitors. Mobile 33, desktop 25. iOS 24, Mobile Safari 23.

**The one shape worth naming.** In the prior window the top of the funnel was a single
shared plan link (15 visitors). In the latest window it is the homepage (45). The
entry point moved from one person's plan to the front door, and /post reach grew with
it (2 to 14). Meanwhile /auth reach barely moved (3 to 4). Reach is not conversion, so
this does not prove a drop-off. But it is consistent with one, and drafting is the only
step between them, so that is where this release spends its effort.

---

## 3. The graph

Nodes are states a person is in. Edges are the transitions we can affect with code.

```
             external / direct
                     |
                 [1 Discover]
                     |
        +------------+------------+
        |            |            |
  [2 Understand] [3 Explore]      |
        |            |            |
        +-----> [4 Commit intent] <+
                     |
                 [5 Draft]
                     |
              [6 Authenticate]
                     |
               [7 Activate]  <-------+
                     |               |
               [8 Connect]           |
                     |               |
               [9 Confirm]           |
                     |               |
              [10 Retain] -----------+
```

| # | Node | Entered when | Surface |
| --- | --- | --- | --- |
| 1 | Discover | Any first page load | `/`, `/{city}`, `/{city}/{hood}`, `/guides/*`, `/plan/[slug]` |
| 2 | Understand | They can state what Stoop is | Homepage hero, how-it-works, FAQ |
| 3 | Explore | They look at real plans | `/feed`, neighborhood pages, plan pages |
| 4 | Commit intent | They open the composer | `/post` |
| 5 | Draft | They have a complete, specific plan written | `/post` form state |
| 6 | Authenticate | Phone verified | `/auth` |
| 7 | Activate | Plan published | `POST /api/plans` |
| 8 | Connect | A join message sent | `/plan/[slug]` composer |
| 9 | Confirm | Organizer replies and the plan is set | `/inbox/[id]` |
| 10 | Retain | They post or join a second time | `/my-plans`, weekly digest |

### Edges, and what we know

| Edge | Evidence | Confidence |
| --- | --- | --- |
| 1 to 2 | Homepage reach 45. Nothing tells us whether they understood. | None |
| 1 to 3 | /feed reach 12, neighborhood reach 3. | Weak |
| 2 to 4 | /post reach 14, up from 2. | Weak, directional |
| 4 to 5 | Not instrumented. No signal at all. | None |
| **5 to 6** | **/auth reach 4 against /post reach 14. The widest visible gap.** | Weak, but the only gap this large |
| 6 to 7 | Server-side: profiles created vs plans published. In `/admin/metrics`. | Available, not read here |
| 7 to 8 | Server-side: conversations per plan. | Available |
| 8 to 9 | Server-side: confirmed plans. In `/admin/metrics` join rate. | Available |
| 9 to 10 | Server-side: repeat posters. In `/admin/metrics`. | Available |

Note the asymmetry: edges 1 to 5 have only third-party reach data, which is weak and
now deliberately reduced (see section 7). Edges 6 to 10 are all measurable from our own
database with no third party involved, and that is where the real numbers live.

---

## 4. Instrumentation gaps

Ranked by how much they cost us.

1. **Edge 4 to 5 is dark.** We cannot tell the difference between "opened /post and
   left immediately" and "wrote 200 characters and abandoned at the neighborhood
   picker". These call for completely different fixes. This is the most expensive gap.
2. **No path-level attribution.** Reach per route cannot be joined into a sequence.
3. **/auth reach is now intentionally unavailable.** The privacy fix drops analytics
   events for `/auth` entirely, because the URL carries the destination the visitor was
   heading to. The replacement signal is server-side: profiles created per day, which
   is a better measure of the same thing and involves no third party.
4. **Internal traffic is not excluded** and cannot be, without custom events.
5. **53 of 58 visitors are direct or unattributed**, so channel performance is mostly
   unknowable. UTM dimensions need a paid add-on.
6. **No Core Web Vitals.** Speed Insights is deliberately not installed. Mobile Safari
   is 23 of 58 visitors, so field performance is a real blind spot, accepted for now.
7. **Per-plan reach is gone, and referrers are now origins at best.** Plan pages all
   report as one constant token, plan-to-plan navigation may not register a second
   pageview, and inbound referrers are clamped to a bare origin or dropped. Section 7
   spells out what this does to the dashboard. Read the numbers there before comparing
   anything across this deploy.

The honest reading: for edges 1 to 5, prefer reasoning from mechanism and from the
source, which is what this release did. For edges 6 to 10, read `/admin/metrics`.

---

## 5. What shipped in this release, by edge

Every change maps to at least one edge.

**Edge 5 to 6 (Draft to Authenticate). The primary target.**

- `/post` now writes the draft to `localStorage` continuously as the person types,
  not only when they press publish on an already-complete plan. Previously a
  half-written plan was held only in React state; a backgrounded tab on iOS is
  reclaimed routinely, and 23 of 58 visitors are on Mobile Safari.
- The publish button is no longer dead when the plan is incomplete. Pressing it now
  marks what is missing and moves focus to the first missing field. Previously the
  button was `disabled`, which is both a dead end and unreachable by keyboard.
- `/auth` reached from a draft now says why: the heading becomes "One step left" and
  the subhead states that the plan is saved and what the number is for. Previously it
  said "Join Stoop", the same as a cold visit, giving no reason to trust the detour.
- Returning to `/post` after signup now confirms the draft survived instead of
  silently rehydrating the form.
- The OTP field carries `autoComplete="one-time-code"`, so iOS offers the texted code
  above the keyboard. The phone, name, and email fields carry matching autocomplete.

**Edge 5 to 7 (draft integrity, correctness).**

- A logged-out visitor can pick any neighborhood in either city, but `POST /api/plans`
  scopes the neighborhood lookup to the account's own city and **silently falls back to
  the profile's neighborhood when the drafted one does not match**
  (`src/app/api/plans/route.ts`). A plan drafted for East Austin by someone who signs
  up in NYC would have been filed in an NYC neighborhood without a word. `/post` now
  detects this on return, clears the field, and asks them to pick again. The API
  contract is untouched.

**Edge 1 to 2 and 2 to 4 (Discover, Understand, Commit).**

- Homepage headline was `clamp(56px, 7vw, 96px)` with `-3px` tracking. At 320px the
  line "not profiles." exceeds the available width. It is now
  `clamp(42px, 13vw, 96px)` with tracking that opens up only at the `sm` breakpoint.
- The hero offered two same-size buttons whose primary action changed depending on
  supply. It now presents one dominant action (post a plan) with browse directly
  beneath it, full width on mobile, browse never more than one tap away.
- Mobile gutters tightened from 24px to 20px on the homepage, feed, post page and nav,
  which is what makes 320px comfortable rather than merely non-overflowing.

**Edge 3 (Explore) and low-supply honesty.**

- The feed list showed open spots only in a right-hand column hidden below `sm`.
  Mobile is 33 of 58 visitors, so the majority could not see availability without
  opening a plan. Spots now appear inline on narrow screens.
- Removed two unsupported claims: "Plans get joined fast" (there is no evidence of
  speed, and at current supply it reads as manufactured urgency) and "The type of
  person who posts on Stoop is the same type who shows up" (an assertion about people
  we cannot make). Replaced with statements about how the board actually works.
- Removed "Plans posted with a face get joined a lot more" from the signup photo step.
  That is an invented statistic. The replacement gives the real reason: recognition.
- The `/report` confirmation said reports "are prioritised over everything else here",
  which is a service promise with nothing behind it (and British spelling in a US
  product). It now says "Every report is read by the person running Stoop", which is
  the literal arrangement: `/admin/reports` is gated to a single `ADMIN_USER_ID`. No
  response time is promised, because none is guaranteed. `/terms` "Last updated" moves
  to August 2026, since what the product tells people about reports changed.

**Edge 8 (Connect).**

- The join composer had a placeholder and no label. It now has a real label that says
  what a useful opener contains, and an example placeholder. The 5-character minimum
  and all send behavior are unchanged.

**Accessibility, all edges.** Details in section 8.

**Analytics privacy.** Section 7.

---

## 6. Hypotheses

Falsifiable, each with the mechanism it rests on. None of these is a claim about
impact. Impact is only knowable after release.

- **H1.** Draft loss is a real cause of the gap between /post reach and /auth reach.
  *Mechanism:* the draft was persisted only at submit time, and only for a complete
  plan. *Falsified if:* server-side profile creations per /post visitor do not move
  once traffic is large enough to read.
- **H2.** People decline the phone step because the ask is unexplained at the moment it
  arrives, not because they object to phone verification. *Mechanism:* the auth page
  gave a cold-visit greeting to someone mid-task. *Falsified if:* the phone step still
  loses people at the same rate with the contextual framing.
- **H3.** The homepage headline overflowing at 320px costs comprehension on the
  narrowest devices. *Mechanism:* clipped or overlapping display type on first paint.
  *Falsified if:* narrow-viewport behaviour is unchanged in field testing.
- **H4.** Hiding spot availability on mobile suppresses plan page visits.
  *Mechanism:* the availability column was `hidden sm:block`.
- **H5.** Most direct or unattributed traffic is not really direct; it is stripped
  referrers plus our own sessions. *Mechanism:* 53 of 58 unattributed against 6
  identified referrers. *Note:* this release makes referrer data deliberately
  coarser, so H5 becomes harder to test, which is an accepted trade.

---

## 7. Analytics privacy contract

### The defect

Plan slugs are generated from the plan text itself (`slugify` in `src/lib/utils.ts`
takes the first 50 characters). A URL like
`/plan/going-to-the-farmers-market-saturday-morning-ab12` **is** the user's content.
The stock `@vercel/analytics/next` component sends the real pathname alongside the
parameterised route, so production was shipping plan content, conversation ids
(`/inbox/[id]`), auth destinations (`/auth?next=/plan/...`) and admin paths to a third
party. That is not something a neighborhood noticeboard should do.

### The rule

`src/lib/analytics-policy.ts` is an **allowlist, not a blocklist**. A path is reported
only if it maps to a route token in a closed, compile-time set. Anything unrecognised
is dropped, so a new private route is invisible to analytics by default.

May be sent:

- `/`, `/feed`, `/post`, `/terms`, the two `/guides/*` pages
- `/{city}` and `/{city}/{hood}` for the 2 cities and 19 neighborhoods in
  `src/lib/neighborhoods.ts`, which is a compile-time table no user content can extend
- `/plan/[slug]` as that literal constant, never the slug

Never sent, and dropped entirely rather than trimmed: `/auth`, `/inbox`, `/inbox/[id]`,
`/my-plans`, `/profile`, `/report`, `/followup`, `/unsubscribe`, `/admin/*`,
`/plan/[slug]/edit`, `/api/*`, and any path not on the allowlist. Query strings and
fragments are discarded before classification, so no form value, token, email, or
destination can survive in a reported URL.

### How the URL is enforced

Two independent layers:

1. `src/components/Analytics.tsx` uses the plain React component from
   `@vercel/analytics/react` and supplies both `route` and `path` itself. Because a
   defined `route` is passed, the SDK sets `disableAutoTrack` and stops deriving paths
   from navigation on its own. On a private page an empty string is passed: still
   defined, so auto-tracking stays off, but falsy, so no pageview is emitted at all.
2. `beforeSend` re-classifies anything the script decides to report by itself and
   rewrites or cancels it.

`src/lib/analytics-policy.test.ts` covers every sensitive route class, asserts that
output is always a member of the closed token set, and asserts the allowlist and the
sensitive-prefix list never overlap.

### The referrer, and why the URL rule was not enough

The URL is not the only thing the provider receives. The remote script reads
`document.referrer` itself and forwards it as the `r` field on a cross-host first
pageview. That read happens inside the script, before anything we hand it, so
`beforeSend` never sees it and cannot cancel it.

`Referrer-Policy: strict-origin` does not close this. That header governs referrers we
**send**: it keeps our own plan and inbox paths out of outbound requests and out of
internal navigations, which is worth having and stays. It has no effect on a referrer
an external site chooses to send **to** us. A site running `unsafe-url` hands us its
full URL, path and query included, and no response header of ours can shorten it after
the fact.

So the value is clamped at the source, before any analytics code can read it.

**The shim.** `src/lib/referrer-shim.ts` holds a small inline script that
`src/app/layout.tsx` server-renders into `<head>`. It runs while the document is still
parsing, before `<body>` exists, and therefore before React hydrates. It redefines
`document.referrer` so that what any script can read afterwards is exactly one of two
things:

- the empty string, or
- a bare HTTP(S) origin: scheme, host, optional port

and never a path, query string, fragment, embedded credentials, or a non-HTTP scheme.
An `android-app://` or `file://` referrer becomes empty. `https://user:pass@host/x`
becomes empty. `https://old.reddit.com/r/nyc/comments/abc` becomes
`https://old.reddit.com`.

**The gate, and it fails closed.** The shim sets `window.__stoopReferrerSafe` only
after it has read the property back and confirmed the clamp took. `Analytics.tsx`
renders nothing until it sees that flag on the client *and* independently re-checks
that what is readable now still satisfies the contract. Because `@vercel/analytics`
only creates its `<script>` element from inside a `useEffect`, rendering nothing means
no tag is appended, no request is made, and the remote script never runs.

Every failure path lands on that same nothing: the property cannot be redefined, the
referrer will not parse, the read-back disagrees, hydration never happens, the flag is
missing for any reason at all. Losing analytics is the acceptable outcome; forwarding a
referrer is not.

**What the tests do and do not prove.** `src/lib/referrer-shim.test.ts` executes the
real inlined shim source against a stub document and asserts it agrees with the
TypeScript reference implementation on every input, that it withholds the flag when
`defineProperty` throws or the read-back disagrees, and that it is idempotent. These
are unit tests in Node. They do not prove browser timing, and nothing here should be
read as proving it. What makes the ordering safe is structural rather than tested: the
shim is inlined in `<head>` and the only consumer is created from an effect that cannot
run before the document is parsed.

### What was checked, and when

All of the following was checked locally against a production build on 2026-08-05,
**before deployment**. None of it is a statement about the live site.

- `.next/static/chunks/app/layout-*.js` contains `disableAutoTrack`, the frozen
  allowlist and the sensitive-prefix list, and the compiled gate
  (`...!0===window.__stoopReferrerSafe...if(!t)return null`) sits ahead of the SDK
  element, so the insights script cannot be created without the flag. `computeRoute`,
  the helper that derived the real pathname, is absent.
- The prerendered HTML carries the shim inside `<head>`, ahead of `<body>`.
- `Referrer-Policy: strict-origin` is present on `/` and `/terms` from `next start`.
  The production response has not been checked and will not have been until this is
  deployed.

### Measurement consequences, stated up front

These are not side effects to discover later in the dashboard.

- **Plan pages aggregate.** Every plan reports as the single constant `/plan/[slug]`,
  so per-plan reach is gone. The dashboard will show one large `/plan/[slug]` row where
  it previously showed individual slugs. **This is a discontinuity, not a trend**: any
  comparison across the deploy boundary for plan pages is invalid. The prior window's
  "leading plan page, 15 visitors" line in section 2 has no comparable successor.
- **Plan to plan navigation may not count.** Because a defined `route` turns
  `disableAutoTrack` on and both consecutive plan pages resolve to the same token, an
  in-app move from one plan to another may not produce a second pageview. Plan-page
  pageview counts should be read as a floor, not a total.
- **Referrers coarsen to origins, and some disappear.** Attribution is now at best
  "came from reddit.com", never which thread. App referrers with non-HTTP schemes
  (`android-app://com.reddit.frontpage`, which is how the Reddit app identified itself
  in section 2) become empty and land in the direct-or-unattributed bucket, which was
  already 53 of 58 visitors and will grow.
- **Any failure is silent and total.** If the gate does not open, that visit records
  nothing at all. A sudden drop to zero is a gate symptom, not a traffic symptom.

If the whole arrangement stops being worth it, remove `<Analytics />` from
`src/app/layout.tsx`. The policy module, the shim and their tests need no changes.

### Routes added by the uncertainty-reduction release

Three new surfaces arrived with the roster and withdrawal work. None of them is on the
allowlist, and none of them should ever be added to it:

- `GET /api/plans/[id]/participants`, the private confirmed roster. The path contains a
  plan id, and the body contains first names, neighborhoods and about text of people who
  agreed to meet. It is an `/api/` path, so it was already denied by default; a
  regression test in `src/lib/analytics-private-routes.test.ts` fails if the allowlist
  ever grows to cover it.
- `GET /api/conversations?conversationId=...`, the host's private requester card. Same
  reasoning, plus a conversation id in the query string.
- The composer, the editor and the plan page gained fields (exact time, public meeting
  point, cost). They report exactly as before: `/post` and the constant `/plan/[slug]`.
  No field value is ever part of a reported URL.

If a future change makes a private route "look missing" in the dashboard, that is the
policy working. Read the server-side numbers in `/admin/metrics` instead.

### First-party measures for this release

`/admin/metrics` gained the loop this release exists to move, computed by the pure
`summarizeLoop` in `src/lib/metrics.ts` (tested in `src/lib/metrics.test.ts`):

- complete plans in the last 7 days, and the share of new plans meeting the clarity
  contract (activity, date, exact time, public meeting point, group size, cost);
- conversations per plan, and plans with at least one confirmed participant;
- the share of all requests that were confirmed, and the share withdrawn;
- repeat hosts;
- blocks and total reports, as guardrails rather than goals.

All of it is aggregate counts and percentages. The function takes rows and returns
numbers: no plan text, host identity, message content, location, plan id or conversation
id can appear in an output value, and a test asserts that. Nothing here is sent
anywhere; the page is server rendered behind the `ADMIN_USER_ID` gate, and `/admin` is
not reportable.

Read the withdrawal rate against the confirmation rate. Confirmations rising while
withdrawals, blocks and reports stay flat is the result this release is aiming at.
Confirmations rising *with* withdrawals is people saying yes and then discovering they
should not have.

### Not installed, deliberately

PostHog, session replay, autocapture, Speed Insights, and any other third-party
collector. Custom events would need a paid Vercel add-on; the server-side numbers in
`/admin/metrics` answer the same questions without a third party.

---

## 8. Accessibility work in this release

Targeting WCAG 2.2 AA basics.

- **Labels.** The `/post` textarea, time, neighborhood and spot fields had no
  programmatic label. Every `/auth` field had a visible `<label>` with no `htmlFor`,
  so none were associated. All now are. The `/inbox/[id]` chat textarea had only a
  placeholder and now carries a visually hidden `<label>`; the `/report` details
  textarea had a visible label with no `htmlFor` and is now associated by id. The
  `/inbox/[id]` overflow and send buttons had no accessible name and now have one.
- **Semantics.** Toggle controls on `/post` and `/feed` now expose `aria-pressed` and
  sit in labelled groups. All non-submitting buttons are `type="button"`.
- **Landmarks.** There was no `<main>` anywhere in the app, and the skip link pointed
  at an empty `<span id="main">` inside `Nav`, which is not a landmark and gives a
  screen reader nothing to announce. Every page now wraps its content in
  `src/components/PageMain.tsx`, which renders the one `<main id="main" tabIndex={-1}>`
  and owns the id so it cannot drift from the `href="#main"` in the root layout. It
  replaces each page's existing outer container rather than adding a level, so the DOM
  is no deeper. `Nav` is a plain `<nav>` again.
  Why not wrap `{children}` in the root layout instead, which would have been one line:
  every page renders `<Nav />` itself and six render `<Footer />`, so that would put
  both inside `<main>` and land the skip link above the navigation it exists to skip.
- **Landmarks under Suspense.** Five pages put `Nav` and `PageMain` *inside* their
  Suspense boundary, so the server-rendered fallback was a bare `<div>Loading…</div>`
  with no navigation and no `#main` to skip to. On those pages the skip link had no
  target until hydration finished, which is exactly the window it exists for. `/feed`,
  `/auth`, `/followup`, `/report` and `/plan/[slug]` now render `Nav`, the one
  `PageMain` and (where present) `Footer` outside the boundary, with only the page body
  inside it, following the pattern `/unsubscribe` already used.
- **404 page.** There was no `app/not-found.tsx`, so an unmatched URL and a removed
  plan both landed on the framework default: no nav, no landmark, no way onward.
  `src/app/not-found.tsx` now renders `Nav` + `PageMain` and links to the feed, the
  composer, the front page and the Terms. It claims nothing about why the page is
  missing beyond the two cases that actually produce it.
  Counted in the built HTML on `/`, `/terms`, `/post`, `/my-plans`,
  `/guides/how-to-make-friends-in-nyc`, and on all five hoisted pages plus the 404:
  one `main`, one `nav`, and the footer outside `main` where it belongs. On `/feed`,
  `/auth`, `/followup` and `/report` the counted markup is the fallback state, before
  any hydration.
- **Keyboard access.** The publish button is no longer `disabled`, so it is reachable
  and explains itself. A skip link jumps past the sticky nav on every page.
- **Announcements.** Error regions use `role="alert"`; the publish status line and the
  draft-restored notice use `role="status"`; the feed skeleton is a labelled `status`
  rather than `aria-hidden`.
- **Names.** The nav's mobile "+" button and the avatar link had no accessible name.
  The unread badge exposed a bare number.
- **Reduced motion.** There was no `prefers-reduced-motion` handling at all. Smooth
  scrolling, hover transforms and transitions are now suppressed under it. The loading
  spinner keeps turning, slower, because it still has to read as "working".
- **320px.** Homepage headline, auth heading, bottom CTA and mobile gutters.
- **No zoom trap on iOS.** The shared `.input` was 14px. Below 16px, mobile Safari
  zooms the page when a field takes focus and does not zoom back out, which on `/post`
  and `/auth` (almost entirely form) leaves someone scrolled sideways mid-task. `.input`
  is now 16px up to the `sm` breakpoint and 14px above it, where no browser zooms.
  Three sets of fields never used `.input` at all, they hardcode their own Tailwind
  classes, so they were still zooming: `/post`'s time, neighborhood and spot fields
  (now `text-[16px] sm:text-[14px]`), the `/inbox/[id]` chat textarea and the `/report`
  details textarea (both now `text-[16px] sm:text-[13.5px]`). The `/post` plan textarea
  was already 16px.
  The precise claim: **every text-entry control in the app** (`<input>`, `<textarea>`,
  `<select>`) is now at least 16px below the `sm` breakpoint, which is the set of
  controls that can trigger the zoom. This was checked by reading the class list of
  every such element in `src/`. It is not a claim about non-entry controls: buttons,
  tags and date chips are still 10.5px to 13px by design, and none of them takes text
  focus, so none of them zooms.
  On 320px: every one of these fields is `width: 100%` inside a centred column and none
  shares a row with anything else, so a larger glyph reflows rather than overflows. That
  is a source reading, not a device test.
- **Colour contrast.** Two real WCAG AA failures for normal-size text, both found by
  computing ratios against the actual composited backgrounds rather than by eye:
  - `--gold` `#8A681E` on cream is 4.33:1, and 3.75:1 on the 12% mustard badge fill
    behind "Pending". Fine for the display type it was designed for (large text needs
    3:1), not fine for the body-size uses that had crept in: the Founding-member lines
    on `/`, `/feed` and `/post`, the pending badges on `/my-plans` and `/inbox/[id]`,
    and two labels on `/admin/ops`. Those now use a new `--gold-2` `#6F5312`, which is
    the same mustard deep enough to clear AA everywhere (6.05:1 on cream, 5.58:1 on
    cream-2, 5.23:1 on the badge fill). `--gold` is unchanged, so no headline moves.
  - `--muted` cleared AA on cream (4.70:1) but only reached 4.33:1 on cream-2, which is
    the background behind muted text on `/post` and `/my-plans`. Darkened four steps to
    `#6A635A`: 4.99:1 on cream, 4.60:1 on cream-2, 5.69:1 on card.

  Two further failures were found by an actual rendered audit rather than by reading
  source, both on the homepage, both caused by a Tailwind `opacity-*` sitting on top of
  a colour that was already at its limit:
  - The empty-week sample plan's metadata line was `text-muted opacity-70`, which
    composites to 2.81:1 at 11.5px. The opacity is removed; the line is plain
    `--muted` at 4.99:1. The sample's headline keeps its `opacity-70` because it is
    `--ink`, which still measures 6.50:1 through it.
  - The 01/02/03 numerals in "How it works" were accent at 16%, which composites to
    1.24:1 on cream. They are now accent at 75%, 3.29:1, clearing the 3:1 large-text
    threshold at 64px bold. 70% was computed first and came out at 2.99:1, so 75% is
    the floor, not a round number. They stay a tint rather than solid accent, so the
    numeral is still quieter than the heading beneath it.

**The audit.** Lighthouse 12 accessibility, headless Chrome, against `next start` on a
production build (localhost, with the database replaced by a local stub so both the
populated and the empty states could be rendered). `/`, `/auth`, `/followup`,
`/report`, `/terms`, `/plan/[slug]` and the 404 score **100** with no failing audits.
`/feed` scores **98**: one `heading-order` failure, because the plan list and the
empty state both jump from the `h1` to `h3`. That is pre-existing, was not introduced
or touched here, and is left for the audit in backlog item 9. `color-contrast` passes
on every page, in both the populated and the empty state.

This is a lab audit of a local build. It says nothing about the deployed site and
nothing about field performance.

Not done, and worth doing: a full audit of `/inbox`, `/my-plans`, `/profile` and the
admin pages, which this release did not touch.

---

## 9. Dependencies, types and lint: what is fixed and what is inherited

### Production dependencies: clean

`npm audit --omit=dev` reported five high-severity advisories (next, sharp, axios,
form-data, and a postcss nested under next). All five are resolved. It now reports zero
high and zero critical, and so does `npm audit` including dev dependencies.

| Package | Was | Now | How |
| --- | --- | --- | --- |
| next | 15.5.18 | 15.5.22 | patch bump inside `^15.5` |
| axios | 1.16.1 | 1.19.0 | already allowed by twilio's `^1.13.5`; the lockfile was just stale |
| form-data | 4.0.5 | 4.0.6 | follows from axios 1.19 requiring `^4.0.6` |
| postcss | 8.4.31 nested under next | 8.5.25 | **override required**: next pins `postcss` to the exact string `8.4.31`, so nothing else can move it |
| sharp | 0.34.5 | 0.35.3 | **override required**: next's optional dependency is `^0.34.3`, which can never resolve to a patched 0.35 |

The two overrides are scoped to `next` rather than global, so they cannot silently
re-resolve anything else. Both targets are the versions Next itself moved to in 16.x
(`postcss` 8.5.23, `sharp` ^0.35.3), so neither is ahead of what the framework
supports. No major upgrades: still Next 15, still React 18, still twilio 5.

`engines.node` is now `>=20.9.0`. That is not a preference, it is sharp 0.35's own
floor. Vercel's current default is above it; if the project has ever been pinned to
Node 18 in project settings, that has to change before this deploys.

Reproducibility was checked with `npm ci` from a clean `node_modules`: same versions,
zero vulnerabilities.

### Typecheck: 140 errors, 37 fixed, 103 inherited

`npm run typecheck` reported 140 errors before this pass and reports 103 now. Every
file's count went down or stayed the same; no file gained an error.

**Fixed (37), and it was one stale type file.** `src/types/database.ts` is a
hand-maintained mirror of the schema and had drifted in two ways:

1. No table declared `Relationships`. `@supabase/supabase-js` requires that member for
   a schema to satisfy its `GenericSchema` constraint. Without it the client's `Schema`
   parameter resolves to `never` and *every row read in the codebase* comes back as
   `never`. Adding `Relationships: []` to all nine tables is a types-only change.
2. Real columns and tables were missing: `profiles.notify_email` (which the app has
   depended on since notification email became mandatory), `warned_at`,
   `digest_opt_out_at`, `reports.conversation_id`, `reports.resolved_at`,
   `conversations.followup_sent_at`, and the `plan_feedback`, `blocks` and
   `conversation_reads` tables. Columns are annotated with the migration that
   introduced them. `blocks` and `conversation_reads` have no migration in this repo,
   so their shape is taken from the queries that use them and is marked as such.

Nothing here creates, alters or migrates anything. It is a type file catching up.

**Inherited, and out of scope (103).** All but one trace to a single cause:
`@supabase/ssr` is pinned at `^0.5.2`, and its declarations were written against an
older `@supabase/supabase-js`. It declares

```
createServerClient<Database, SchemaName, Schema>(...): SupabaseClient<Database, SchemaName, Schema>
```

passing the schema *object* as the third generic. In `@supabase/supabase-js@2.106.2`
the third generic is a schema *name* (a string). The client type is therefore malformed
at construction, `Schema` degrades to `never`, and every read through a client built by
`@supabase/ssr` yields `never`. The same file also imports `GenericSchema` from
`@supabase/supabase-js/dist/module/lib/types`, a path that no longer exists in the
package's exports, which is why the cookie callbacks in `src/lib/supabase/server.ts`
and `src/middleware.ts` come out implicitly `any`.

This cannot be fixed from inside this repo without assertions, and assertions were
explicitly off the table. The real fix is upgrading `@supabase/ssr` (0.5 to 0.10+,
whose peer range wants `@supabase/supabase-js` ^2.111) and re-testing the phone-auth
and cookie paths end to end. That is an auth-path change, not a type-layer one, and it
does not belong in a growth release.

The one remaining error is unrelated: `src/app/api/check-otp/route.ts` calls
`auth.admin.createSession`, which is not on `GoTrueAdminApi` in the installed
`@supabase/auth-js`. That is a live API question, not a typing one, and touching it
would mean touching sign-in.

**Therefore `typescript.ignoreBuildErrors` stays on** in `next.config.js`. Turning it
off today would break the build on inherited errors. The condition for removing it is
narrow and now known: upgrade `@supabase/ssr`, resolve `createSession`, confirm zero
errors, then delete the flag. Baseline to compare against: **103**.

### Lint: no linter, and the old script was a trap

`npm run lint` ran `next lint`, which Next 15.5 deprecates and Next 16 removes. With no
ESLint installed and no config in the repo, running it did not lint anything: it
dropped into an interactive "How would you like to configure ESLint?" prompt, which
hangs anywhere non-interactive.

The script has been removed rather than repointed. Installing ESLint and a config to
make an obsolete command look like it passes would mean a lint framework migration and
an unknown pile of new findings across twenty-odd files, which is not this release's
job. `eslint.ignoreDuringBuilds` was already on and the build never linted, so nothing
about the build changes.

Baseline: **this project has no linter.** `npm run typecheck` and `npm test` are the
checks that exist. If a linter is wanted later, the supported path is
`npx @next/codemod@canary next-lint-to-eslint-cli .`, and it should land as its own
change with its own review.

---

## 10. Guardrails

Things that must stay true. If a change here would break one, it is the wrong change.

1. **No invented social proof.** No fake users, plans, testimonials, metrics, urgency,
   scarcity, or endorsements. Sample plans stay labelled "Sample". The Founding member
   line is a real product rule, not a scarcity tactic.
2. **No dark patterns, no friction asymmetry.** Leaving is as easy as arriving. The
   publish button became easier to press, never harder to avoid.
3. **Never define Stoop against dating apps.** No "no swiping", no "no algorithm".
   Talk like a block noticeboard.
4. **Nothing content-derived reaches a third party.** Section 7 is the contract.
5. **Safety controls are untouchable.** Block, report, suspension, rate limits, phone
   verification, the 4-person cap.
6. **Group size stays organizer plus 1 to 3.** Cities stay NYC and Austin.
7. **Server owns the truth.** Client-side draft convenience never becomes client-side
   authority. Ownership is verified in the route.
8. **No em dashes anywhere**, including code comments and UI copy.
9. **Do not read reach as conversion.** Section 1.

---

## 11. Experiment backlog

Ranked by expected leverage divided by cost. Nothing here is scheduled, and none of it
should run until traffic is large enough to read; at 58 visitors a week, ship
mechanism fixes and watch server-side counts instead.

| # | Experiment | Edge | Why now | Cost |
| --- | --- | --- | --- | --- |
| 1 | Read profile creations and plans published per week from `/admin/metrics` and treat that, not /auth reach, as the activation number | 6 to 7 | Already built, no third party, replaces the signal the privacy fix gave up | None |
| 2 | Exclude internal sessions from the numbers, e.g. an owner-only cookie checked server-side | All | Single-digit reach is uninterpretable while founder traffic is mixed in | Low |
| 3 | Server-side draft-abandonment signal: record only that a draft reached completeness, no content | 4 to 5 | The darkest edge in the graph. Must be built to the section 7 contract | Medium |
| 4 | Let a signed-out visitor pick a neighborhood in any city and honour it at publish time, rather than clearing it | 5 to 7 | Removes the reconciliation this release had to add. Needs a product decision on cross-city posting first | Medium |
| 5 | Second dominant-action test on the homepage: browse-first for visitors arriving from a shared plan link, post-first otherwise | 2 to 4 | Entry point moved from plan links to homepage; the right first action may differ by origin | Low |
| 6 | Neighborhood page to plan page path: give each neighborhood page a live plan list rather than counts | 1 to 3 | Williamsburg reach 3 with no visible onward path | Medium |
| 7 | Self-hosted Core Web Vitals collection, no third party, mobile Safari first | All | 23 of 58 visitors on Mobile Safari with zero field performance data | Medium |
| 8 | Digest-to-return measurement using existing email infrastructure | 9 to 10 | Weekly digest is built but dark; activating it needs migration 0004 | Low once live |
| 9 | Accessibility audit of `/inbox`, `/my-plans`, `/profile`, admin | All | Untouched by this release | Medium |

---

Last updated: 2026-08-05.
