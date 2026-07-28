-- 0006: Private operations dashboard (/admin/ops).
-- One table holding the high-level work and the decisions waiting on the
-- founder. Safe to run twice: every statement is idempotent and the seed rows
-- use fixed UUIDs, so re-running never duplicates or overwrites edits made in
-- the dashboard.

CREATE TABLE IF NOT EXISTS public.ops_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('task', 'approval')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  summary TEXT CHECK (summary IS NULL OR char_length(summary) <= 600),
  status TEXT NOT NULL CHECK (status IN (
    'backlog', 'in_progress', 'blocked', 'pending_approval', 'approved', 'rejected', 'completed'
  )),
  owner TEXT NOT NULL CHECK (owner IN ('user', 'curio', 'shared')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_at TIMESTAMPTZ,
  next_action TEXT CHECK (next_action IS NULL OR char_length(next_action) <= 240),
  approval_question TEXT CHECK (approval_question IS NULL OR char_length(approval_question) <= 400),
  decision_notes TEXT CHECK (decision_notes IS NULL OR char_length(decision_notes) <= 600),
  source_url TEXT CHECK (source_url IS NULL OR char_length(source_url) <= 500),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  -- A task never sits in an approval state, and an approval never sits in a
  -- task work state. The app enforces this too; the constraint is the backstop.
  CONSTRAINT ops_items_status_matches_kind CHECK (
    (kind = 'task' AND status IN ('backlog', 'in_progress', 'blocked', 'completed'))
    OR (kind = 'approval' AND status IN ('pending_approval', 'blocked', 'approved', 'rejected'))
  )
);

CREATE INDEX IF NOT EXISTS ops_items_status_idx ON public.ops_items (status);
CREATE INDEX IF NOT EXISTS ops_items_kind_status_idx ON public.ops_items (kind, status);
CREATE INDEX IF NOT EXISTS ops_items_board_order_idx ON public.ops_items (sort_order, created_at DESC);

-- Keep updated_at honest without the app having to remember.
CREATE OR REPLACE FUNCTION public.touch_ops_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ops_items_set_updated_at ON public.ops_items;
CREATE TRIGGER ops_items_set_updated_at
  BEFORE UPDATE ON public.ops_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_ops_items_updated_at();

-- RLS on with no policies: anon and authenticated can neither read nor write.
-- Only the service role (the server's admin client) touches this table, and
-- the only surface that uses it is the ADMIN_USER_ID-gated /admin/ops.
ALTER TABLE public.ops_items ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: the real work in flight as of July 2026. Fixed UUIDs, insert-only.
-- No invented approvals: an empty pending-approval list is a valid state.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.ops_items (id, kind, title, summary, status, owner, priority, due_at, next_action, sort_order)
VALUES
  (
    '0e7f2a10-0000-4000-8000-000000000001',
    'task',
    'Get Stoop''s first activated McCarren users',
    'Activation is not outreach. Conversations, follows, and flyer scans do not count; an activated user has authenticated with a phone number and published a real plan that shows up on the McCarren board.',
    'in_progress',
    'curio',
    'urgent',
    NULL,
    'Convert an interested host through authentication and one real published plan.',
    10
  ),
  (
    '0e7f2a10-0000-4000-8000-000000000002',
    'task',
    'Prepare for C3 offer negotiation call',
    'Package review and negotiation prep ahead of the scheduled call.',
    'in_progress',
    'user',
    'high',
    TIMESTAMPTZ '2026-07-28 14:00:00 America/Chicago',
    'Hold the call and record the package outcome.',
    20
  ),
  (
    '0e7f2a10-0000-4000-8000-000000000003',
    'task',
    'Build shared operations dashboard',
    'Owner-only /admin/ops so high-level work and pending decisions live in one place instead of scattered across threads.',
    'in_progress',
    'shared',
    'high',
    NULL,
    'Review the diff, run this migration, then deploy and confirm the board loads on mobile.',
    30
  ),
  (
    '0e7f2a10-0000-4000-8000-000000000004',
    'task',
    'NYC apartment search',
    'Surface verified standout candidates only, under the existing hard gates. Anything that fails a gate or cannot be verified does not get shown.',
    'in_progress',
    'curio',
    'high',
    NULL,
    'Bring forward the next verified standout candidate that clears every hard gate.',
    40
  )
ON CONFLICT (id) DO NOTHING;
