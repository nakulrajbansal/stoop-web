# Seeding the feed (the launch week playbook)

> Status, August 2026: this is a playbook, not a report. Nothing in this file has
> been carried out yet. The supply gate below is unmet until the founder says
> otherwise, and no code in this repo creates plans.

The rules (from DECISIONS.md, non-negotiable):
- ONE neighborhood. The one you live in. Density beats spread. The default launch
  wedge is Williamsburg; Greenpoint stays browseable but does not get equal
  acquisition effort until Williamsburg clears the gate.
- REAL plans only, posted by you and friends, that you would actually host if
  someone joined. No fake profiles, no staged full plans, ever.
- 1 spot each. Small plans genuinely fill, which puts real "Full" badges in the
  feed within days. That is the honest scarcity signal.
- Spread across the week: two plans today/tomorrow, the rest across 5 or 6 days,
  so the feed's date column looks alive top to bottom.
- Everyone who posts becomes a Founding member automatically (first 50).
- Every plan now has to meet the clarity contract anyway: activity, date, exact
  time, public meeting point, group size, and cost. The composer will not publish
  without them, so a seeded plan is a complete plan by construction.

## The supply gate (August 2026)

Acquisition is gated on real inventory, because explaining the product better
cannot substitute for having plans in it.

- **Green**: 5 or more real open plans, from at least 3 distinct hosts, spread
  across at least 3 different days in the next week. Broad outreach is allowed.
- **Yellow**: 2 to 4 real open plans. Recruit hosts only. Do not recruit general
  joiners into a board they cannot use.
- **Red**: 0 or 1 real open plan. Pause broad outreach entirely and seed through
  founder and trusted-host plans.

Check the status on `/admin/metrics` (plans posted in the last 7 days, complete
plans, repeat hosts) and on the neighborhood page itself before each outreach
batch, and write the colour down in the growth operations record. Never create
inventory to reach a threshold: in a hyperlocal product, staged activity is
discoverable by neighbors and fatal.

Ask hosts to share their plan link with people who already know them before it
goes anywhere colder. A first joiner who is a friend of the host is a real
meeting; a first joiner from a cold channel, on an empty board, usually is not.

## Ten ready-to-paste plans

Written in the product voice (lowercase, like texting a friend). Replace the
[bracketed] spots with real places in your neighborhood before posting. Each
takes about 60 seconds on /post: paste text, pick category + day + time, set
the spot, 1 spot open, publish.

1. coffee: "getting a flat white at [coffee shop] saturday morning before the
   market gets busy, come sit"
2. outdoors: "slow loop around [the park] sunday at 9, the kind of pace where
   you can actually talk"
3. sports: "hitting the pickleball courts at [park] thursday after work, i
   have paddles, zero skill required"
4. food: "trying the new taco spot on [street] friday night, ordering too much
   on purpose"
5. books: "reading in [the park] sunday afternoon, bring whatever you're in
   the middle of, silent hour then coffee"
6. arts: "wandering [gallery or museum] saturday around 2, i go slow and read
   every caption, consider yourself warned"
7. music: "there's a free show at [venue] wednesday night, going alone unless
   someone joins"
8. coffee: "coffee walk tuesday 8am before work, one big loop, back by 9"
9. outdoors: "golden hour walk along [the waterfront] thursday, i bring the
   playlist"
10. food: "bagel run sunday 10am, we eat them on the bench like it's a whole
    event because it is"

## The friend recruiting text (copy-paste)

> hey, i launched stoop (stoop.house), a little neighborhood site where you
> post a plan you're already doing this week and up to 3 neighbors can join.
> two minute favor: sign up and post ONE real plan you're doing this week,
> anything, coffee counts. the first 50 posters get a permanent founding
> member badge. that's the whole ask.

Three or four friends posting one plan each, plus five or six from you across
the week, and the feed reads as a living neighborhood by Sunday.

## What happens automatically once plans exist
- Feed, landing, city, and neighborhood pages fill with real content.
- Every post pings Bing/DuckDuckGo (IndexNow) with the plan and its pages.
- Google gets real SocialEvent data on every plan page.
- Joins trigger the email loop; confirmed plans get the day-after follow-up
  (once migration 0005 + CRON_SECRET are live).
- Posters get the Founding badge on the spot.
