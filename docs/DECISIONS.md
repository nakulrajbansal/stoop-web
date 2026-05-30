# Product Decisions & Strategy

The "why" behind settled choices, so they don't get re-litigated. If you (Claude Code) think
one of these is wrong, raise it with me explicitly rather than quietly building against it.

## Positioning
"Plans, not profiles." The wedge against Meetup / Bumble BFF / Nextdoor is intimacy and
intent: you post something you're already doing, a few real people join, you meet. No profile
to curate, no swiping, no big awkward group event. The structural choices below all serve
that wedge and reinforce each other. That coherence IS the product; protect it.

## Group size: max 4 (organizer + up to 3 joiners)
- spots ∈ {1,2,3} joiners. Started at max 2 joiners; raised to 3 to support inherently
  4-person activities (pickleball doubles, doubles tennis, a 4-top dinner, board games, a car).
- Held the line at 4 total. Four still feels like "us" (a dinner table, a doubles match).
  Five-plus starts feeling like "an event with attendees" and erodes the wedge.
- Do NOT raise this further without a real, observed demand signal. Larger groups = becoming
  Meetup with worse discovery.
- Known future edge case (NOT built yet): team activities that need an exact fill (doubles
  pickleball needs exactly 3 joiners). Current model has no "minimum required"; users manage
  partial fills in chat. Only build "needs exactly N" if partial-fill death becomes common.

## Auth is phone-only
- Reduces bots and throwaway accounts; makes the space feel real. Twilio Lookup blocks VOIP.
- Tradeoff acknowledged: asking for a real number before showing value is friction, and some
  users are wary. Mitigation: browsing is allowed logged-out, so people see real plans before
  being asked for a number.

## Notification email is mandatory
- There is no native app. If a poster doesn't get an email when someone joins, they never
  find out, both people conclude the platform is dead, and the loop silently fails. Email is
  the ONLY reliable pull-back mechanism, so it's required at signup (profiles.notify_email).
- Not doing full email verification (confirmation link) yet — it adds friction at the worst
  moment. Strict format validation + Resend bounce logs for now. Add verification if bounces
  become a real problem.

## Why the safety layer exists (this is a growth lever, not compliance)
Two independent critiques (an expert-in-the-category view and a Gen Z user view) converged on
the same conclusion: the biggest gap is trust & safety, and it specifically blocks women,
whose presence is what makes a connection platform feel safe for everyone and viable as a
network. So safety is the highest-leverage work, not a chore. Posting a plan currently means
publicly announcing where you'll be alone at a specific time, with no block, no report, no
guidance. That must be fixed before recruiting real users. Full spec in SAFETY_SPEC.md.

Other points from those critiques worth remembering:
- **Retention shape problem**: making a new-stranger plan is high-intent, low-frequency. After
  someone builds a small circle, their need drops. "More plans" isn't a retention answer. Open
  question: what brings someone back in week eight? (Don't have a built answer yet.)
- **Feature moat is weak**: small-group choices are copyable. The real moat is density and
  culture in specific neighborhoods. The first 50 users define the culture permanently.
- **Empty feed kills first impressions**: seed real plans BEFORE inviting anyone, or it reads
  as a ghost town and people leave and never return.

## Growth strategy (settled approach)
- **Concentrate, don't spread.** Win ONE neighborhood completely (density) before touching
  the second. 50 people in one neighborhood is a working product; 50 spread across four is
  dead air everywhere. This is the discipline most likely to be abandoned; hold it.
- **Recruit posters, not lurkers.** One person who posts weekly beats ten who never return.
- **Pure zero-effort organic is not real for a cold-start hyperlocal network.** The first ~50
  are always manual founder recruiting (personal network ~30, their referrals, local
  micro-communities, physical QR cards). Organic loops (SEO on plan pages, share-back) only
  compound AFTER there's real content to rank and share.
- **Metric that matters**: plans posted per week and the fraction that get a join. NOT signups.
- iOS native app is DEFERRED. A PWA covers notifications-to-homescreen later; native only makes
  sense after real traction (200+ active, weekly plans). Don't rebuild the iOS effort without that.

## Out of scope for launch (deliberately, to avoid gold-plating)
ID verification, background checks, in-app emergency button, live location sharing, AI message
moderation, panic features. Real for mature platforms; premature now. The block + report +
guidance + manual review layer is the right amount of safety at small scale.

## Design language
Editorial / print aesthetic, not typical-startup. Cream #F0EBE1, ink #14110D, coral #C8472A,
sage #2A4232. Serif (Georgia) headlines, mono meta labels. Calm, warm, understated. No
gradients, minimal emoji. Copy is warm and human, never corporate. No em dashes.
