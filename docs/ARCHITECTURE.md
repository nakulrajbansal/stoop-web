# Architecture & Operations

Full technical reference for Stoop. The root `CLAUDE.md` is the quick brief; this is the depth.

## Stack
- **Next.js 15**, App Router, server components by default. TypeScript.
- **Supabase**: Postgres database, Auth (phone OTP), Realtime (used for live chat messages).
- **Twilio Verify**: the SMS provider configured inside Supabase Auth -> Providers -> Phone.
  Supabase calls Twilio to send and verify OTP codes. Twilio Lookup is used to block VOIP
  numbers at signup so people can't use Google Voice / Burner.
- **Resend**: transactional email. SDK in `src/lib/resend.ts`.
- **Vercel**: hosting + CI. Push to `main` triggers a build and deploy.
- **Cloudflare**: DNS only. All records must stay "DNS only" (gray cloud). Proxying (orange
  cloud) breaks Vercel's SSL and redirects. Do not enable it.

## Auth flow (phone-only)
1. User enters phone. Client calls Supabase `signInWithOtp({ phone })`.
2. Supabase (via Twilio Verify) texts a code.
3. User enters code. Client calls `verifyOtp({ phone, token, type: 'sms' })`.
4. If the profile row exists, go to feed. If not, show the profile-completion step
   (name, city, neighborhood, about, MANDATORY notify_email) and insert the profiles row.

## Critical gotchas (each one cost real debugging time)
1. **Supabase URL**: `NEXT_PUBLIC_SUPABASE_URL` must be the bare project URL
   (`https://<ref>.supabase.co`). NEVER append `/rest/v1`. This broke the build twice.
2. **auth.uid() is NULL in API routes**: Supabase SSR does not propagate the JWT to Postgres,
   so RLS policies keyed on `auth.uid()` evaluate as null inside route handlers. PATTERN:
   get the user with `supabase.auth.getUser()`, verify ownership in code (compare ids), then
   perform the mutation with the ADMIN client from `@/lib/supabase/admin` (service role).
   Used by: plan edit/delete, blocks, account deletion. Do not depend on auth.uid() in routes.
3. **Build-error suppression**: `next.config.js` sets `typescript.ignoreBuildErrors: true` and
   `eslint.ignoreDuringBuilds: true`. Type/lint errors will NOT fail the build. Still write
   correct types. Supabase's generated types are weak and sometimes infer `never`; use a
   narrow `as any` cast only where the inference genuinely fails, not as a habit.
4. **serverExternalPackages: ['twilio']** is set in next.config.js. Keep it.
5. **Date/timezone**: NEVER recompute a plan's day label on the server. Vercel runs in UTC,
   so a plan the user picked as "Thursday" gets relabeled "Tomorrow" if computed server-side
   near a date boundary. The CLIENT computes the label in the browser timezone and sends it
   as `whenDayLabel`; the server stores it verbatim. Same caution for expiry — prefer a
   generous buffer over recomputing local day boundaries server-side.
6. **Resend FROM address**: `hi@stoop.house` (NOT `.co` — that was an old fallback bug that
   sent from an unverified domain and failed silently). System emails:
   `Stoop <hi@stoop.house>`. Person-to-person alerts: `[Name] at Stoop <hi@stoop.house>`.
   `hi@stoop.house` must remain a real, monitored inbox (replies and bounces land there).
7. **Email is non-fatal**: every send is wrapped in try/catch. A failed email must never
   break the user-facing flow (posting, messaging, confirming).

## Data model (key tables)
- **profiles**: `id` (= auth user id), name, phone_e164, phone_verified_at, city_id,
  neighborhood_id, about, initials, avatar_bg, avatar_fg, notify_email, is_founding_member.
- **plans**: id, slug (unique; used in URLs), user_id, text, category, spot, when_day,
  when_date, when_time, when_time_specific, spots_total, spots_left, status, intent_tags
  (text[]), expires_at, created_at. status ∈ open | full | expired | removed.
- **conversations**: id, plan_id, poster_id, joiner_id, status ∈ pending | confirmed | declined.
- **messages**: id, conversation_id, from_user_id, text, created_at.
- **conversation_reads**: (user_id, conversation_id, last_seen_at). Powers the unread badge.
  A message is "unread" if it's newer than last_seen_at and not sent by the viewer.
- **blocks**: id, blocker_id, blocked_id (unique pair), created_at. Plus RPC
  `blocked_user_ids(for_user)` (SECURITY DEFINER) returning both-direction blocked ids.
  Always read via `getBlockedIds()` in `@/lib/blocks`.
