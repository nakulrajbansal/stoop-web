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

## The minimum plan clarity contract (settled August 2026)
Feedback that started it: "I have to sign up, but it is not clear what I can expect,"
and plans vague enough to be unevaluable ("let's meet"). Every NEW plan, and every
legacy plan that gets edited, must carry six facts: the activity, the date, an exact
time, a public meeting point, the group size, and a cost expectation
(`free`, `pay-own-way`, `ticket-required`).
- There is no publishable "no time" any more. "Sometime Saturday" is exactly the
  vagueness that makes a stranger's plan unjoinable.
- The meeting point must be public: a cafe, a venue, a park entrance, a landmark.
  Home addresses are prohibited by copy and policy, NOT by a geocoder. We do not try
  to validate a real-world address; a brittle check would give false confidence.
- Exact location stays PUBLIC for this release. A plan cannot be evaluated without it,
  and hiding it until confirmation would trade a real safety measure (public places)
  for a theatrical one.
- Cost is stated, never processed. Stoop takes no payment and sells no tickets.
- Rules live in `src/lib/plan-contract.ts` and are enforced on the server. Client
  validation is convenience; `/api/plans` rejects an incomplete contract with 400.
- Plans posted before the contract stay readable. The editor asks for the missing
  pieces when they are next saved, and no cost is invented for a plan that never
  stated one.
- This is six fields and a summary, not an event builder. No organizer pages, no
  ticketing, no RSVP list. That line is the difference between Stoop and Meetup.

## Identity is visible inside a plan, never in a directory (settled August 2026)
"Not clear whether I can preview my stoopers upfront" is a real objection, and the
answer is not profile browsing.
- **Public, before signup**: the host's first name, photo or initials, neighborhood,
  their one line about themselves, the Founding badge when earned, and how many plans
  they have hosted once that is 2 or more.
- **Private to the host**: the requester's first name, photo, neighborhood, one line,
  prior-plan count and opener, shown above Accept and Decline inside that conversation.
  Never attached to a public plan response.
- **Private to the group**: the confirmed roster, visible only to the host and the
  people they confirmed, through `/api/plans/[id]/participants`. Pending, declined and
  withdrawn people are never in it, blocks are enforced, and it is fetched after sign
  in rather than server rendered, so unauthorized HTML cannot contain a name.
- Still not built and still not wanted: a member directory, profile pages, swiping,
  any public attendee list.

## The four request states, and withdrawal (settled August 2026)
`Pending`, `Confirmed`, `Declined`, `Withdrawn`, named identically in the plan page,
the inbox, the thread and the emails (`src/lib/conversation-lifecycle.ts`).
- Messaging is never described as acceptance. "Conversation started. No spot is
  reserved."
- A requester can withdraw while pending and can leave a confirmed plan before it
  happens. A host cannot withdraw someone; the host declines.
- Capacity is Postgres's job, not the application's. The transition happens inside one
  transaction under a plan row lock, so a confirmed withdrawal restores exactly one
  spot, a double withdrawal restores none, and two simultaneous confirmations on the
  last spot cannot both succeed. The old trigger clamped the decrement at zero, which
  silently overbooked.
- The lifecycle functions are service-role only. The routes verify the user themselves
  (auth.uid() is unreliable here) and then call through the admin client. A
  SECURITY DEFINER function that any client could call with any actor id would be a
  way to confirm yourself into someone else's plan.
- **Clients cannot write a status at all.** UPDATE on conversations is revoked from anon
  and authenticated, and a BEFORE UPDATE trigger refuses any status change that is not
  made by service_role or from inside the lifecycle functions. Without that, the RLS
  policy from 0001 let a host set a withdrawn request back to confirmed straight from
  the browser, reinstating somebody who left with no email and no consent. An external
  review reproduced exactly that against Postgres under Supabase's stock grants.
- **A withdrawn person can ask again, once, on purpose.** They write a new opener, the
  row goes back to pending through a service-only function, and the host is emailed with
  the fact that this person left earlier. `withdrawn_at` is kept and `reopened_at` and
  `reopen_count` are recorded, so the history is auditable rather than rewritten. The cap
  is one: leaving and re-asking must not become a way to pester a host.
- **A decline is final for that plan.** The host said no; offering the same person a
  re-ask button would turn a decline into an invitation to keep asking. The plan page
  says so plainly and points them at other plans. This is the one place the roadmap's
  "new explicit request" language is deliberately narrowed to withdrawals only.
- Pressing Message on a plan you already left does nothing on its own. The client has to
  ask for the re-request explicitly, and the API answers 409 otherwise, so nobody is
  silently put back in front of a host they walked away from.
- **A request and its opening message are one transaction.** They were briefly two
  statements, which meant a failed message insert could leave a pending request with
  nothing in it: the host sees somebody waiting and no reason why, and a re-request has
  already spent its one allowed reopen. Both writes now happen inside
  `start_or_reopen_conversation`, which is also the only path into pending. A separate
  function that moved the state without the opener would be the same bug again.

## Design language
Editorial / print aesthetic, not typical-startup. Rebranded July 2026 to the neighborhood
noticeboard direction: cream #F0EBE1, ink #14110D, civic green #2F6B3F (accent), mustard
#8A681E (emphasis), danger red #B3402A (errors/delete only), sage #2A4232 (success).
Serif (Fraunces) headlines, mono meta labels. Copy never defines Stoop against dating apps. Calm, warm, understated. No
gradients, minimal emoji. Copy is warm and human, never corporate. No em dashes.

## Founding member badge (settled July 2026)
- The first 50 members who PUBLISH A PLAN automatically become Founding members
  (profiles.is_founding_member, granted in /api/plans POST, permanent). Posting is the
  qualifying act, not signing up: the scarce thing on Stoop is hosts.
- Advertised on the post page, both empty feeds, and the landing example panel. The
  just-posted banner celebrates it.
- SEEDING RULE (reaffirmed): seed with REAL plans from the founder and friends, small spot
  counts (1) so some genuinely fill. NEVER fake profiles or fake full plans; in a
  hyperlocal product, staged activity is discoverable by neighbors and fatal to trust,
  and it poisons metrics, the digest, follow-ups, and the SocialEvent SEO data.
