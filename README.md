# Stoop — Production Web App

The deployable Next.js codebase for Stoop. Plans, not profiles.

## Stack

- **Framework**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Database + Auth**: Supabase (Postgres + Auth + Realtime)
- **Phone verification**: Twilio Verify (OTP) + Twilio Lookup (VOIP block)
- **Email**: Resend
- **Hosting**: Vercel

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.example .env.local
# Edit .env.local with your real keys

# 3. Run database migration
# In Supabase Dashboard → SQL Editor, paste and run:
#   supabase/migrations/0001_initial_schema.sql

# 4. Start dev server
npm run dev
# → http://localhost:3000
```

## Environment variables

See `.env.example` for the full list. You'll need accounts at:
- [supabase.com](https://supabase.com) — free tier
- [twilio.com](https://twilio.com) — pay-as-you-go (~$0.10/signup)
- [resend.com](https://resend.com) — free tier covers 3,000 emails/mo

Full setup instructions are in `stoop_deployment_guide.docx` (companion document).

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── send-otp/           # POST: Lookup + Verify send
│   │   ├── check-otp/          # POST: validate OTP + create user
│   │   ├── plans/              # GET (list), POST (create)
│   │   ├── conversations/      # GET, POST (start), PATCH (accept/decline)
│   │   ├── messages/           # POST (send)
│   │   └── reports/            # POST (report user)
│   ├── auth/                   # Phone OTP signup flow
│   ├── feed/                   # Plan feed with filters
│   ├── plan/[id]/              # Plan detail + message CTA
│   ├── post/                   # Post-a-plan flow (dark mode)
│   ├── inbox/                  # Conversation list
│   │   └── [id]/               # Individual chat with realtime
│   ├── my-plans/               # Posted + joined tabs
│   ├── profile/                # Edit profile, sign out
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                # Landing
├── components/
│   ├── Nav.tsx
│   └── PlanCard.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Browser
│   │   ├── server.ts           # SSR
│   │   └── admin.ts            # Service role (server-only)
│   ├── twilio.ts               # lookupNumber, sendVerification, checkVerification
│   ├── resend.ts               # sendWelcome, sendMessageAlert, sendConfirmed
│   ├── rate-limit.ts           # OTP rate limiting via otp_attempts table
│   └── utils.ts                # toE164, getInitials, etc.
├── types/database.ts
├── middleware.ts               # Refreshes Supabase session
└── ...

supabase/migrations/
└── 0001_initial_schema.sql     # Tables + RLS + triggers
```

## Database schema highlights

- **cities** → **neighborhoods** → all data scoped to a city
- **profiles** extends Supabase `auth.users`, one row per phone
- **plans** with status (open/full/expired/removed) + auto-expiry
- **conversations** with unique constraint on (plan_id, joiner_id)
- **messages** with realtime publication enabled
- **otp_attempts** for rate limiting (3 per phone/hr, 5 per IP/hr)
- **reports** for safety

Row Level Security is enabled on every user-facing table. RLS policies enforce:
- Profiles readable by all (authenticated), updatable only by owner
- Plans readable by all, writable only by owner
- Conversations and messages visible only to participants

## Critical: phone verification flow

1. User enters phone → frontend calls `/api/send-otp`
2. Server calls `lookupNumber()` from `lib/twilio.ts`
3. If `line_type ∈ {voip, nonFixedVoip, fixedVoip}` → blocked with error
4. Otherwise rate-limit check (3/phone/hr, 5/IP/hr) via `otp_attempts`
5. Twilio Verify sends OTP via SMS
6. User enters code → `/api/check-otp` validates with Twilio
7. Supabase auth user created (or matched if existing phone)
8. Profile completion flow runs for new users

## Auth notes

This MVP uses **Twilio Verify** for the OTP (better fraud detection than Supabase's built-in SMS) and Supabase Auth for session management. In `/api/check-otp` the OTP is validated via Twilio, then Supabase creates the auth user. The client uses `supabase.auth.verifyOtp()` to set up the session — Supabase needs its own OTP, so in production decide on **one** source of truth (either use Supabase phone auth directly, OR fully manage sessions via the admin API after Twilio verification).

For MVP you can simplify by using Supabase's built-in phone auth and keeping Twilio Lookup as just a VOIP check upfront. The current code shows both paths.

## Realtime

Chat uses Supabase Realtime — `messages` and `conversations` tables are added to `supabase_realtime` publication in the migration. The chat page subscribes to inserts via `supabase.channel()`.

## Deployment to Vercel

```bash
# Push to GitHub, then in Vercel:
# 1. Import repo
# 2. Add all env variables from .env.example
# 3. Deploy
```

Custom domains, DNS, Resend domain verification, and monitoring setup are covered in detail in `stoop_deployment_guide.docx`.

## What's NOT in this MVP (yet)

- Push notifications (use email + SMS for now)
- Profile photos (deliberate — distracts from activity-first model)
- Match algorithms (deliberate — defeats positioning)
- Native mobile app (responsive web handles 90%)
- Payments (no monetization at MVP)
- Admin dashboard (use Supabase Studio for now)

## Companion documents

This codebase ships with three Word documents:
1. **Founding Members Playbook** — how to recruit 120 founding members in 30 days
2. **Deployment Guide** — step-by-step infra setup, env vars, DNS
3. **Design and Architecture Pack** — full PRD, schema, threat model, scaling plan

## License

Private. Not for redistribution.
