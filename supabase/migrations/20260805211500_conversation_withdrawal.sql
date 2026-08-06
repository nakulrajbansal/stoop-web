-- ═══════════════════════════════════════════════════════════════════════════
-- WITHDRAWAL AND CAPACITY CORRECTNESS
--
-- Adds the fourth conversation state. A requester can leave while pending, and
-- a confirmed participant can leave before the plan happens; the spot goes back
-- to the host exactly once.
--
-- Two problems this fixes in the original trigger:
--   1. It clamped the decrement at zero instead of refusing it, so two
--      confirmations racing on a one spot plan both "succeeded" and the plan
--      was overbooked.
--   2. Nothing gave a spot back, because nothing could be given back.
--
-- The transition is decided inside Postgres, under a row lock, not by reading
-- and then writing from the application. Both entry points lock the
-- conversation first and the plan second, so confirm and withdraw can never
-- deadlock against each other.
--
-- Neither function is callable by anon or authenticated: execute is revoked
-- from the API roles and granted only to service_role. The routes verify the
-- user themselves (auth.uid() is not reliable in this app's server routes) and
-- then call these through the admin client, passing the id they verified. A
-- SECURITY DEFINER function that any client could call with any actor id would
-- be a spoofable way to confirm yourself into someone else's plan.
--
-- Staged rollout: the CHECK constraint and the trigger go in first and are
-- compatible with the currently deployed code, which only ever writes
-- 'confirmed' or 'declined' and now simply fails loudly instead of overbooking.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── THE FOURTH STATE ──────────────────────────────────────────────────────
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_status_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_status_check
  CHECK (status IN ('pending', 'confirmed', 'declined', 'withdrawn'));

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS reopen_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.conversations.withdrawn_at IS
  'When the requester last left. Set only by withdraw_conversation, and kept after a re-request so the history stays auditable.';

COMMENT ON COLUMN public.conversations.reopened_at IS
  'When the requester asked again after withdrawing. Set only by start_or_reopen_conversation.';

COMMENT ON COLUMN public.conversations.reopen_count IS
  'How many times this request has been reopened. Capped at one, so leaving and asking again cannot become a way to pester a host.';

-- ── THE PUBLIC NAME PROJECTION (additive, safe before the deploy) ─────────
-- profiles.name is a full name and every screen renders a first name. The
-- column below is the projection the API roles will read; it is GRANTED here so
-- the new code can use it the moment it deploys, and `name` is only REVOKED in
-- the postdeploy hardening migration, once nothing reads it any more.
-- The projection has to survive a name that was pasted rather than typed.
-- Splitting on an ASCII space alone did not: a name joined by a no-break space
-- has no ASCII space in it, so the split returned the whole string and the
-- surname became publicly readable the moment display_name replaced name. Every
-- separator a keyboard or a paste can produce is collapsed first. The same list
-- lives in src/lib/profile-identity.ts and a test holds the two together.
--
-- Postgres 16 cannot ALTER the expression of a generated column, so an earlier
-- rehearsal or staging run that created the ordinary version has to have the
-- column replaced. Nothing reads display_name before this migration, so
-- dropping it here costs nothing. Absent, ordinary or already correct: all three
-- end in the same place, which is what makes the file safe to re-run.
DO $repair$
DECLARE
  current_expression TEXT;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO current_expression
    FROM pg_attribute a
    JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.profiles'::regclass
     AND a.attname = 'display_name'
     AND a.attgenerated = 's';

  IF current_expression IS NOT NULL AND current_expression NOT LIKE '%regexp_replace%' THEN
    RAISE NOTICE 'replacing the first version of display_name';
    ALTER TABLE public.profiles DROP COLUMN display_name;
  END IF;
END
$repair$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT
  GENERATED ALWAYS AS (
    split_part(
      btrim(regexp_replace(COALESCE(name, ''), '[ \t\n\r\f\v\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g')),
      ' ',
      1
    )
  ) STORED;

COMMENT ON COLUMN public.profiles.display_name IS
  'First name only. After the postdeploy hardening migration this is the one name column anon and authenticated may read.';

GRANT SELECT (display_name) ON public.profiles TO anon, authenticated;

-- ── CAPACITY, MOVED BY THE DATABASE ───────────────────────────────────────
-- One trigger owns spots_left. It runs inside the same transaction as the
-- status change, takes the plan row lock, and refuses rather than clamps.
CREATE OR REPLACE FUNCTION public.handle_conversation_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  plan_row public.plans%ROWTYPE;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'confirmed' THEN
    -- Nobody is seated across a block, whichever way the block points.
    --
    -- confirm_conversation checks this too, and answers politely. This copy
    -- exists because the trigger is on the transition itself, so no route into
    -- 'confirmed' can miss it: not a legacy direct UPDATE during the expand
    -- window, not a future function, not a statement run by hand. It is checked
    -- before the plan lock, so a refused confirmation never touches capacity.
    IF EXISTS (
      SELECT 1 FROM public.blocks
       WHERE (blocker_id = NEW.poster_id AND blocked_id = NEW.joiner_id)
          OR (blocker_id = NEW.joiner_id AND blocked_id = NEW.poster_id)
    ) THEN
      RAISE EXCEPTION 'conversation % cannot be confirmed across a block', NEW.id
        USING ERRCODE = '42501';
    END IF;

    SELECT * INTO plan_row
      FROM public.plans
     WHERE id = NEW.plan_id
       FOR UPDATE;

    IF plan_row.id IS NULL THEN
      RAISE EXCEPTION 'plan % no longer exists', NEW.plan_id USING ERRCODE = '23503';
    END IF;

    -- The overbooking guard. Two confirmations racing on the last spot
    -- serialize on the lock above; the second one lands here and aborts.
    IF plan_row.spots_left < 1 THEN
      RAISE EXCEPTION 'plan % has no spots left', NEW.plan_id USING ERRCODE = '23514';
    END IF;

    UPDATE public.plans
       SET spots_left = plan_row.spots_left - 1,
           status = CASE
             WHEN plan_row.spots_left - 1 <= 0 AND plan_row.status = 'open' THEN 'full'
             ELSE plan_row.status
           END
     WHERE id = plan_row.id;

  ELSIF OLD.status = 'confirmed' AND NEW.status IN ('withdrawn', 'declined') THEN
    -- Withdrawing and being closed by a block both give the seat back. An
    -- ordinary decline is pending to declined and never reaches this branch,
    -- so no spot moves for it.
    SELECT * INTO plan_row
      FROM public.plans
     WHERE id = NEW.plan_id
       FOR UPDATE;

    IF plan_row.id IS NOT NULL THEN
      UPDATE public.plans
         SET spots_left = LEAST(plan_row.spots_total, plan_row.spots_left + 1),
             status = CASE WHEN plan_row.status = 'full' THEN 'open' ELSE plan_row.status END
       WHERE id = plan_row.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_conversation_status_change() FROM PUBLIC, anon, authenticated;

-- The old trigger only knew how to take a spot away.
DROP TRIGGER IF EXISTS on_conversation_confirmed ON public.conversations;
DROP FUNCTION IF EXISTS public.handle_conversation_confirmed();

DROP TRIGGER IF EXISTS on_conversation_status_change ON public.conversations;
CREATE TRIGGER on_conversation_status_change
  AFTER UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_conversation_status_change();

-- ── THE HOST'S DECISION ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_conversation(
  p_conversation_id UUID,
  p_actor_id UUID,
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  conv public.conversations%ROWTYPE;
  plan_row public.plans%ROWTYPE;
  new_status TEXT;
BEGIN
  IF p_action NOT IN ('confirm', 'decline') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_action', 'error', 'Unsupported action.');
  END IF;

  SELECT * INTO conv
    FROM public.conversations
   WHERE id = p_conversation_id
     FOR UPDATE;

  IF conv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Conversation not found.');
  END IF;

  IF conv.poster_id <> p_actor_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Only the host decides who joins.');
  END IF;

  IF conv.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_resolved', 'error',
      format('This request is already %s.', conv.status));
  END IF;

  new_status := CASE WHEN p_action = 'confirm' THEN 'confirmed' ELSE 'declined' END;

  IF new_status = 'confirmed' THEN
    -- No confirming across a block, in either direction, checked here under the
    -- conversation lock rather than trusted from whatever was supposed to have
    -- closed the thread.
    --
    -- The gap this closes is a legacy one. Before block_and_close, blocking was
    -- an upsert followed by a separate bulk update; if the second statement
    -- failed, or ran while a request was still being created, the block existed
    -- and a pending row survived next to it. Nothing ever re-checked, so the
    -- host could open their inbox weeks later and confirm somebody they had
    -- blocked, which also took a spot and put that person on the private roster.
    --
    -- Declining is deliberately not gated on this: closing a request you do not
    -- want is exactly what a host should still be able to do after a block.
    IF EXISTS (
      SELECT 1 FROM public.blocks
       WHERE (blocker_id = conv.poster_id AND blocked_id = conv.joiner_id)
          OR (blocker_id = conv.joiner_id AND blocked_id = conv.poster_id)
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'blocked', 'error',
        'This conversation is no longer available.');
    END IF;

    SELECT * INTO plan_row
      FROM public.plans
     WHERE id = conv.plan_id
       FOR UPDATE;

    -- Closed and full are different things to a host, so they get different
    -- answers instead of one misleading "no spots left".
    IF plan_row.id IS NULL OR plan_row.status IN ('expired', 'removed') OR plan_row.expires_at < now() THEN
      RETURN jsonb_build_object('ok', false, 'code', 'plan_closed', 'error', 'This plan is closed.');
    END IF;

    IF plan_row.status <> 'open' OR plan_row.spots_left < 1 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'no_spots', 'error', 'This plan has no spots left.');
    END IF;
  END IF;

  UPDATE public.conversations
     SET status = new_status
   WHERE id = conv.id;

  SELECT * INTO plan_row FROM public.plans WHERE id = conv.plan_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', new_status,
    'spots_left', plan_row.spots_left,
    'plan_status', plan_row.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_conversation(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_conversation(UUID, UUID, TEXT) TO service_role;

-- ── THE REQUESTER'S EXIT ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.withdraw_conversation(
  p_conversation_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  conv public.conversations%ROWTYPE;
  plan_row public.plans%ROWTYPE;
BEGIN
  SELECT * INTO conv
    FROM public.conversations
   WHERE id = p_conversation_id
     FOR UPDATE;

  IF conv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Conversation not found.');
  END IF;

  IF conv.joiner_id <> p_actor_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error',
      'Only the requester can withdraw. Hosts use Decline instead.');
  END IF;

  -- Already gone. Return the same answer as the first time and touch nothing,
  -- so a double tap or a retried request cannot refund the spot twice.
  IF conv.status = 'withdrawn' THEN
    SELECT * INTO plan_row FROM public.plans WHERE id = conv.plan_id;
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'withdrawn',
      'already', true,
      'spots_left', plan_row.spots_left,
      'plan_status', plan_row.status
    );
  END IF;

  IF conv.status = 'declined' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'declined', 'error',
      'This request was already declined, so there is nothing to withdraw.');
  END IF;

  IF conv.status = 'confirmed' THEN
    SELECT * INTO plan_row
      FROM public.plans
     WHERE id = conv.plan_id
       FOR UPDATE;

    IF plan_row.id IS NOT NULL AND plan_row.expires_at < now() THEN
      RETURN jsonb_build_object('ok', false, 'code', 'expired', 'error',
        'This plan has already happened, so the spot cannot be handed back.');
    END IF;
  END IF;

  -- The trigger above puts the spot back when this row was confirmed.
  UPDATE public.conversations
     SET status = 'withdrawn',
         withdrawn_at = now()
   WHERE id = conv.id;

  SELECT * INTO plan_row FROM public.plans WHERE id = conv.plan_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'withdrawn',
    'already', false,
    'spots_left', plan_row.spots_left,
    'plan_status', plan_row.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_conversation(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_conversation(UUID, UUID) TO service_role;

-- ── BLOCKING SOMEBODY, IN ONE PIECE ───────────────────────────────────────
-- Blocking used to be two statements from the route: upsert the block, then
-- update every open conversation between the two people to declined. Two
-- things were wrong with that. If the second statement failed, the block
-- existed and the person was still confirmed on the plan. And closing a
-- CONFIRMED request as declined never gave the seat back, so the participant
-- vanished from the roster while the plan stayed full: a host who blocked
-- somebody lost a spot permanently and could not see why.
--
-- Both writes now happen here, in one transaction, and the capacity trigger
-- refunds each confirmed seat as its row changes. An ordinary decline is
-- pending to declined and moves no capacity, which is unchanged.
--
-- Lock order is conversations then plans (the trigger takes the plan lock),
-- matching every other lifecycle function.
CREATE OR REPLACE FUNCTION public.block_and_close(
  p_blocker_id UUID,
  p_blocked_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  conv public.conversations%ROWTYPE;
  closed_ids UUID[] := ARRAY[]::UUID[];
  refunded INTEGER := 0;
  block_added BOOLEAN := false;
BEGIN
  IF p_blocker_id IS NULL OR p_blocked_id IS NULL OR p_blocker_id = p_blocked_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_request', 'error', 'Invalid request');
  END IF;

  -- There may be no conversation row yet, so a row lock cannot serialize a
  -- first request against a new block. Both entry points take this same
  -- unordered-pair lock before looking at blocks or conversations. A hash
  -- collision only serializes unrelated pairs; it cannot weaken isolation.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      LEAST(p_blocker_id, p_blocked_id)::TEXT || ':' ||
      GREATEST(p_blocker_id, p_blocked_id)::TEXT,
      0
    )
  );

  INSERT INTO public.blocks (blocker_id, blocked_id)
  VALUES (p_blocker_id, p_blocked_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
  block_added := FOUND;

  -- Every still-open conversation between the two, in either direction, taken
  -- one row at a time under its own lock so the trigger can move capacity.
  FOR conv IN
    SELECT * FROM public.conversations
     WHERE status IN ('pending', 'confirmed')
       AND ((poster_id = p_blocker_id AND joiner_id = p_blocked_id)
         OR (poster_id = p_blocked_id AND joiner_id = p_blocker_id))
     ORDER BY id
       FOR UPDATE
  LOOP
    IF conv.status = 'confirmed' THEN
      refunded := refunded + 1;
    END IF;

    UPDATE public.conversations
       SET status = 'declined'
     WHERE id = conv.id;

    closed_ids := closed_ids || conv.id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'block_added', block_added,
    'closed', COALESCE(array_length(closed_ids, 1), 0),
    'seats_returned', refunded
  );
