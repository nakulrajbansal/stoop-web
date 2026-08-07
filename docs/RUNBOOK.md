# Runbook — Operational Procedures

Task-based operational knowledge for Stoop. ARCHITECTURE.md is how the system is built;
this is how to operate, deploy, debug, and verify it. Checklists, not theory.

## Deploy
- Deploy = `git push origin main`. Vercel auto-builds and deploys. Nothing else.
- Claude Code edits and commits; I push. Claude Code must NEVER deploy.
- A build takes ~1-2 min. Watch it in the Vercel dashboard.
- If a build fails, the Vercel log names the file and line. Common causes we've hit:
  duplicate imports, orphaned Supabase query chains (see ARCHITECTURE.md query pattern),
  missing files that something imports, useSearchParams not wrapped in Suspense.

## Environment variables (Vercel project settings + local .env.local)
Inventory (names; values live in Vercel / .env.local, never commit them):
- NEXT_PUBLIC_SUPABASE_URL  (bare project URL, NO /rest/v1)
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY  (server-only; powers the admin client)
- RESEND_API_KEY
- RESEND_FROM_EMAIL  (should resolve to hi@stoop.house; code falls back to it)
- NEXT_PUBLIC_APP_URL  (https://stoop.house)
- Twilio creds as required by the Supabase phone-auth provider config
When adding an env var: add it in Vercel, then redeploy (env changes need a fresh build).

## Twilio (UPGRADED as of July 2026; trial restriction is gone)
The account is off trial; real signups work. Per-OTP cost ~ $0.05-0.08.
If OTPs ever stop arriving again, check IN THIS ORDER:
1. Twilio Console -> Monitor -> Logs (delivery errors, account balance).
2. Account balance: keep auto-recharge on so OTPs never fail on an empty balance.
3. Supabase Auth logs (Auth -> Providers -> Phone still pointed at the Verify service).
Historical note: error 21608 means a trial account tried to text an unverified number.
That was the state before July 2026 and should not recur now the account is upgraded.

## Email deliverability (avoid the spam folder)
- DNS (Cloudflare, all "DNS only"): SPF (send.stoop.house TXT v=spf1 include:amazonses.com ~all),
  DKIM (resend._domainkey TXT), exactly ONE DMARC (_dmarc TXT, v=DMARC1; p=none;
  rua=mailto:hi@stoop.house). TWO DMARC records breaks DMARC entirely — keep only one.
- Confirm all green in resend.com -> Domains -> stoop.house.
- TEST: send to a mail-tester.com address (easiest: sign up a test account using their address,
  which fires the welcome email), aim for 9-10/10. It flags any SPF/DKIM/DMARC failure.
- Reputation: onboard in WAVES, not all at once, while the domain is new. After a few clean
  weeks, tighten DMARC to p=quarantine.
- hi@stoop.house must stay a real, monitored inbox (replies + bounces land there).

## DNS records (Cloudflare — all DNS only / gray cloud)
- stoop.house          CNAME  -> Vercel project target
- www.stoop.house      CNAME  -> cname.vercel-dns.com   (+ add www in Vercel -> Domains, redirect to apex)
- send.stoop.house     MX     -> feedback-smtp.us-east-1.amazonses.com
- send.stoop.house     TXT    -> v=spf1 include:amazonses.com ~all
- resend._domainkey    TXT    -> (DKIM key from Resend)
- _dmarc               TXT    -> v=DMARC1; p=none; rua=mailto:hi@stoop.house   (ONLY ONE)
- _vercel              TXT    -> Vercel domain verification
NEVER enable Cloudflare proxy (orange cloud) on these — it breaks Vercel SSL/redirects.

## Profile photos (avatars)
- Photos live in the Supabase Storage bucket `avatars`, one file per user at
  `{userId}.jpg`, public read. The app CREATES this bucket automatically on the first
  upload (`/api/avatar`); no manual setup.
- All writes go through `/api/avatar` (auth-checked, 2 MB max, JPEG only, admin client).
  Users can only ever write their own file. Account deletion removes the file.
- Display is `src/components/Avatar.tsx` everywhere; initials are the fallback, so a
  missing photo is never an error.
- If a photo looks stale after an upload, it is browser cache (5 minute TTL on the
  storage object); a hard refresh clears it.
- Moderation: if a photo is reported, delete the object in Supabase Storage ->
  avatars; the profile instantly falls back to initials.

## Weekly digest ("This week on your stoop")
- WHAT: Sunday 22:00 UTC (5/6pm ET) cron hits /api/digest, which emails each member
  whose CITY has at least one open plan (up to 6, soonest first, blocks respected,
  own plans excluded). Never sends an empty digest. Unsubscribe link goes to
  /unsubscribe (confirm-button page; sets profiles.digest_opt_out_at).
- ACTIVATION (it ships dark until BOTH are done):
  1. Run migration 0004 in the Supabase SQL editor.
  2. Add CRON_SECRET in Vercel (any long random string) and redeploy. Vercel's cron
     automatically sends it as a bearer token; the route refuses everything else.
- TESTING (safe): while signed in as the admin, open /api/digest for a DRY RUN
  (JSON of who would get what; sends nothing), /api/digest?preview=1 to see the email
  HTML, /api/digest?send=1 to actually send once manually.
- Note: the cron and a same-day manual ?send=1 will both send; there is no dedupe at
  this scale. Do not manually send on Sundays.

## Post-plan follow-up ("How was it?")
- WHAT: daily 16:00 UTC (11am/12pm ET) cron hits /api/followup. For every
  conversation that was CONFIRMED for a plan whose day was YESTERDAY, both the
  host and the joiner get one email asking how it went. The email has a single
  link to /followup, where one tap records great / fine / no-show (stored in
  plan_feedback, service-role only). Hosts whose plan filled also get a "post
  another" nudge. Each conversation is marked (followup_sent_at) so nobody is
  ever asked twice.
- ACTIVATION (ships dark until BOTH are done):
  1. Run migration 0005 in the Supabase SQL editor.
  2. CRON_SECRET set in Vercel (same secret as the digest; if the digest is
     already live, there is nothing extra to do).
- TESTING (safe): while signed in as the admin, open /api/followup for a DRY RUN
  (JSON of what would send, sends nothing), /api/followup?send=1 to send once
  manually. To test end to end: confirm a conversation on a plan dated
  yesterday, then run ?send=1.
- READING RESULTS: plan_feedback table in Supabase (rating per person per
  conversation). No-show data feeds the group-size decision in DECISIONS.md.

## Neighborhood pages and SEO
- /nyc and /austin list neighborhoods with open-plan counts; /nyc/williamsburg
  style pages list a neighborhood's open plans. These are the QR-card landing
  targets. Pages are cached up to 5 minutes; a just-posted plan can take that
  long to appear there (the /feed page is always live).
- /sitemap.xml (all city + neighborhood pages) and /robots.txt are generated by
  the app. After launch, submit the sitemap once in Google Search Console.
- KEYWORDS the pages target (July 2026 SEO layer): landing = "meet neighbors" /
  "make friends in NYC / Austin"; city pages = "make friends in {city}";
  neighborhood pages = "things to do in {neighborhood} this week" and "meet
  people in {neighborhood}". Structured data: FAQPage + WebSite on the landing,
  BreadcrumbList + ItemList on city/neighborhood pages, SocialEvent on every
  dated plan page. Verify with Google's Rich Results Test after big changes.
- HONEST EXPECTATION: rankings need weeks plus real content and inbound links.
  The single biggest SEO lever is seeded plans (pages with real events beat
  empty ones) and a handful of local links (neighborhood newsletters, local
  subreddits, community boards).
- FOUNDER STEPS, one time: (1) add the site in Google Search Console (domain
  property, DNS verification in Cloudflare), (2) submit
  https://www.stoop.house/sitemap.xml there, (3) request indexing for /, /nyc,
  and /austin.
- INDEXNOW (Bing + DuckDuckGo, live since July 2026): the key file lives in
  /public (4abc...b07.txt) and src/lib/indexnow.ts pings api.indexnow.org
  automatically every time a plan is posted (plan URL + feed + city +
  neighborhood pages). Bing already had stoop.house indexed as of 2026-07-16.
  No founder action needed. If the key is ever rotated, change BOTH the file
  name/content in /public and the constant in src/lib/indexnow.ts.
- GUIDE PAGES: /guides/how-to-make-friends-in-nyc and -austin are evergreen
  content targeting the highest-intent keyword. Linked from the landing footer
  and city pages. Add more guides by extending GUIDES in
  src/app/guides/[slug]/page.tsx (and the sitemap list).

## Supabase admin tasks (SQL Editor)
- Clear OTP rate limits during testing: DELETE FROM otp_attempts;  (table name may vary)
- Plan expiry housekeeping runs via pg_cron hourly (expire_old_plans()).
- Migrations from a build push: run the SQL in the SQL Editor BEFORE pushing the code that
  depends on it, so the deployed code doesn't hit missing tables/columns.
- EXCEPTION, migration 0003 (privacy hardening): run it AFTER the July 2026
  "profile photos + privacy" deploy is live. It restricts which profile columns the
  API can read, and the pre-existing code still read notify_email the old way. The
  migration file itself says the same thing at the top.

## Uncertainty-reduction rollout (August 2026, NOT YET RUN)

Three migrations, in this exact order, with the deploy in the middle. This is an
expand / deploy / contract rollout: the first two files only ADD things and are
safe while the currently deployed release is serving, and the third one closes
the old paths once nothing uses them.

### Step 1, predeploy (expand). Run both, in this order:

1. `supabase/migrations/20260805210000_plan_clarity_contract.sql`
   Adds the nullable `plans.cost_expectation` and backfills only plans tagged
   "Free" and not "Costs money". Nothing else is inferred.
2. `supabase/migrations/20260805211500_conversation_withdrawal.sql`
   Adds the `withdrawn` state and the re-request columns, adds
   `profiles.display_name` (first name only) and GRANTS it to anon and
   authenticated, replaces the capacity trigger, and creates the service-role
   functions: `confirm_conversation`, `withdraw_conversation`,
   `start_or_reopen_conversation`, `send_conversation_message`,
   `block_and_close`.

Nothing here revokes anything. The deployed release keeps creating
conversations, inserting messages, updating a status directly and reading
`profiles.name` exactly as it does today. Verified by
`supabase/rehearsal/04_expand_state_probes.sql`.

### Step 2, deploy the reviewed commit

Push the reviewed SHA and wait for Vercel to finish. The new code reads
`display_name` (granted in step 1) and writes only through the functions
(created in step 1), so it is correct the moment it is live.

### Step 3, postdeploy (contract). Run after the deploy is serving:

3. `supabase/migrations/20260806090000_postdeploy_boundary_hardening.sql`
   Revokes `SELECT (name)` from anon and authenticated, drops the two 0001 INSERT
   policies and revokes INSERT on `conversations` and `messages`, revokes UPDATE
   on `conversations`, and adds the guard trigger. Safe to run more than once.

Do not run step 3 before step 2. Every statement in it breaks the previous
release on purpose, and running it early is an outage rather than a hardening.

### Verification, after step 3

```sql
SELECT has_column_privilege('anon','public.profiles','name','SELECT');          -- false
SELECT has_column_privilege('anon','public.profiles','display_name','SELECT');  -- true
SELECT has_table_privilege('authenticated','public.conversations','INSERT');    -- false
SELECT has_table_privilege('authenticated','public.messages','INSERT');         -- false
SELECT has_table_privilege('authenticated','public.conversations','UPDATE');    -- false
SELECT has_function_privilege('authenticated','public.send_conversation_message(uuid,uuid,text,integer)','EXECUTE'); -- false
SELECT has_function_privilege('service_role','public.block_and_close(uuid,uuid)','EXECUTE');                          -- true
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.conversations'::regclass AND NOT tgisinternal;
-- guard_conversation_status and on_conversation_status_change
```

### Rollback boundaries

- Between step 1 and step 2: nothing to roll back. The expand migrations are
  additive and the old code is unaffected. Re-running them is safe.
- Between step 2 and step 3: roll back by redeploying the previous SHA. The old
  code still works against the expand state, which is the entire point of the
  order.
- After step 3: rolling the CODE back alone would break the old release, because
  its direct writes and its `name` reads are gone. Roll back by re-granting in a
  deliberate follow-up migration, not by redeploying and hoping. In practice,
  fix forward: the functions and the new code are what step 3 assumes.

If Supabase tooling ever re-runs `GRANT ALL ON ALL TABLES IN SCHEMA public`, the
INSERT and UPDATE privileges come back. That is not urgent: the guard trigger
still refuses a client status change, and re-running step 3 restores the revokes.

## Three-path signup rollout (August 2026, NOT YET RUN)

Google, Apple or phone, each an independent way to make an account. A Google or
Apple member is never asked for a phone number, so `profiles.phone_e164` stops
being mandatory and the browser stops writing the row at all.

Two migrations, with the deploy between them. Same expand / deploy / contract
shape as the uncertainty rollout above, and it runs AFTER that one is finished:
the contract file here assumes the function from the expand file here, and both
sort after `20260806090000`.

**Never let a tool run both files back to back.** While these two are pending,
production is not touched with `supabase db push`, with a bulk "apply all
migrations" action, or with any auto-applier or CI step that walks the
migrations directory. Every one of those runs the expand file and the contract
file consecutively, which revokes the browser's INSERT while the deployed code
still depends on it, and that is an immediate outage on the signup screen. The
authoritative sequence is manual expand, deploy the reviewed app, manual
contract: three steps, run by hand, each confirmed before the next is started.

**Do the provider setup below BEFORE step 2.** The buttons appear the moment the
code is live, and a button for a provider that is not enabled is a dead control
on the one screen that has to work.

### Step 1, predeploy (expand)

`supabase/migrations/20260807120000_three_path_signup_expand.sql`

Drops the NOT NULL on `profiles.phone_e164`, asserts the UNIQUE index is still
there (Postgres treats NULLs as distinct, so social accounts share NULL and two
people still cannot claim one number), and creates
`create_profile_for_verified_identity`: SECURITY DEFINER, pinned search_path,
revoked from PUBLIC/anon/authenticated, granted to service_role only.

Additive. The currently deployed signup screen still inserts its own profiles
row and still works, which is proved by PROBE E9 in
`supabase/rehearsal/06_signup_expand_probes.sql`. Safe to re-run.

### Step 2, deploy the reviewed commit

Push the reviewed SHA and wait for Vercel. The new code creates accounts through
`POST /api/profile`, which calls the function created in step 1, so it is correct
the moment it is live.

### Step 3, postdeploy (contract). Run after the deploy is serving:

`supabase/migrations/20260807123000_postdeploy_profile_insert_contract.sql`

Drops the 0001 `"Users insert own profile"` policy and revokes INSERT on
`public.profiles` from anon and authenticated. The revoke is the part that
matters: a policy drop leaves a legacy table-level grant completely intact. The
file verifies its own effect and raises if the privilege survived. SELECT, the
owner UPDATE and every service_role path are deliberately untouched. Safe to
re-run.

Do not run step 3 before step 2. It breaks the previous release on purpose.

### Verification, after step 3

```sql
SELECT attnotnull FROM pg_attribute
 WHERE attrelid = 'public.profiles'::regclass AND attname = 'phone_e164';        -- false
SELECT has_table_privilege('authenticated','public.profiles','INSERT');          -- false
SELECT has_table_privilege('anon','public.profiles','INSERT');                   -- false
SELECT has_table_privilege('authenticated','public.profiles','UPDATE');          -- true, the editor
SELECT has_function_privilege('service_role',
  'public.create_profile_for_verified_identity(uuid,text,text,text,text,text,text,text)','EXECUTE');   -- true
SELECT has_function_privilege('authenticated',
  'public.create_profile_for_verified_identity(uuid,text,text,text,text,text,text,text)','EXECUTE');   -- false
```

Then make one real account each way (Google, Apple, phone) and check the row:
a social account has `phone_e164 IS NULL` and `notify_email` equal to the
provider address; a phone account has both, and `phone_verified_at` equal to
`auth.users.phone_confirmed_at`.

### Rollback boundaries

- Between step 1 and step 2: nothing to roll back. Re-running step 1 is safe.
- Between step 2 and step 3: redeploy the previous SHA. The old code still
  inserts profiles directly and the grant is still there, which is the point of
  the order. Anyone who signed up with Google in the meantime keeps their
  account; the old code just cannot create new social ones.
- After step 3: rolling the CODE back alone breaks signup, because the browser
  insert it relies on is gone. Roll back by re-granting in a deliberate
  follow-up migration, not by redeploying and hoping. In practice, fix forward.
- Turning a provider off in Supabase is instant and reversible, and it is the
  right lever if one provider misbehaves. The other two doors keep working.

### Provider enablement checklist (no credentials in this file, ever)

Everything below is configured in the Supabase and provider dashboards. Nothing
here goes in the repo, in `.env.local`, or in a `NEXT_PUBLIC_` variable. A
provider client secret in a `NEXT_PUBLIC_` variable is published to every
visitor's browser.

1. **Supabase, Authentication > Providers > Google.** Enable it. Paste the
   client ID and client secret from the Google OAuth client. Supabase stores
   them; the app never sees them.
2. **Google Cloud Console, APIs & Services > Credentials.** Create an OAuth 2.0
   Client ID of type "Web application". Its **Authorized redirect URI** is the
   SUPABASE project auth callback, not a stoop.house URL:
   `https://<project-ref>.supabase.co/auth/v1/callback`. This is the single most
   common setup mistake: our `/auth/callback` route is where Supabase sends the
   person afterwards, and Google never sees it.
3. **Supabase, Authentication > Providers > Apple.** Enable it. Apple needs
   four things, all created in the Apple Developer account: a **Services ID**
   (the client id), the **Team ID**, a **Key ID**, and the **private key** (.p8)
   for a Sign in with Apple key. Supabase turns those into the client secret
   itself. The Services ID's Return URL is again the Supabase callback above.
   Apple also requires the domain to be verified against the same Services ID.
4. **Supabase, Authentication > URL Configuration.** Add the exact app callback
   origins to the redirect allowlist:
   - `https://stoop.house/auth/callback`
   - `https://www.stoop.house/auth/callback`
   - one specific protected staging origin if one is used, written out in full.
   Do NOT add a broad preview wildcard such as
   `https://*.vercel.app/auth/callback`. Every preview deployment of every fork
   becomes an accepted redirect target, and that is an account takeover path,
   not a convenience. Preview testing of the provider buttons needs a named
   origin added deliberately and removed afterwards.
5. **Local development.** `http://localhost:3000/auth/callback` is added the
   same deliberate way. The app builds its redirect from the origin it is
   actually running on, so nothing else needs changing between environments.

### What to tell somebody who asks

- **Account linking.** Stoop implements no manual account linking and does no
  merging of its own. A phone account stays separate whatever happens: the phone
  identity carries no provider email in auth, so there is nothing for anything
  to match it against, and somebody who joined by phone comes back by phone.
  Google and Apple are not guaranteed to stay separate from each other. Supabase
  GoTrue can attach a second social identity to an existing user by itself when
  the new provider presents the SAME verified, non-relay email address, so a
  Google member who later presses Continue with Apple may land back in the
  account they already had. An Apple private relay address usually breaks that
  match, so in practice the two social doors usually do stay apart. Do not
  promise anybody that Google and Apple always make separate accounts. Either
  outcome is safe in the staged code: `create_profile_for_verified_identity`
  reads `auth.identities` for the provider actually being claimed rather than
  for whichever identity happens to be there, and `/auth/callback` sends
  somebody who already has a profile straight to their destination instead of
  building a second one. What is deliberately absent is app-side linking on a
  matching email address, because linking two identities on the strength of an
  address is how accounts get taken over by whoever controls that address.
- **Apple private relay.** An Apple member's email may be
  `something@privaterelay.appleid.com`. That is a real, working address and
  Stoop stores it as the notification address. It keeps working as long as the
  member does not turn off forwarding in their Apple ID settings.
- **Apple sends a name once.** Apple shares the person's name on the FIRST
  authorization only, and never again. The profile form works with no name
  prefilled, which is the normal case for anyone who has authorized before.
- **A duplicate phone number** is refused with fixed copy telling them to sign
  in with it instead. That is the only signup failure that names a cause.

### If an auth-provider readiness check is ever added

It may expose booleans and nothing else: whether Google is on, whether Apple is
on. Never a client id, never a redirect URI, never a settings object. And it
must not become a request on every render of the auth screen; the buttons are
static and a failed provider is already handled by fixed copy on the way back.
Nothing in this release adds one.

## Local migration rehearsal (no credentials, no production)

Runs the whole migration chain against a throwaway Postgres and probes the lifecycle.
Needs Docker only. Nothing here touches Supabase.

```bash
docker run -d --name stoop-rehearsal -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=stoop postgres:16-alpine
psql() { docker exec -i stoop-rehearsal psql -U postgres -d stoop -q -v ON_ERROR_STOP=1; }
psql < supabase/rehearsal/00_bootstrap.sql          # API roles, stock grants, auth stub, publication
psql < supabase/migrations/0001_initial_schema.sql
psql < supabase/rehearsal/01_live_drift.sql         # columns production has, this repo never migrated
for f in supabase/migrations/000[2-6]*.sql supabase/migrations/20260803*.sql supabase/migrations/202608052*.sql; do psql < "$f"; done
# Expand state: the deployed release still works, the new functions are ready.
docker exec -i stoop-rehearsal psql -U postgres -d stoop -v ON_ERROR_STOP=1 < supabase/rehearsal/04_expand_state_probes.sql
# Three-path signup, expand half: the function accepts phone, Google and Apple,
# refuses everything else, and the OLD browser insert still works (probe E9).
psql < supabase/migrations/20260807120000_three_path_signup_expand.sql
docker exec -i stoop-rehearsal psql -U postgres -d stoop -v ON_ERROR_STOP=1 < supabase/rehearsal/06_signup_expand_probes.sql
# Then the postdeploy migrations, and the contract-state probes.
psql < supabase/migrations/20260806090000_postdeploy_boundary_hardening.sql
docker exec -i stoop-rehearsal psql -U postgres -d stoop -v ON_ERROR_STOP=1 < supabase/rehearsal/02_probes.sql
docker exec -i stoop-rehearsal psql -U postgres -d stoop -v ON_ERROR_STOP=1 < supabase/rehearsal/03_api_role_probes.sql
psql < supabase/migrations/20260807123000_postdeploy_profile_insert_contract.sql
docker exec -i stoop-rehearsal psql -U postgres -d stoop -v ON_ERROR_STOP=1 < supabase/rehearsal/07_signup_contract_probes.sql
# Two-session races, last, against the fully migrated database. Note the
# database flag: the script defaults to `postgres` and this container is `stoop`.
python supabase/rehearsal/races.py --container stoop-rehearsal --database stoop
docker rm -f stoop-rehearsal
```

Run each probe file ONCE per container. They are ordinary SQL against a real
database, not idempotent test cases: a second run of `02_probes.sql` fails on
state the first run left behind, which looks exactly like a regression and is
not one.

`06_signup_expand_probes.sql` covers the creation function: a verified phone
signup taking its number and its verified time from auth, a Google signup with
no phone and the provider address, an Apple signup with a private relay address,
and ten refusals (an email/password identity, an unknown provider, a provider
claimed only in user metadata, an unconfirmed phone, a mismatched phone, an
actor id that is not an auth user, a neighborhood in the other city, a social
caller naming its own notification address, a malformed email, an over-long name
and about line). Then a double submit returning the existing row untouched,
NULL phones coexisting while a real number stays unique, service-role-only
execute, and the legacy insert still working. It ends with
`ALL EXPAND-STATE SIGNUP PROBES PASSED`.

`07_signup_contract_probes.sql` acts as `anon` and `authenticated` and proves
the browser insert is gone by grant and by policy, that all three ways in still
work through the function, and that reads and the owner edit are untouched. It
ends with `ALL CONTRACT-STATE SIGNUP PROBES PASSED`.

`02_probes.sql` runs as the owner and covers the lifecycle: service-role-only execute,
pinned search paths, the old trigger being replaced, confirm taking the last spot, a
second confirmation being refused, a direct UPDATE being refused by the capacity check,
withdrawal restoring exactly one spot and reopening the plan, double withdrawal changing
nothing, withdrawn staying withdrawn, pending withdrawal not moving capacity, a past
plan keeping its roster, legacy plans staying writable, asking again once and only once
with its opener, a failed opener rolling back both a new request and a reopen,
declines being final, and closed plans being told apart from full ones. It ends with
`ALL PROBES PASSED`.

`03_api_role_probes.sql` runs as `anon` and `authenticated` with a JWT claim, under the
stock Supabase grants, which is the only way to test the privilege model the browser
actually has. It covers: the grants being present at all, a host being unable to set a
status directly, the same still being refused when UPDATE is granted back, requester and
anon being unable to write a status, the API roles being unable to execute the lifecycle
functions despite Supabase's default EXECUTE grant, an unrelated member reading zero
conversations and messages, `anon` reading public plans but no conversations and no
phone numbers, migration 0003's column grants holding for a signed-in member, and
`service_role` still being able to close a conversation when someone blocks. It ends
with `ALL API ROLE PROBES PASSED`.

Both files raise on failure, so `ON_ERROR_STOP=1` makes psql exit non-zero.

Note the drift file: `plans.slug`, `when_date`, `when_time_specific`, `intent_tags`,
the sports category, three-joiner plans, `blocks` and `conversation_reads` exist in
production but were never written as migrations. Rehearsing without it tests a database
that is friendlier than the real one.

## Standard test scripts
CORE LOOP (two accounts A and B):
1. Sign up A with a valid email; confirm email is required and the welcome email arrives.
2. A posts a plan.
3. Sign up B (different phone + email); B messages A's plan.
4. A receives "wants to join" email.
5. A confirms B.
6. B receives "You're in" email.

BLOCK (the 8-step test): see docs/SAFETY_SPEC.md, Push 1. Verifies all four enforcement surfaces
in both directions.

ROSTER AND WITHDRAWAL (needs both August 2026 migrations, three accounts A, B, C):
1. Logged out, open A's plan. You see the host card and the logistics, and no roster.
2. B messages the plan. B's thread says "Pending. Conversation started. No spot is
   reserved." A sees B's requester card above Accept and Decline.
3. C, signed in but unrelated, opens the plan: no roster. Hit
   /api/plans/<planId>/participants directly as C: 403 and no names. Signed out: 401.
4. A accepts B. B's plan page now shows "Who is coming" with A and B. B's email says
   the spot is reserved.
5. B leaves the plan from the thread. The plan's open count goes back up, a full plan
   reopens, and A gets the "left your plan" email. Press it again: nothing changes.
6. B opens the plan again and uses "Ask to join again". They have to write a new opener;
   A gets an "asking to join again" email that says B left earlier. A second attempt
   after a second withdrawal is refused: one re-request per plan.
7. A declines C. C sees that the decision stands and is offered other plans, with no way
   to re-ask on that plan.
8. A blocks B. B disappears from A's feed, plan, conversation and roster, both ways.

UNREAD BADGE:
1. A signed in; B messages A's plan.
2. Within ~30s A's Inbox nav shows a count.
3. A opens the conversation, returns to feed, badge clears.

## Debugging surfaces
- Build failures: Vercel deployment log (names file + line).
- Email problems: Resend dashboard -> Logs (sent / delivered / bounced + reason).
- Auth/OTP problems: Supabase Auth logs; check Twilio trial status first (error 21608).
- Realtime chat not updating: confirm the conversation channel subscription and RLS on messages.

## Things that have bitten us before (quick list — full detail in ARCHITECTURE.md)
- /rest/v1 wrongly appended to SUPABASE_URL (broke build twice).
- Resend FROM using .co instead of .house (silent send failures).
- Two DMARC records (broke DMARC).
- Server-side recompute of date labels (UTC mislabeled Tomorrow/Thursday).
- Orphaned .order()/.limit() after inserting an if-filter into a query chain.
- Duplicate import lines after a find-and-replace that didn't remove the original.
- A file imported before it was created (module-not-found at build).
