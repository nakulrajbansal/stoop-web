-- ═══════════════════════════════════════════════════════════════════════════
-- PLAN CLARITY CONTRACT: a plan has to say what it costs
--
-- Part of the uncertainty reduction release. A visitor could not tell whether
-- "drinks at the bar" meant a free hang or a forty dollar night, so every NEW
-- plan now carries one of three values: free, pay-own-way, ticket-required.
--
-- Staged rollout, in this order:
--   1. Run this migration. The column is nullable, so the currently deployed
--      code (which does not know about it) keeps inserting and updating plans.
--   2. Deploy the code that requires the value on new and edited plans.
--
-- Existing plans stay readable with the value missing. The application layer,
-- not a constraint, is what requires it: a NOT NULL or a NOT VALID check would
-- also fire on unrelated updates to old rows (spots_left when someone is
-- confirmed, status when a plan is removed), which would break plans that are
-- perfectly fine as they are.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS cost_expectation TEXT;

ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_cost_expectation_check;

ALTER TABLE public.plans
  ADD CONSTRAINT plans_cost_expectation_check
  CHECK (cost_expectation IS NULL OR cost_expectation IN ('free', 'pay-own-way', 'ticket-required'));

COMMENT ON COLUMN public.plans.cost_expectation IS
  'free | pay-own-way | ticket-required. NULL means the plan predates the clarity contract. Stoop never processes payment.';

-- ── TRUTHFUL BACKFILL ONLY ────────────────────────────────────────────────
-- The old "Free" vibe tag says exactly one thing, so it maps cleanly. The old
-- "Costs money" tag does not: it could be pay-own-way or ticket-required, and
-- guessing would put a fact in front of a neighbor that the host never stated.
-- Those plans keep a NULL and are asked for the value the next time they are
-- edited or reposted.
--
-- intent_tags was added to the live schema outside this migrations folder, so
-- the update is guarded on the column actually existing. On a fresh database
-- built from these files alone, this block is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plans' AND column_name = 'intent_tags'
  ) THEN
    UPDATE public.plans
       SET cost_expectation = 'free'
     WHERE cost_expectation IS NULL
       AND intent_tags @> ARRAY['free']::TEXT[]
       AND NOT (intent_tags @> ARRAY['paid']::TEXT[]);
  END IF;
END
$$;
