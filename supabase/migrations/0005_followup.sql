-- 0005: Post-plan follow-up loop ("How was it?").
-- Safe to run twice. Run this AFTER the follow-up code is deployed; the code
-- refuses to run until this migration exists, so order is not dangerous, but
-- nothing sends until both this migration is run and the daily cron fires.

-- Marks a confirmed conversation as already asked, so nobody gets the
-- follow-up email twice.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ;

-- One row per person per conversation: how did the meetup go.
CREATE TABLE IF NOT EXISTS public.plan_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  responder_id UUID NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('great', 'fine', 'noshow')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, responder_id)
);

-- RLS on with no policies: the public API roles can neither read nor write
-- feedback. Only the service role (the server's admin client) touches it.
ALTER TABLE public.plan_feedback ENABLE ROW LEVEL SECURITY;
