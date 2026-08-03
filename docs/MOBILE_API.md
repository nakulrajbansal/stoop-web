# Mobile API boundary (iOS app)

What the native app needs from this codebase, why each piece exists, and the
exact steps to deploy it. Everything here is additive: the web app's behavior,
auth, and routes are unchanged.

Companion repo: `stoop-ios` (Expo + React Native). Bundle ID `house.stoop.app`.

---

## 1. Why any backend change was needed

Every API route authenticated the caller through `@/lib/supabase/server`, which
reads the Supabase session from **browser cookies**. A native app has no cookie
jar, so without a change every mobile request would have been anonymous, which
would silently defeat block filtering on the feed (an anonymous feed request
skips `getBlockedIds`). That is a safety hole, not an inconvenience.

## 2. What was added

### `src/lib/bearer.ts`
Parses `Authorization: Bearer <token>` into three outcomes, not two:

- **absent** — no header at all. A browser request; cookie auth is correct.
- **malformed** — a header was supplied and is not a usable bearer JWT.
- **token** — a well-formed JWT, still to be verified upstream.

The distinction matters. An earlier version returned `null` for both absent and
malformed, so a request that presented a broken credential fell through to
whatever cookies happened to ride along with it and could succeed on an ambient
browser session. A malformed header now fails 401 and never reaches the cookie
path.

### `src/lib/supabase/route.ts` -> `getRouteAuth(req)`
The single auth entry point for API routes:

- **No Authorization header at all** (every browser request): behaves exactly as
  before, cookie session via `@supabase/ssr`.
- **Malformed Authorization header**: rejected, 401. Never downgraded to
  cookies.
- **Bearer header**: builds an anon-key client carrying that token and calls
  `supabase.auth.getUser(token)`, which round-trips to Supabase Auth. A forged
  or expired token fails there. The verified token is then used for the data
  queries, so Postgres sees a real `auth.uid()` and RLS applies as that user.

Service-role credentials are never involved in authentication. Routes that need
to bypass RLS still use `@/lib/supabase/admin` **after** verifying ownership in
code, the pre-existing pattern.

Routes converted: `plans`, `conversations`, `messages`, `unread`, `unread/seen`,
`block`, `reports`, `account`, `avatar`, `welcome`.

### Suspension, and standing that cannot be read

`@/lib/moderation` used to expose a boolean `isSuspended` that answered `false`
when the lookup itself failed — so a Supabase blip let a suspended account keep
posting for as long as the blip lasted. Standing is now three-valued
(`ok` / `suspended` / `unknown`) and `suspensionGate(userId)` fails closed:
403 `account_suspended` for a suspension, **503 `standing_unavailable`** when it
cannot be established.

Applied to every authenticated state-changing route: plans POST/PATCH/DELETE,
conversations POST/PATCH, messages POST, avatar POST, push register POST,
welcome POST.

Deliberately **not** applied to account deletion, block, report, marking a
conversation read, or push revocation. Suspension exists to stop someone
reaching other members, not to trap them in the product or take away the
protective controls while they are under review.

**And the routes are not the boundary.** A suspended member keeps a perfectly
valid Supabase access token until it expires, so every gate above could be
walked around by talking to PostgREST directly — post a plan, open a
conversation, send a message, rename the public profile. 0008 adds
`is_active_member()` and puts it in the WITH CHECK of every direct authenticated
write that publishes or changes something another member can see:

| Policy | Table | Why it is gated |
| --- | --- | --- |
| `Users insert own plans` | plans | publishing |
| `Users update own plans` | plans | editing a live plan; `status = 'removed'` is exempt so a suspended member can still take their own plan down |
| `Joiner starts conversation` | conversations | reaching another member |
| `Poster updates conversation status` | conversations | confirming or declining |
| `Send to own conversations` | messages | reaching another member |
| `Users update own profile` | profiles | name and about are shown next to every plan |

The exact boundary, and it is deliberate: **account deletion, blocking,
reporting, read marks, push revocation and taking your own plan down all still
work while suspended.** Deletion and revocation run through the service role and
never touch these policies; blocks, reports and `conversation_reads` have no
standing condition on them at all; `Users delete own plans` is untouched by 0008.
`is_active_member()` is also true for a caller with no profile row, which is
someone mid-signup — otherwise signup itself would be impossible.

