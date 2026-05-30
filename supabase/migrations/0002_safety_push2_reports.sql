-- ═══════════════════════════════════════════════════════════════════════════
-- SAFETY LAYER · PUSH 2 — REPORT + ADMIN REVIEW
-- Run this in the Supabase SQL Editor (it is safe to run more than once).
-- ═══════════════════════════════════════════════════════════════════════════

-- Link a report to the conversation it came from, for admin context.
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

-- Record when a report was acted on (dismiss / warn / suspend).
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- A "Warn" leaves a mark on the reported profile without suspending them.
-- (profiles.blocked_at already exists and is what sign-in checks for a suspend.)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS warned_at TIMESTAMPTZ;

-- Newest-open-first is the admin queue's main read pattern.
CREATE INDEX IF NOT EXISTS idx_reports_open_recent
  ON reports(created_at DESC) WHERE status = 'open';