END;
$$;

REVOKE ALL ON FUNCTION public.block_and_close(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_and_close(UUID, UUID) TO service_role;

-- ── SENDING AN ORDINARY MESSAGE, ATOMICALLY ───────────────────────────────
-- The route used to read the conversation, read the blocks, count the day's
-- messages and then insert, in four statements. Everything checked could change
-- in the gaps: a decline, a withdrawal or a block landing between the read and
-- the insert still produced a message and an email, and two requests could both
-- pass the daily count before either inserted. Static mocks never showed it
-- because nothing else was running.
--
-- All of it now happens in one transaction, in this order:
--   1. lock the SENDER's profile row, which serializes that person's sends
--      across every conversation they are in, not merely this one;
--   2. lock the conversation row;
--   3. re-check participant, status and blocks under those locks;
--   4. count and compare the rolling 24 hour total;
--   5. insert exactly once.
--
-- A failure at any step raises or returns a refusal, and nothing is written.
-- The count is never coerced: a database error propagates and the route fails
-- closed rather than treating "unknown" as zero.
--
-- Lock order is profiles then conversations. Nothing else in this schema takes
-- those two in the other order, so this cannot deadlock against confirm,
-- withdraw or start_or_reopen (which take conversations then plans).
CREATE OR REPLACE FUNCTION public.send_conversation_message(
  p_conversation_id UUID,
  p_sender_id UUID,
  p_message TEXT,
  p_daily_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  conv public.conversations%ROWTYPE;
  msg TEXT := btrim(COALESCE(p_message, ''));
  recipient UUID;
  sent_today INTEGER;
  new_id UUID;
  new_at TIMESTAMPTZ;
BEGIN
  IF char_length(msg) < 1 OR char_length(msg) > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_message', 'error',
      'Message length out of range');
  END IF;

  -- Step 1. One sender, one lock, every conversation. Without this the daily
  -- limit is per request rather than per person.
  PERFORM 1 FROM public.profiles WHERE id = p_sender_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Not allowed');
  END IF;

  -- Step 2 and 3. Everything authoritative, re-read under the locks.
  SELECT * INTO conv
    FROM public.conversations
   WHERE id = p_conversation_id
     FOR UPDATE;

  IF conv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Conversation not found');
  END IF;

  IF conv.poster_id <> p_sender_id AND conv.joiner_id <> p_sender_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'error', 'Not allowed');
  END IF;

  IF conv.status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'closed', 'error', 'This conversation is closed.');
  END IF;

  recipient := CASE WHEN conv.poster_id = p_sender_id THEN conv.joiner_id ELSE conv.poster_id END;

  IF EXISTS (
    SELECT 1 FROM public.blocks
     WHERE (blocker_id = p_sender_id AND blocked_id = recipient)
        OR (blocker_id = recipient AND blocked_id = p_sender_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'blocked', 'error',
      'This conversation is no longer available.');
  END IF;

  -- Step 4. The rolling day, counted while this sender is locked. An error here
  -- aborts the transaction; it never becomes a zero.
  SELECT count(*) INTO STRICT sent_today
    FROM public.messages
   WHERE from_user_id = p_sender_id
     AND created_at >= now() - INTERVAL '24 hours';

  IF sent_today >= p_daily_limit THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited', 'error',
      'Message limit reached. Try again tomorrow.');
  END IF;

  -- Step 5. Exactly once.
  INSERT INTO public.messages (conversation_id, from_user_id, text)
  VALUES (conv.id, p_sender_id, msg)
  RETURNING id, created_at INTO new_id, new_at;

  RETURN jsonb_build_object(
    'ok', true,
    'message_id', new_id,
    'created_at', new_at,
    'conversation_id', conv.id,
    'recipient_id', recipient,
    'status', conv.status,
    'sent_today', sent_today + 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_conversation_message(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_conversation_message(UUID, UUID, TEXT, INTEGER) TO service_role;

-- ── STARTING A REQUEST, AND ASKING AGAIN, IN ONE PIECE ────────────────────
-- A request only means something because of the message that came with it. The
-- first version of this release created the conversation (or reopened a
-- withdrawn one) in the database and then inserted the opener as a second
-- statement, so a failed insert could leave a pending request with nothing in
-- it: the host sees somebody waiting and no reason why, and a re-request has
-- already spent its one allowed reopen. Both writes now happen inside one
-- function, so they commit together or not at all.
--
-- This is also the only entry point that moves a conversation into pending.
-- There is deliberately no separate reopen function: one that changed the
-- state without the opener is exactly the shape of the bug.
--
-- Lock order is conversation, then plan, matching confirm_conversation and
-- withdraw_conversation so the three can never deadlock against each other.
--
-- A declined request is NOT reopenable. The host said no; letting the same
-- person re-ask on the same plan would turn a decline into an invitation to
-- keep asking.
DROP FUNCTION IF EXISTS public.request_again_conversation(UUID, UUID);

CREATE OR REPLACE FUNCTION public.start_or_reopen_conversation(
  p_plan_id UUID,
  p_actor_id UUID,
  p_message TEXT,
  p_request_again BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  conv public.conversations%ROWTYPE;
  plan_row public.plans%ROWTYPE;
  host_id UUID;
  msg TEXT := btrim(COALESCE(p_message, ''));
  created BOOLEAN := false;
  reopened BOOLEAN := false;
BEGIN
  -- Nothing is written until the opener is known to be usable.
  IF char_length(msg) < 5 OR char_length(msg) > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_message', 'error',
      'Message must be 5-2000 characters');
  END IF;

  -- Read only the stable owner key first, then serialize this unordered user
  -- pair before looking for a conversation or a block. A first request has no
  -- row to lock, which is why the pair lock is the authority boundary.
  SELECT user_id INTO host_id
    FROM public.plans
   WHERE id = p_plan_id;

  IF host_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Plan not found.');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      LEAST(p_actor_id, host_id)::TEXT || ':' ||
      GREATEST(p_actor_id, host_id)::TEXT,
      0
    )
  );

  SELECT * INTO conv
    FROM public.conversations
   WHERE plan_id = p_plan_id
     AND joiner_id = p_actor_id
     FOR UPDATE;

  SELECT * INTO plan_row
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF plan_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'error', 'Plan not found.');
  END IF;

  -- Plan ownership is not editable in the application. Fail closed if an
  -- out-of-band writer changed it between the key read and the row lock.
  IF plan_row.user_id <> host_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'conflict', 'error', 'Please try again.');
  END IF;

  IF plan_row.user_id = p_actor_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'own_plan', 'error',
      'You cannot message your own plan.');
  END IF;

  -- A block in either direction makes the plan unavailable, the same as the
  -- feed and the roster. Checked here as well as in the route, because this is
  -- the statement that would otherwise write the row.
  IF EXISTS (
    SELECT 1 FROM public.blocks
     WHERE (blocker_id = p_actor_id AND blocked_id = plan_row.user_id)
        OR (blocker_id = plan_row.user_id AND blocked_id = p_actor_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'blocked', 'error', 'This plan is unavailable.');
  END IF;

  IF plan_row.status <> 'open' OR plan_row.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'plan_closed', 'error',
      'This plan is no longer open.');
  END IF;

  IF plan_row.spots_left < 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_spots', 'error', 'This plan has no spots left.');
  END IF;

  IF conv.id IS NULL THEN
    -- (plan_id, joiner_id) is unique. The plan row lock above serializes two
    -- simultaneous first messages, and this catch covers the rest.
    BEGIN
      INSERT INTO public.conversations (plan_id, poster_id, joiner_id)
      VALUES (p_plan_id, plan_row.user_id, p_actor_id)
      RETURNING * INTO conv;
      created := true;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO conv
        FROM public.conversations
       WHERE plan_id = p_plan_id
         AND joiner_id = p_actor_id
         FOR UPDATE;
    END;
  END IF;

  IF NOT created THEN
    -- Already pending or confirmed. This is not a new request and not a
    -- reopen, so it writes nothing: an opener here would be an ordinary
    -- message, and ordinary messages go through /api/messages where the daily
    -- limit lives. The caller is told the state it actually found.
    IF conv.status IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object(
        'ok', true,
        'conversation_id', conv.id,
        'host_id', plan_row.user_id,
        'status', conv.status,
        'created', false,
        'reopened', false,
        'message_written', false,
        'notify_host', false
      );
    END IF;

    IF conv.status = 'declined' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'declined', 'conversation_id', conv.id, 'error',
        'The host declined this one. That decision stands for this plan.');
    END IF;

    IF conv.status = 'withdrawn' THEN
      IF NOT COALESCE(p_request_again, false) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'withdrawn', 'conversation_id', conv.id, 'error',
          'You left this plan. You can ask the host again if you want back in.');
      END IF;

      IF conv.reopen_count >= 1 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'reopen_limit', 'conversation_id', conv.id, 'error',
          'You have already asked again once on this plan.');
      END IF;

      -- Back to pending only. A pending request never held a spot, so capacity
      -- is untouched and the host still decides.
      UPDATE public.conversations
         SET status = 'pending',
             reopened_at = now(),
             reopen_count = conv.reopen_count + 1
       WHERE id = conv.id
      RETURNING * INTO conv;
      reopened := true;
    END IF;
  END IF;

  -- The opener. If this raises, everything above it rolls back with it: no
  -- orphan pending conversation, and a re-request stays withdrawn with its
  -- reopen count unchanged.
  INSERT INTO public.messages (conversation_id, from_user_id, text)
  VALUES (conv.id, p_actor_id, msg);

  RETURN jsonb_build_object(
    'ok', true,
    'conversation_id', conv.id,
    'host_id', plan_row.user_id,
    'status', conv.status,
    'created', created,
    'reopened', reopened,
    'message_written', true,
    -- Exactly once for a new request or a genuine reopen. A repeat message on
    -- a thread that already exists is not news.
    'notify_host', (created OR reopened)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_or_reopen_conversation(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_or_reopen_conversation(UUID, UUID, TEXT, BOOLEAN) TO service_role;
