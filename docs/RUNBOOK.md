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

## Supabase admin tasks (SQL Editor)
- Clear OTP rate limits during testing: DELETE FROM otp_attempts;  (table name may vary)
- Plan expiry housekeeping runs via pg_cron hourly (expire_old_plans()).
- Migrations from a build push: run the SQL in the SQL Editor BEFORE pushing the code that
  depends on it, so the deployed code doesn't hit missing tables/columns.
- EXCEPTION, migration 0003 (privacy hardening): run it AFTER the July 2026
  "profile photos + privacy" deploy is live. It restricts which profile columns the
  API can read, and the pre-existing code still read notify_email the old way. The
  migration file itself says the same thing at the top.

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