- **reports**: report queue (being built — see SAFETY_SPEC.md).
- **cities / neighborhoods**: cities have many neighborhoods; all user/plan data carries
  city_id. NYC and Austin only at launch.

## Routing & conventions
- Plan URLs use SLUGS: `/plan/[slug]`. Slugs auto-generated via `slugify()` in `utils.ts`.
- Key client pages: `/feed`, `/post`, `/inbox`, `/inbox/[id]` (chat), `/my-plans`, `/profile`, `/auth`.
- Key API routes: `/api/plans` (GET feed, POST create, PATCH edit), `/api/conversations`
  (GET list, POST create, PATCH confirm/decline), `/api/messages` (POST send),
  `/api/welcome` (welcome email), `/api/unread` + `/api/unread/seen`, `/api/block`,
  `/api/account` (delete).
- **Block enforcement must be applied at EVERY surface that surfaces users or plans**:
  feed query (`/api/plans` GET), conversation creation (`/api/conversations` POST),
  message send (`/api/messages` POST), and the plan detail server fetch (`/plan/[slug]`).
  Both directions matter; `getBlockedIds()` returns both. A missed filter is a safety hole.

## Visual system (Aug 2026 storytelling pass)
The palette, the fonts and the copy rules are unchanged; what was added is a drawing
vocabulary, three photographs and a small amount of motion. Provenance and the rules
photography lives under are in `docs/VISUAL_ASSETS.md`.

- **`src/components/CategoryArt.tsx`**: one hand-authored SVG per category (all seven),
  `currentColor`, no icon runtime. Colour comes from `.cat-{category}` in `globals.css`,
  which sits next to the matching `.tag-{category}` pill so a drawing and its label
  cannot disagree. **Decorative by default** (`aria-hidden`), because most surfaces that
  use it already write the category out; pass `label` only where the art is the only
  thing carrying the meaning. Two surfaces do: the homepage's featured rows and the
  composer's pre-publish summary, both of which get their word from `categoryLabelOf`.
  That helper answers `null` for a stored category we no longer draw, so a legacy row
  still gets the fallback picture but is never named out loud as something it is not.
  Sized in **px**, never in percentages: a percentage collapses to zero inside a flex
  row, which is exactly how the drawings once vanished on the homepage while still
  rendering in a column.
- **`src/components/StoopArt.tsx`**: the noticeboard vocabulary (a pinned card, a
  conversation, a host deciding, a table for four, an empty board, an unplugged line).
  Each drawing carries `data-art="..."`, which is how tests hold the feed's three states
  apart. The empty board and the outage plug are deliberately different pictures: an
  outage must never look like zero supply. The whole outage state (headline, drawing,
  explanation, retry, and the link to post anyway) is **one** `role="alert"` in the
  headline slot, with nothing rendered in the list below it. Splitting the headline from
  the body meant a screen reader heard "that is a problem with Stoop" without ever
  hearing what had gone wrong; a second region would announce twice.
- **`src/components/CapacityMeter.tsx`**: segments plus the sentence. The segments are
  always `aria-hidden`; the sentence (`capacityLabel`) is the fact, and it is the wording
  the plan page already used. Both readings clamp the total to `GROUP_SPOTS_MAX` (3), so
  a corrupt row cannot print "9 of 9 spots open" beside three drawn segments.
- **`src/components/Photograph.tsx`**: the only way a photograph reaches a page. Takes a
  record from `src/lib/photos.ts` (local file, intrinsic size, alt, caption, blur, credit)
  and renders `next/image` in **`fill`** mode with real `sizes` and an aspect-ratio box.
  It is the box, not the intrinsic size, that reserves the layout: `fill` takes no width
  or height, and the recorded dimensions document the file and pick an honest ratio.
  The caption "Photograph, not a plan" is **mandatory and has no prop to disable it**;
  a dark panel restyles it with `captionClassName`. Photography is homepage-only;
  `src/lib/photos.test.ts` scans the tree (including `src/app/[city]/[hood]/`) and fails
  if a photo appears on a plan, feed, inbox or profile surface, or if alt text starts
  implying a member, and `Photograph.test.tsx` renders the component to prove the caption
  is in the document rather than only in the data.
