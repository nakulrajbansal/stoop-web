-- ═══════════════════════════════════════════════════════════════════════════
-- 0008 · THE DATABASE CONTRACT THE RUNNING CODE ACTUALLY DEPENDS ON
--
-- Migrations 0001-0007 were written as the product grew and drifted from the
-- code. A fresh Supabase project built from 0001-0007 alone is missing the
-- columns, tables and functions that today's web app and the iOS app both
-- assume exist: profiles.notify_email, the plans columns added after launch,
-- the `blocks` table and its `blocked_user_ids` RPC, and `conversation_reads`.
-- Production has them (they were applied by hand); nothing else did.
--
-- This migration closes that gap and is the one to run on a fresh environment
-- after 0001-0007. Every statement is idempotent (IF EXISTS / IF NOT EXISTS /
-- CREATE OR REPLACE / DROP POLICY then CREATE POLICY), so running it against
-- production - where most of this already exists - changes nothing except the
-- parts that were genuinely missing.
--
-- It also does three things that were never enforced in the database at all:
--   1. Blocks are enforced in RLS, not only in the HTTP routes, so a blocked
--      user holding a valid Supabase JWT cannot read around the API - via
--      PostgREST or via Realtime.
--   2. Objectionable text is rejected by a trigger, so a direct-to-Supabase
--      write cannot publish what the API would refuse.
--   3. Push-token registration is an atomic, ownership-checked function
--      rather than a client-steerable upsert.
--
-- ORDER: run AFTER 0001-0007. Nothing here drops or rewrites user data.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1 · PROFILES: the columns the notification and moderation code reads
-- ───────────────────────────────────────────────────────────────────────────

-- Where "someone joined your plan" lands. Private: never granted to the API
-- roles below, exactly like phone_e164 (see 0003).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_email TEXT;

-- 0002 added warned_at; restate here so a fresh project built from this file
-- alone still matches production.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS warned_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS digest_opt_out_at TIMESTAMPTZ;

-- Re-assert the 0003 column grants. SELECT on the table stays revoked; only
-- the display columns are readable by the API roles. notify_email, phone_e164,
-- blocked_at, warned_at and digest_opt_out_at are admin-client only.
--
-- INSERT/UPDATE are deliberately NOT narrowed: a member writes their own
-- notify_email during signup through the authenticated client, and RLS
-- restricts that to their own row.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, name, city_id, neighborhood_id, about,
  avatar_bg, avatar_fg, initials, is_founding_member, created_at
) ON public.profiles TO anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 2 · PLANS: the post-launch columns, categories and spot count
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS when_date DATE;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS when_time_specific TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS intent_tags TEXT[] NOT NULL DEFAULT '{}';

-- Backfill any pre-slug rows so the unique index below can be created. The
-- suffix keeps two identically-worded plans apart.
UPDATE public.plans
SET slug = trim(both '-' from regexp_replace(lower(left(text, 50)), '[^a-z0-9]+', '-', 'g'))
           || '-' || left(replace(id::text, '-', ''), 4)
WHERE slug IS NULL;

ALTER TABLE public.plans ALTER COLUMN slug SET NOT NULL;

-- The insert path picks a slug and only re-rolls once, so a collision was
-- always possible. De-duplicate before the unique index goes on, keeping the
-- oldest row's slug untouched (its URL may already be shared).
UPDATE public.plans p
SET slug = p.slug || '-' || left(replace(p.id::text, '-', ''), 4)
FROM (
  SELECT id, row_number() OVER (PARTITION BY slug ORDER BY created_at, id) AS n
  FROM public.plans
) dup
WHERE dup.id = p.id AND dup.n > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_slug ON public.plans(slug);

-- 'sports' was added to the product after 0001 and 3-spot plans shipped with
-- it. The original CHECK constraints still say otherwise on a fresh project.
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_category_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_category_check
  CHECK (category IN ('coffee','outdoors','arts','food','books','music','sports'));

ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_spots_total_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_spots_total_check
  CHECK (spots_total IN (1, 2, 3));

-- Two tags maximum, and only tags the product actually offers.
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_intent_tags_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_intent_tags_check
  CHECK (
    array_length(intent_tags, 1) IS NULL
    OR (
      array_length(intent_tags, 1) <= 2
      AND intent_tags <@ ARRAY[
        'just-social','dog-friendly','bring-something','quiet','loud','free','paid'
      ]::text[]
    )
  );


-- ───────────────────────────────────────────────────────────────────────────
-- 3 · BLOCKS + CONVERSATION READS: tables the code has always assumed
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.blocks(blocked_id);

-- Blocks are written by the API through the service role after it has verified
-- the caller. RLS on with a read-own policy: a member may see who they have
-- blocked, and nobody can see who has blocked them (that is the "silent" part
-- of the product rule).
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their own blocks" ON public.blocks;
CREATE POLICY "Members read their own blocks"
  ON public.blocks FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id);

