-- ═══════════════════════════════════════════════════════════════════════════
-- LOCAL REHEARSAL: the columns production has that this repo never migrated
--
-- The live database picked up plan slugs, dates, exact times, vibe tags, the
-- sports category, three-joiner plans, blocks and conversation_reads through
-- the Supabase SQL editor rather than through a file in supabase/migrations.
-- That drift is stated here rather than papered over, so a rehearsal runs
-- against something shaped like production instead of something friendlier.
--
-- This file is for the throwaway local database only. It is deliberately not a
-- migration: production already has all of it.
-- ═══════════════════════════════════════════════════════════════════════════

-- Mandatory at signup since the first week, and the column migration 0003
-- deliberately withholds from the API roles, but never written as a migration.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_email TEXT;

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS when_date DATE;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS when_time_specific TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS intent_tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_category_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_category_check
  CHECK (category IN ('coffee','outdoors','arts','food','books','music','sports'));

ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_spots_total_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_spots_total_check
  CHECK (spots_total IN (1, 2, 3));

CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  blocked_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS public.conversation_reads (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);