- **`src/components/JsonLd.tsx` + `src/lib/json-ld.ts`**: the one authority for structured
  data, and the only way a block reaches a page. `serializeJsonLd` rewrites `<` and `>` as
  the JSON escapes `\u003c` and `\u003e` (plus U+2028 and U+2029) **after**
  `JSON.stringify`, because plan text is user-authored and a plan containing `</script>`
  would otherwise close the element it is embedded in. Every replacement is a legal JSON string escape, so the payload parses
  back to the original object and a crawler still reads exactly what the host wrote.
  **Every JSON-LD block in the app now goes through it**: the three on the homepage, the
  `SocialEvent` on `src/app/plan/[slug]/page.tsx`, the `BreadcrumbList` on
  `src/app/[city]/page.tsx`, the `BreadcrumbList` and plan `ItemList` on
  `src/app/[city]/[hood]/page.tsx`, and the `Article` on `src/app/guides/[slug]/page.tsx`.
  The plan block was the exploitable one: `name` is raw plan text, `location.name` is the
  raw meeting spot, and neither is filtered anywhere on the way in. The neighborhood
  `ItemList` carries plan slugs, which are built from plan text; `slugify` happens to strip
  everything outside `[a-z0-9-]` on write, but that is a second layer and not the reason the
  block is safe. `src/app/structured-data.test.tsx` renders the component through
  `renderToStaticMarkup`, hands the markup to a real HTML parser, and also walks every file
  under `src/app`, failing on a hand-written `ld+json` script or a `JSON.stringify` fed to
  `dangerouslySetInnerHTML`. The only hand-written inline script left in the tree is the
  referrer shim in `layout.tsx`, which inlines a compile-time constant and carries no
  runtime value.
- **`src/components/FaqList.tsx`**: native `details`/`summary`. Answers stay in the DOM
  while closed, so the visible FAQ and the FAQPage structured data still describe the
  same page. The question is an `h3` **inside** the summary. A summary maps to a button
  and some browsers present a button's children, so whether that `h3` reaches the heading
  outline is browser-dependent; the accessible name and the keyboard behaviour are not.
  The alternatives (wrapping `details` in the heading, or a visually hidden duplicate)
  are worse, and the reasoning is written out in the component.
- **Motion** lives in `globals.css`: `stoop-rise` and `stoop-rise-art`, entrance only,
  `both` fill, opacity and transform only (nothing that reflows), plus `.lift` for
  hover/focus. The `prefers-reduced-motion` block names `.rise`, `.rise-art`,
  `.lift:hover`, `.lift:focus-within` and `.meter-seg` explicitly and sets them to their
  finished state; only `.spinner` is allowed to loop. The two `.lift` selectors must stay
  identical to the live rule (they drifted once, and pointing at a tile still moved it).
  `src/lib/visual-system.test.ts` parses the stylesheet and enforces all of that: that no
  keyframe animates a layout property, that every state the lift moves on is cancelled,
  and that no entrance delay class is defined without an element wearing it.

## Supabase query-builder pattern (avoid the orphaned-chain bug)
Build the base query ending in `.order().limit()`, then apply conditional filters as
separate reassignments. Do NOT insert an `if` block in the middle of a chain — it strands
the `.order()/.limit()` and throws a syntax error.
```ts
let query = supabase.from('plans').select(...).eq('status','open')
  .gt('expires_at', new Date().toISOString())
  .order('created_at', { ascending: false }).limit(60);
if (cityId) query = query.eq('city_id', cityId);
if (category) query = query.eq('category', category);
if (blockedIds.length) query = query.not('user_id','in', `(${blockedIds.join(',')})`);
```

## Email system
- Templates + send functions in `src/lib/resend.ts`. Editorial style (cream/serif/coral,
  inline CSS only — Gmail strips `<style>` tags). An `escape()` helper guards against XSS.
- Functions: `sendWelcome`, `sendMessageAlert` (new join), `sendReplyAlert` (reply, only if
  recipient inactive 15+ min to avoid spam), `sendConfirmed`.
- Triggers: welcome on signup (`/api/welcome`); join alert in conversations POST; confirm
  alert in conversations PATCH; reply alert in messages POST.
- Deliverability: keep onboarding in waves to warm the domain; DMARC currently p=none,
  tighten to p=quarantine after a few clean weeks; test with mail-tester.com (aim 9-10/10).

## Operations / deploy
- Deploy = `git push origin main`. Vercel auto-builds. NEVER deploy from Claude Code.
- Env vars live in Vercel project settings and local `.env.local`. Keys: Supabase URL +
  anon key + service role key, Resend API key, NEXT_PUBLIC_APP_URL, Twilio creds.
- **Twilio trial blocker**: a trial account can only SMS verified numbers (error 21608 on
  real signups). The account must be upgraded (add billing) before recruiting users.
- DNS records (Cloudflare, all DNS-only): root CNAME -> Vercel, www CNAME -> cname.vercel-dns.com,
  SES MX, one DMARC TXT (only one — two breaks DMARC), DKIM (resend._domainkey), SPF, Vercel verify TXT.