`database-contract.test.ts` asserts each row of that table and each escape route.

### `GET /api/plans/[slug]`
The native equivalent of the `/plan/[slug]` server component: same query, same
block enforcement (404 when either party has blocked the other), plus
`hostPlanCount`, `existingConversationId`, and `canReport` — which is what lets
the app offer Report or block from a plan the viewer has never messaged.

### `PATCH /api/plans`
Editing a plan you posted. `null` and *absent* mean different things: a field
that is not sent is left alone, a field sent as `null` is cleared. That is what
makes "remove the exact time from this plan" possible rather than a no-op.

Ownership is verified before the update **and** re-asserted in the WHERE clause.
A plan that is `expired` or `removed` answers 409 `plan_closed`: editing
something nobody can join any more does nothing useful and reads as if it did.

### `POST /api/reports`
Now does both legs of report-and-block in one request. `alsoBlock: true` records
the block and closes open conversations, and the response says what actually
happened (`blocked: true | false`, plus `blockFailed` when the report filed and
the block did not). The client used to make two calls and swallow the second's
failure, so a member could be told they were safe from someone who had not been
blocked at all.

Who is reported is always derived server side — from a conversation, from a plan
slug, or from a `reportedUserId` that must resolve to a real profile and never
be yourself.

### `GET /api/me`
The caller's own profile plus a suspension check. Read through the admin client
because `blocked_at` is not granted to the API roles (migration 0003). Returns
`403 { code: 'account_suspended' }` for a suspended user so the app fails closed
at launch instead of discovering it one action at a time. `phone_e164` and
`notify_email` are never returned.

A missing row and a failed query are different answers, and this route now says
so at both levels. The profile read already did; the city and neighborhood
lookups did not, so a database failure came back as a 200 with `city: null` and
the app showed a fully signed-up member as having no neighborhood.
`@/lib/location-lookup` tells them apart and a lookup failure is the same
retryable **503 `profile_unavailable`**. A member who genuinely has no
neighborhood is still a 200 with `neighborhood: null`.

Every suspension response across the API now carries
`code: 'account_suspended'` alongside the existing message. Additive field, web
ignores it.

### `supabase/migrations/0008_mobile_contract.sql`

The important one. Migrations 0001-0007 had drifted from the code: a fresh
Supabase project built from them alone was missing `profiles.notify_email`, four
`plans` columns (`slug`, `when_date`, `when_time_specific`, `intent_tags`), the
`blocks` table, the `blocked_user_ids` RPC, and `conversation_reads` — all of
which the running product uses on every request. Production had them because
they were applied by hand; nothing else did, and nothing checked.

0008 closes that gap and adds five things that were never enforced in the
database at all:

1. **Blocks in row level security.** Until now a block was enforced only by the
   HTTP routes. Anyone holding their own Supabase access token could read the
   other person's profile, plans, conversations and messages straight from
   PostgREST, and receive their messages over Realtime, which evaluates the same
   SELECT policies. `is_blocked_with(other)` is now part of the SELECT and
   INSERT policies on profiles, plans, conversations and messages.
2. **Suspension in row level security**, via `is_active_member()`. See the
   suspension section above for the exact set of policies and the escape routes
   that stay open.
3. **An objectionable-language filter**, as `BEFORE INSERT OR UPDATE` triggers on
   plans, messages and profiles. In the database rather than in a route, because
   the website and any anon-key client write to those tables directly.
   `src/lib/text-moderation.ts` mirrors the rule only so the API can answer with
   a readable sentence; `text-moderation.test.ts` fails if the two lists drift.
4. **Atomic transitions with real preconditions.** `resolve_conversation()` locks
   the conversation and then the plan and checks ownership, pending status and
   remaining capacity while both locks are held. The earlier version moved the
   `status = 'pending'` guard into the UPDATE, which stopped two racing confirms
   from both notifying — but it still confirmed *any* pending conversation, and
   0001's trigger decremented `spots_left` with a `GREATEST(0, ...)` floor. A
   one-spot plan with three pending requests confirmed all three and the count
   bottomed out at zero. It now returns `updated`, `already_resolved`, `full`,
   `closed`, `not_found` or `invalid`, and the route maps each one. Declining
   never touches the plan: it consumes no capacity and has to keep working on a
   plan that is full, closed or expired.