CREATE TABLE IF NOT EXISTS public.conversation_reads (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their own read marks" ON public.conversation_reads;
CREATE POLICY "Members read their own read marks"
  ON public.conversation_reads FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members write their own read marks" ON public.conversation_reads;
CREATE POLICY "Members write their own read marks"
  ON public.conversation_reads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members update their own read marks" ON public.conversation_reads;
CREATE POLICY "Members update their own read marks"
  ON public.conversation_reads FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ───────────────────────────────────────────────────────────────────────────
-- 4 · BLOCK LOOKUP FUNCTIONS
-- ───────────────────────────────────────────────────────────────────────────

-- Every id in a block relationship with `for_user`, in either direction. This
-- is the RPC `@/lib/blocks` calls. SECURITY DEFINER because a member may not
-- read rows where they are the blocked party.
CREATE OR REPLACE FUNCTION public.blocked_user_ids(for_user UUID)
RETURNS TABLE (other_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT blocked_id FROM public.blocks WHERE blocker_id = for_user
  UNION
  SELECT blocker_id FROM public.blocks WHERE blocked_id = for_user;
$$;

REVOKE ALL ON FUNCTION public.blocked_user_ids(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.blocked_user_ids(UUID) TO authenticated, service_role;

-- The RLS predicate: is the CURRENT caller in a block relationship with
-- `other`, in either direction? Returns false for anonymous callers, which
-- keeps the existing public read policies working unchanged.
CREATE OR REPLACE FUNCTION public.is_blocked_with(other UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR other IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.blocks
      WHERE (blocker_id = auth.uid() AND blocked_id = other)
         OR (blocker_id = other AND blocked_id = auth.uid())
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_blocked_with(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_with(UUID) TO anon, authenticated, service_role;


-- ───────────────────────────────────────────────────────────────────────────
-- 5 · BLOCKS ENFORCED IN RLS
--
-- Until now a block was enforced only by the HTTP routes. Anyone holding their
-- own Supabase access token could read the other person's profile, plans,
-- conversations and messages straight from PostgREST, and receive their
-- messages over Realtime, because Realtime evaluates the same SELECT policies.
-- These policies close that hole at the source.
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR NOT public.is_blocked_with(id));

DROP POLICY IF EXISTS "Plans readable by all" ON public.plans;
CREATE POLICY "Plans readable by all"
  ON public.plans FOR SELECT
  USING (status <> 'removed' AND NOT public.is_blocked_with(user_id));

DROP POLICY IF EXISTS "Users insert own plans" ON public.plans;
CREATE POLICY "Users insert own plans"
  ON public.plans FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Participants read conversations" ON public.conversations;
CREATE POLICY "Participants read conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    (auth.uid() = poster_id AND NOT public.is_blocked_with(joiner_id))
    OR (auth.uid() = joiner_id AND NOT public.is_blocked_with(poster_id))
  );

DROP POLICY IF EXISTS "Joiner starts conversation" ON public.conversations;
CREATE POLICY "Joiner starts conversation"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = joiner_id AND NOT public.is_blocked_with(poster_id));

DROP POLICY IF EXISTS "Poster updates conversation status" ON public.conversations;
CREATE POLICY "Poster updates conversation status"
  ON public.conversations FOR UPDATE TO authenticated
  USING (auth.uid() = poster_id AND NOT public.is_blocked_with(joiner_id))
  WITH CHECK (auth.uid() = poster_id);

DROP POLICY IF EXISTS "Read messages in own conversations" ON public.messages;
CREATE POLICY "Read messages in own conversations"
  ON public.messages FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE (auth.uid() = poster_id AND NOT public.is_blocked_with(joiner_id))
         OR (auth.uid() = joiner_id AND NOT public.is_blocked_with(poster_id))
    )
  );

DROP POLICY IF EXISTS "Send to own conversations" ON public.messages;
CREATE POLICY "Send to own conversations"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = from_user_id
    AND conversation_id IN (
      SELECT id FROM public.conversations
      WHERE (auth.uid() = poster_id AND NOT public.is_blocked_with(joiner_id))
         OR (auth.uid() = joiner_id AND NOT public.is_blocked_with(poster_id))
    )
  );


-- ───────────────────────────────────────────────────────────────────────────
-- 6 · OBJECTIONABLE-TEXT FILTER, ENFORCED BY THE DATABASE
--
-- The App Store requires a method for filtering objectionable content from
-- user-generated text. Doing it in the iOS app would be theatre: the website
-- and any client holding an anon key write to these tables directly. So the
-- rule lives in a trigger, and `src/lib/text-moderation.ts` mirrors it only so
-- the API can answer with a readable message instead of a raw SQL error.
--
-- This is a deliberately narrow blocklist of unambiguous slurs, explicit
-- sexual solicitation and direct threats. It is NOT a claim of complete
-- moderation - it cannot catch novel phrasing, and human report review
-- (/admin/reports) remains the real backstop. It is tuned to avoid false
-- positives: matching is on word boundaries after normalisation, so ordinary
-- words that merely contain a listed substring are unaffected.
-- ───────────────────────────────────────────────────────────────────────────

-- Lowercase, undo common letter/digit substitution, and collapse a letter
-- repeated three or more times. Word boundaries are preserved.
CREATE OR REPLACE FUNCTION public.moderation_normalize(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
           translate(lower(coalesce(input, '')), '0134578@$!|', 'oieastbas' || 'il'),
           '(.)\1{2,}', '\1\1', 'g'
         );
$$;

-- The same string with every separator removed, so "f.u.c.k" and "f u c k"
-- collapse. Only the long, unmistakable terms are matched against this form -
-- matching short words here is what produces Scunthorpe-style false positives.
CREATE OR REPLACE FUNCTION public.moderation_squash(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(public.moderation_normalize(input), '[^a-z0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.contains_blocked_language(input TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  -- Matched on word boundaries in the normalised text.
  -- Categories: slurs · explicit sexual solicitation · direct threats.
  --
  -- Terms with a common innocent sense are deliberately absent, even when they
  -- are also used as slurs: "fag" (cigarette), "dyke" (levee, and a reclaimed
  -- self-description), "spic" ("spic and span"), "cum" (cum laude), "escort"
  -- (to walk someone somewhere), "bareback" (riding), "kill you" ("that hill
  -- will kill you"), "underage" (as in warning about it). Rejecting those would
  -- punish ordinary posts, and a rejected post is a worse failure here than a
  -- missed one that report review can still catch.
  word_terms TEXT[] := ARRAY[
    'nigger','nigga','faggot','tranny','retard','retarded','kike',
    'chink','wetback','coon','shemale',
    'whore','slut','rape','raped','raping','rapist',
    'molest','molested','molesting','pedophile','paedophile',
    'hooker','prostitute','incall','outcall',
    'blowjob','handjob','creampie','deepthroat','gangbang',
    'kys','kill yourself','shoot you','stab you','beat you up',
    'child porn','cp for sale'
  ];
  -- Matched after every separator is stripped. Long enough that an accidental
  -- substring hit is not realistic.
  squashed_terms TEXT[] := ARRAY[
    'nigger','faggot','childporn','killyourself','rapeyou','prostitute',
    'blowjob','gangbang','pedophile','paedophile'
  ];
  normalized TEXT := public.moderation_normalize(input);
  squashed TEXT := public.moderation_squash(input);
  term TEXT;
BEGIN
  IF input IS NULL OR length(btrim(input)) = 0 THEN
    RETURN false;
  END IF;

  -- Two allowances, mirrored exactly by wordPattern() in
  -- src/lib/text-moderation.ts:
  --   * every letter may repeat ('s+l+u+t+'), so 'sluuut' is caught. Collapsing
  --     runs to two in moderation_normalize is not enough on its own, and
  --     collapsing to one would mangle ordinary words like 'bookkeeper'.
  --   * a space means "one or more separators", so 'kill yourself' also matches
  --     'kill-yourself'.
  FOREACH term IN ARRAY word_terms LOOP
    IF normalized ~ (
      '(^|[^a-z0-9])'
      || regexp_replace(regexp_replace(term, '([a-z0-9])', '\1+', 'g'), ' ', '[^a-z0-9]+', 'g')
      || '([^a-z0-9]|$)'
    ) THEN
      RETURN true;
    END IF;
  END LOOP;

  FOREACH term IN ARRAY squashed_terms LOOP
    IF position(term IN squashed) > 0 THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_blocked_language()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  field TEXT;
BEGIN
  FOREACH field IN ARRAY TG_ARGV LOOP
    IF public.contains_blocked_language(
         (to_jsonb(NEW) ->> field)
       ) THEN
      RAISE EXCEPTION 'stoop_blocked_language: %', field
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plans_reject_blocked_language ON public.plans;
CREATE TRIGGER plans_reject_blocked_language
  BEFORE INSERT OR UPDATE OF text, spot ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.reject_blocked_language('text', 'spot');

DROP TRIGGER IF EXISTS messages_reject_blocked_language ON public.messages;
CREATE TRIGGER messages_reject_blocked_language
  BEFORE INSERT OR UPDATE OF text ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.reject_blocked_language('text');

DROP TRIGGER IF EXISTS profiles_reject_blocked_language ON public.profiles;
CREATE TRIGGER profiles_reject_blocked_language
  BEFORE INSERT OR UPDATE OF name, about ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.reject_blocked_language('name', 'about');


-- ───────────────────────────────────────────────────────────────────────────
-- 7 · PUSH TOKEN REGISTRATION WITH REAL OWNERSHIP
--
-- The route used to revoke every row sharing a client-supplied installation_id
-- and then upsert on the token. Both keys come from the client, so one caller
-- could switch off another member's notifications by guessing an installation
-- id, or point a known token at their own account and have that person's phone
-- start receiving the caller's notifications.
--
-- This function does the whole thing in one statement-level transaction and
-- refuses the second case outright.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.register_push_token(
  p_user_id UUID,
  p_token TEXT,
  p_platform TEXT,
  p_installation_id TEXT,
  p_app_version TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  owner UUID;
  revoked TIMESTAMPTZ;
  now_ts TIMESTAMPTZ := now();
BEGIN
  SELECT user_id, revoked_at INTO owner, revoked
  FROM public.push_tokens
  WHERE expo_push_token = p_token
  FOR UPDATE;

  -- Someone else's live device. Refuse: rebinding it would silently redirect
  -- their notifications to this caller's account.
  IF owner IS NOT NULL AND owner <> p_user_id AND revoked IS NULL THEN
    RETURN 'conflict';
  END IF;

  -- Retire this member's older tokens for the same install. Scoped to the
  -- caller, so a guessed installation id cannot touch anyone else's rows.
  UPDATE public.push_tokens
  SET revoked_at = now_ts, updated_at = now_ts
  WHERE user_id = p_user_id
    AND installation_id = p_installation_id
    AND expo_push_token <> p_token
    AND revoked_at IS NULL;

  INSERT INTO public.push_tokens (
    user_id, expo_push_token, platform, installation_id, app_version,
    created_at, updated_at, last_used_at, revoked_at
  )
  VALUES (
    p_user_id, p_token, p_platform, p_installation_id, p_app_version,
    now_ts, now_ts, now_ts, NULL
  )
  ON CONFLICT (expo_push_token) DO UPDATE
  SET user_id = p_user_id,
      platform = EXCLUDED.platform,
      installation_id = EXCLUDED.installation_id,
      app_version = EXCLUDED.app_version,
      updated_at = now_ts,
      last_used_at = now_ts,
      revoked_at = NULL;

  RETURN 'ok';
END;
$$;

-- Service role only: the route calls this after verifying the bearer token.
REVOKE ALL ON FUNCTION public.register_push_token(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_token(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;


-- ───────────────────────────────────────────────────────────────────────────
-- 8 · ATOMIC CONFIRM / DECLINE
--
-- Confirming used to be "read the row, check status, write the new status".
-- Two taps racing each other both saw `pending`, both wrote, and both sent a
-- confirmation email and push. This makes the transition the check: exactly
-- one caller can move a conversation out of `pending`, and the caller learns
-- whether it was them.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_conversation(
  p_conversation_id UUID,
  p_poster_id UUID,
  p_status TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated INT;
  existing TEXT;
BEGIN
  IF p_status NOT IN ('confirmed', 'declined') THEN
    RETURN 'invalid';
  END IF;

  UPDATE public.conversations
  SET status = p_status
  WHERE id = p_conversation_id
    AND poster_id = p_poster_id
    AND status = 'pending';

  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated = 1 THEN
    RETURN 'updated';
  END IF;

  SELECT status INTO existing
  FROM public.conversations
  WHERE id = p_conversation_id AND poster_id = p_poster_id;

  IF existing IS NULL THEN
    RETURN 'not_found';
  END IF;

  RETURN 'already_resolved';
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_conversation(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_conversation(UUID, UUID, TEXT) TO service_role;


-- ───────────────────────────────────────────────────────────────────────────
-- 9 · ACCOUNT DELETION STAYS COMPLETE
--
-- Deleting an auth user cascades to profiles, and from profiles to plans,
-- conversations, messages, reports, blocks, conversation_reads and
-- push_tokens. plan_feedback.responder_id had no foreign key at all, so a
-- deleted member's feedback rows outlived them. Add it, cascading.
-- ───────────────────────────────────────────────────────────────────────────

DELETE FROM public.plan_feedback
WHERE responder_id NOT IN (SELECT id FROM public.profiles);

ALTER TABLE public.plan_feedback
  DROP CONSTRAINT IF EXISTS plan_feedback_responder_id_fkey;
ALTER TABLE public.plan_feedback
  ADD CONSTRAINT plan_feedback_responder_id_fkey
  FOREIGN KEY (responder_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


-- ───────────────────────────────────────────────────────────────────────────
-- 10 · REALTIME
--
-- 0001 adds messages and conversations to the publication. Repeat it safely so
-- a fresh project that ran 0001 before these policies existed still ends up
-- subscribed - and note that Realtime evaluates the SELECT policies above, so
-- the block rules apply to the socket as well as to REST.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END
$$;