5. **Push registration that is actually serialised.** `register_push_token()`
   takes a transaction-scoped advisory lock on the token before it reads
   anything. `SELECT ... FOR UPDATE` locks nothing when the row does not exist,
   which is every first registration of a token, so two accounts registering the
   same token at the same moment both saw "no owner" — and the unconditional
   `ON CONFLICT DO UPDATE` then let the second one take it. The upsert also
   carries the ownership condition itself now, and a zero-row upsert is reported
   as `conflict`.

Also in 0008: `blocked_user_ids(for_user)` is **service-role only**. It takes an
arbitrary user id and answers with that person's block relationships in both
directions — including who has blocked them, which is the one thing the product
promises nobody can see — so granting it to `authenticated` let any signed-in
member enumerate anyone's block graph. Every caller was already a server route
or the cron. And `welcome_emails` plus `claim_welcome_email` /
`mark_welcome_email_sent` give /api/welcome a real idempotency key; see below.

Every statement is idempotent and none drops a table or a column, but **0008 is
not purely additive** — four statements change existing rows, and the file's
header names each one along with the preflight queries to run against a restored
copy of production first. See the deploy section.

`src/lib/database-contract.test.ts` checks the parts a test can check without a
live database: that every table and function the code calls exists in some
migration, that the CHECK constraints match what the API validates, that the
block policies consult `is_blocked_with` and the write policies consult
`is_active_member`, that the capacity check is locked and is skipped for a
decline, that the registration serialises on the token, that no private column
is granted to the API roles, and that the header still describes what the file
actually does.

### Push notifications
- `supabase/migrations/0007_push_tokens.sql` creates `push_tokens`
  (user, Expo token, platform, installation id, app version, created/updated/
  last-used/revoked timestamps). RLS on with **no policies** and grants revoked
  from `anon`/`authenticated`: service-role only, same treatment as phone and
  email columns.
- `src/lib/push.ts` builds and sends Expo push messages.
  **Privacy rule, enforced by tests:** a notification never contains message
  text, plan text, names, emails, or phone numbers. It carries generic copy plus
  `{ kind, path }` so the app can deep link and fetch the real content over an
  authenticated connection.
  Tokens Expo rejects at send time with `DeviceNotRegistered` are **deleted**.
  **Delivery receipts are not polled**, so a token that dies after Expo accepted
  the message is not reaped until that device registers again or the account is
  deleted. That is an operational follow-up, not a finished feature; any claim
  that dead-token cleanup is complete is wrong.
  Every request to Expo carries an `AbortSignal` bounded by
  `EXPO_PUSH_TIMEOUT_MS` (10s), covering the body read as well as the connect. It
  has to: `notifyUser` runs *after* its database transaction has committed, so an
  unbounded fetch does not delay a notification — it holds the member's own HTTP
  response open behind a third party, and the person who just tapped Accept
  watches a spinner. A timed-out chunk becomes error tickets and the remaining
  chunks still go.
- `POST /api/push/register` goes through `register_push_token()` (0008) rather
  than a client-steerable upsert. Both keys the client supplies used to be
  treated as authority: any caller could revoke every row sharing a guessed
  `installation_id`, or point a known Expo token at their own account so that
  person's phone started receiving the caller's notifications. The function
  scopes the same-install revoke to the caller's own rows and returns
  `conflict` (409 to the client) rather than rebinding a token that is live
  under someone else — including when two first registrations race, which the
  advisory lock and the ownership-conditional upsert now cover.
- `DELETE /api/push/register` takes the token in the **body**, not the query
  string. A URL is written to access logs, proxy logs and error trackers along
  the whole path, and a push token is a device credential.

  It has two rules, and the difference between them is the point:

  - **Token AND installation id together are proof of device possession.** Both
    live in that phone's keychain and neither is guessable, so the pair revokes
    that registration whoever owned it. This is what makes a shared phone work.
    The old owner-scoped rule made it unfixable: sign out with no signal, hand
    the phone over, the new account signs in, and the retry matched nothing —
    and the pending record was then deleted anyway, leaving a live registration
    delivering the first person's notifications to a phone that was not theirs.
  - **An installation id on its own stays scoped to the caller's rows**, exactly
    as before, so a guessed one cannot switch off a stranger's notifications. A
    lone token is owner-scoped too: half the pair proves nothing.

  The response is `{ ok, revoked, tokenCleared }`. `tokenCleared` is answered by
  looking — the route re-reads the table — because the pair matches nothing when
  the stored row carries a different installation id, and telling a phone to
  forget a registration that is still live is the bug being fixed. The app keeps
  its pending record unless `tokenCleared` is true.
- Revocation **deletes** the row rather than setting `revoked_at`. The privacy
  policy tells members their notification token is removed when they sign out or
  turn notifications off, and a retained device identifier is exactly what that
  promise is about. Nothing needs the row: a device that registers again inserts
  a fresh one.
- Events pushed: **join request** (new conversation), **reply** (only when the
  recipient has not sent a message in 15 minutes, the same gate the reply email
  already used), **confirmed**. Every send is best effort and wrapped so it can
  never break posting, messaging, or confirming. **Email behavior is unchanged.**

  **Best effort means best effort, and is not exactly-once.** The transaction
  that changes a conversation's status now guarantees that at most one caller
  can notify — no number of racing taps produces a second push or a second
  confirmation email. It guarantees nothing in the other direction: the
  transaction is already committed by the time the send runs, so a process that
  dies in between simply misses the notification. Making that exactly-once needs
  a transactional outbox and a worker draining it. There isn't one, and an
  in-memory retry queue would be a worse lie than the honest gap, because it
  would disappear with the same process. Email is the primary channel.

### Avatar uploads
`POST /api/avatar` used to check two magic bytes (`FF D8`) and store whatever
followed. Those two bytes prefix anything, so the **public** avatars bucket
would serve arbitrary attacker-chosen content under a `.jpg` name, and any EXIF
the phone attached — including the camera's GPS — was stored and served with it.

`src/lib/avatar-processing.ts` now decodes and re-encodes every upload with
`sharp` (pinned to a patched 0.35.x; the libvips CVEs fixed there are exactly
the class of bug that matters when you decode untrusted images). What lands in
the bucket is a JPEG this process produced: no metadata, capped at 640x640 and
400 KB, input pixel-bounded before rasterisation, and anything that is not a
decodable image refused outright.

It does **not** judge what the picture is of. No third-party moderation service
is called and no member photo is sent anywhere for scoring. Reporting is the
control for image content, and the release docs say so.

### `POST /api/welcome`
Took `email` and `name` from the request body and handed them to Resend. Any
signed-in account could post an arbitrary address and an arbitrary display name,
as often as it liked, and Stoop would deliver mail on its behalf with
stoop.house's sender reputation attached — an open relay for one template.

The recipient is the caller's own `notify_email`, read server side. What was
still missing is the "once" part: `WELCOME_WINDOW_MS` bounds the *window*, not
the number of sends, so every call inside the first fifteen minutes delivered
another email and fifty concurrent calls delivered fifty.

`claim_welcome_email()` (0008) is the real bound. It inserts the marker row into
`welcome_emails` and returns `claimed` to exactly one caller; everyone else
contends on the primary key and is told `already_claimed`. The claim is taken
**before** the send, so a crash mid-send cannot become a second email.

Provider failure is handled without re-opening that window:

- The claim is **not** released. We cannot tell a dropped message from a dropped
  connection, and releasing it would put the route back where it started.
- It ages out on its own after five minutes, and `attempts` caps the whole thing
  at five. The 15-minute age check still gates the outside.
- The send carries a Resend **idempotency key** derived from the user id
  (`welcome:<uuid>`), so a retry that races the provider's own recovery still
  delivers one email.
- `sendWelcome` now returns whether the provider accepted it. The SDK reports
  API-level failures in `error` rather than throwing, so a rejected send used to
  look exactly like a delivered one — the route would have marked the account
  welcomed and burned its one send on nothing.

### `DELETE /api/account`
The profile photo lives in a public storage bucket, outside the foreign-key
cascade. Removing it was wrapped in a try/catch described as non-fatal, but
Supabase Storage's `remove()` reports failure by resolving with `{ error }`
rather than throwing, so the catch never fired. A storage outage looked exactly
like a clean delete, the auth user — the row every other delete cascades from —
was destroyed anyway, and the member's face stayed on a public URL with no
account left to retry from.

`@/lib/avatar-storage` checks the result. The photo goes first; an operational
failure answers **503 `avatar_delete_failed`** with nothing irreversible done, so
the caller can simply try again. An object that was never there is success, so
somebody who never uploaded a photo can still delete their account.

### Universal links
`GET /api/apple-app-site-association`, served at
`/.well-known/apple-app-site-association` through a rewrite in `next.config.js`.
A route handler (not a static file) guarantees the `application/json` content
type Apple requires. It returns 404 while `APPLE_TEAM_ID` is unset, so a wrong
association is never published. Paths opened by the app: `/plan/*` and
`/inbox/*`.

---

## 3. Environment variables

| Variable | Where | Required for | Notes |
| --- | --- | --- | --- |
| `APPLE_TEAM_ID` | Vercel + local | Universal links | Apple Developer Team ID, e.g. `A1B2C3D4E5`. Not a secret. Until set, the AASA route 404s. |
| `EXPO_ACCESS_TOKEN` | Vercel | Push, only if enabled | Needed only when the Expo project turns on push security. Leave unset otherwise. |

No new secrets. Push sends use Expo's public endpoint; APNs credentials live in
the Expo project, never in this repo.

---

## 4. Deploy order (each step is a manual gate)

1. **Merge and push** this branch to `main`. Vercel builds and deploys.
   Nothing user-visible changes yet: mobile endpoints exist but no app calls them.
2. **Run migration 0007, then 0008**, in that order, in the Supabase SQL editor.
   Both are safe to re-run.

   - `0007_push_tokens.sql` — until it runs, `POST /api/push/register` returns
     500 and push is simply off; every other route is unaffected.
   - `0008_mobile_contract.sql` — **not optional.** It is what puts block
     enforcement, suspension enforcement and the language filter into the
     database, and what makes a fresh environment match the code. On production
     much of it is a no-op because the columns and tables already exist by hand;
     the parts that are not are the RLS policies, the triggers, the functions and
     the `welcome_emails` table.

   **0008 is not purely additive, and this step is a manual gate for that
   reason.** Four statements change existing rows or can abort the migration:

   - It **backfills** `plans.slug` for every row where it is NULL, then sets the
     column NOT NULL.
   - It **de-duplicates** `plans.slug` before adding a unique index. The oldest
     row of any duplicate group keeps its slug (its URL may already be shared);
     the others get a short suffix, which changes those plans' URLs.
   - It **replaces three CHECK constraints** on `plans` (category, spots_total,
     intent_tags). `ADD CONSTRAINT` validates the existing rows, so a single
     violating row aborts the whole migration part-way through.
   - It **deletes** rows from `plan_feedback` whose `responder_id` no longer
     matches a profile, so a foreign key with `ON DELETE CASCADE` can be added.
     Those are rows belonging to already-deleted accounts — data that account
     deletion should have removed and did not, because the column had no foreign
     key.

   **Run it against a restored copy of production before production.** Postgres
   was not available locally while this branch was written, so nothing here has
   been executed anywhere; a staging run is the only thing that has actually
   tested the SQL. Count what it will touch first — each of the first three must
   return 0, or the matching `ADD CONSTRAINT` will abort:

   ```sql
   select count(*) from plans
    where category not in ('coffee','outdoors','arts','food','books','music','sports');
   select count(*) from plans where spots_total not in (1,2,3);
   select count(*) from plans
    where array_length(intent_tags,1) > 2
       or not (intent_tags <@ array['just-social','dog-friendly','bring-something',
                                    'quiet','loud','free','paid']::text[]);

   select count(*) from plans where slug is null;                  -- will be backfilled
   select count(*) from (select slug from plans
                          group by slug having count(*) > 1) d;    -- will be de-duplicated
   select count(*) from plan_feedback
    where responder_id not in (select id from profiles);           -- will be deleted
   ```

   A non-zero count on one of the first three is not a reason to weaken the
   constraint: it means production holds a value the API would refuse, and that
   row needs a decision before the migration runs.

   After running it, spot-check in the SQL editor:
   ```sql
   select public.contains_blocked_language('a normal plan about coffee'); -- false
   select count(*) from pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') || coalesce(with_check, '') like '%is_blocked_with%';  -- 7
   select count(*) from pg_policies
    where schemaname = 'public'
      and coalesce(with_check, '') like '%is_active_member%';                       -- 6

   -- Every SECURITY DEFINER function here reads a table whose RLS or column
   -- grants the calling role does not have, so they all depend on being owned
   -- by a role that can. That is the same assumption `is_blocked_with` and
   -- `blocked_user_ids` already make, but it is worth confirming once rather
   -- than discovering it as a silent `false` from `is_active_member()`.
   select p.proname, r.rolname as owner, r.rolbypassrls
     from pg_proc p
     join pg_roles r on r.oid = p.proowner
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_active_member','is_blocked_with','blocked_user_ids',
                        'register_push_token','resolve_conversation',
                        'claim_welcome_email','mark_welcome_email_sent');
   ```

   Then, on staging with a real suspended test account, confirm the boundary end
   to end: signed in as that account, a direct PostgREST insert into `plans` or
   `messages` and a direct update of `profiles.name` are all refused, while
   deleting the account, blocking, reporting, marking a conversation read and
   revoking a push token still work.
3. **Set `APPLE_TEAM_ID`** in Vercel (Production, Preview) once the Apple
   Developer account exists. Redeploy. Then verify:
   ```
   curl -i https://www.stoop.house/.well-known/apple-app-site-association
   ```
   Expect `200`, `content-type: application/json`, **no redirect**, and your team
   id in `appIDs`. The app declares `applinks:www.stoop.house` only —
   `stoop.house` 301s to it and Apple does not follow redirects when fetching
   this file, so the apex could never have satisfied an `applinks:stoop.house`
   entry.
4. **Verify the web is unchanged** (see checklist below).
5. Only then point a TestFlight build at production.

## 5. Web regression checklist (run after deploying)

Signed in on the web, in a browser:

- [ ] `/feed` loads plans, city and category filters work
- [ ] `/plan/<slug>` loads, "Message <name>" starts a conversation
- [ ] `/inbox` lists conversations, `/inbox/<id>` sends and receives in realtime
- [ ] Accept and decline still work, confirmation email arrives
- [ ] `/post` publishes a plan and routes to the plan page
- [ ] `/profile` saves, photo upload and remove work
- [ ] Unread badge appears and clears
- [ ] Block from a conversation still hides that person from the feed
- [ ] `/report` submits with "also block" on
- [ ] Delete account works and signs you out

All of these ran through `getRouteAuth`, whose cookie branch is byte-for-byte
the previous code path.

## 6. Rollback

The mobile surface is additive. To disable it without reverting code:

- Push: `delete from push_tokens;`. Sends stop, email keeps working.
- Language filter: `drop trigger plans_reject_blocked_language on plans;` and the
  two matching triggers on `messages` and `profiles`. Nothing else depends on
  them, and `src/lib/text-moderation.ts` will simply stop having a backstop.
- Block RLS: the policies in 0008 replace ones with the same names, so rolling
  back means re-running the corresponding `CREATE POLICY` statements from 0001.
  Note that this puts block enforcement back in the routes only.
- Universal links: unset `APPLE_TEAM_ID` and redeploy. The AASA route 404s and
  links open in the browser again.
- Bearer auth: reverting `src/lib/supabase/route.ts` to only call the cookie
  client disables mobile auth entirely while leaving the web untouched.

---

## 7. What is not done

- **No migration has been run anywhere.** Docker and Postgres were unavailable
  on the machine this branch was written on, so 0008 has never executed. Its
  correctness rests on review and on `database-contract.test.ts`, which reads the
  SQL as text. The staging run in step 2 of the deploy order is the first real
  test of it and is a hard gate, not a formality.
- **Notifications are best effort, not exactly-once.** At most one send per
  status change is guaranteed; a missed one after a process death is not
  prevented. A transactional outbox and a worker would be the real fix. See the
  push section.
- **Expo delivery receipts are not polled.** See the push section above. Tokens
  rejected at send time are deleted; tokens that die later are not.
- **Text moderation is a blocklist.** It runs in the database so it cannot be
  bypassed by a direct client, and it is deliberately narrow so ordinary posts
  are not rejected. It will not catch novel phrasing. Report review is the
  control.
- **Image content is not classified.** Uploads are made safe, not judged.
- **43 legacy `any` casts remain in the web page components.** They are ESLint
  warnings, not errors: `src/lib`, `src/app/api` and `src/types` are held to
  `error` and are at zero. The page components were written before the schema
  types worked and are not this branch's to rewrite.
