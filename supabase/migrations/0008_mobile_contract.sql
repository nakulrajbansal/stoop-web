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
-- CREATE OR REPLACE / DROP POLICY then CREATE POLICY), so re-running it is safe.
--
-- It also does five things that were never enforced in the database at all:
--   1. Blocks are enforced in RLS, not only in the HTTP routes, so a blocked
--      user holding a valid Supabase JWT cannot read around the API - via
--      PostgREST or via Realtime.
--   2. Suspension is enforced in RLS. A suspended member keeps a perfectly
--      valid Supabase JWT until it expires, so the route-level gate alone left
--      PostgREST and Realtime open to them.
--   3. Objectionable text is rejected by a trigger, so a direct-to-Supabase
--      write cannot publish what the API would refuse.
--   4. Push-token registration is an atomic, ownership-checked function
--      rather than a client-steerable upsert.
--   5. Confirming a join request checks plan capacity inside the same locked
--      transaction that moves the status, so racing confirms cannot oversell
--      a plan.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- IT IS NOT PURELY ADDITIVE. Four statements change existing rows, and they
-- are the reason this file needs a staging run before production:
--
--   * §2 BACKFILLS `plans.slug` for every row where it is NULL, then sets the
--     column NOT NULL.
--   * §2 DE-DUPLICATES `plans.slug` by appending a suffix to every row but the
--     oldest of each duplicate group, so a unique index can be created. A
--     changed slug changes that plan's URL.
--   * §2 REPLACES three CHECK constraints on `plans`. Each ADD CONSTRAINT
--     validates the existing rows and will ERROR OUT, aborting the migration,
--     if any row violates it. See the preflight queries below.
--   * §9 DELETES rows from `plan_feedback` whose `responder_id` no longer
--     matches a profile, so a cascading foreign key can be added. Those rows
--     belong to already-deleted accounts.
--
-- PREFLIGHT - run these against a restored copy of production first. Every one
-- must return 0, or the corresponding ADD CONSTRAINT in §2 will abort:
--
--   select count(*) from plans
--    where category not in ('coffee','outdoors','arts','food','books','music','sports');
--   select count(*) from plans where spots_total not in (1,2,3);
--   select count(*) from plans
--    where array_length(intent_tags,1) > 2
--       or not (intent_tags <@ array['just-social','dog-friendly','bring-something',
--                                    'quiet','loud','free','paid']::text[]);
--
-- And these two report what the mutating statements will touch:
--
--   select count(*) from plans where slug is null;                  -- backfilled
--   select count(*) from (select slug from plans group by slug
--                          having count(*) > 1) d;                  -- de-duplicated
--   select count(*) from plan_feedback
--    where responder_id not in (select id from profiles);           -- deleted
--
-- ORDER: run AFTER 0001-0007. Nothing here drops a table or a column.
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
-- 4 · BLOCK AND STANDING LOOKUP FUNCTIONS
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

-- Service role only. This takes an ARBITRARY user id and answers with that
-- person's block relationships in both directions - including who has blocked
-- them, which is the one thing the product promises nobody can see. Granting it
-- to `authenticated` let any signed-in member enumerate any other member's
-- block graph one id at a time. Every caller is a server route or the cron, all
-- of which hold the service role, so nothing loses a capability here.
--
-- The RLS predicate below (`is_blocked_with`) is the self-scoped question and
-- stays available to ordinary clients.
REVOKE ALL ON FUNCTION public.blocked_user_ids(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.blocked_user_ids(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.blocked_user_ids(UUID) TO service_role;

-- Is the CURRENT caller an account in good standing?
--
-- Suspension (`profiles.blocked_at`) was enforced only by `suspensionGate` in
-- the HTTP routes. A suspended member keeps a valid Supabase access token until
-- it expires, and can post plans, start conversations, send messages and edit
-- their public profile straight through PostgREST with it. This predicate is
-- what the write policies below consult so the suspension holds at the source.
--
-- SECURITY DEFINER because `profiles.blocked_at` is deliberately not readable
-- by the API roles (0003), so an ordinary caller cannot evaluate this for
-- themselves.
--
-- A caller with no profile row is `true`: they verified their phone and have
-- not finished signup. Returning false there would make signup impossible.
-- This matches `accountStanding()` in `@/lib/moderation` exactly.
CREATE OR REPLACE FUNCTION public.is_active_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND blocked_at IS NOT NULL
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_active_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_member() TO authenticated, service_role;

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
-- 5 · BLOCKS AND SUSPENSION ENFORCED IN RLS
--
-- Until now a block was enforced only by the HTTP routes. Anyone holding their
-- own Supabase access token could read the other person's profile, plans,
-- conversations and messages straight from PostgREST, and receive their
-- messages over Realtime, because Realtime evaluates the same SELECT policies.
--
-- Suspension had the same shape of hole on the write side. `suspensionGate`
-- runs in the routes, and a suspended member's JWT keeps working against
-- PostgREST until it expires, so they could still publish a plan, open a
-- conversation, send a message and rename their public profile.
--
-- The rule below: every direct authenticated write that publishes or changes
-- something another member can see requires `is_active_member()`. The
-- protective, self-service paths deliberately do NOT - a suspension stops
-- someone reaching other members, it does not trap them in the product:
--
--   * account deletion         - service role, no RLS involved
--   * blocking and reporting   - `blocks` / `reports` writes, untouched
--   * read marks               - `conversation_reads`, untouched (§3)
--   * push revocation          - service role, and the route has no gate
--   * taking your own plan down - DELETE stays open, and the UPDATE policy
--     admits `status = 'removed'` while suspended
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR NOT public.is_blocked_with(id));

-- name and about are shown next to every plan and in every conversation, so a
-- suspended member editing them is publishing. 0001 had no WITH CHECK at all
-- (it defaults to the USING clause); this states both.
--
-- Deliberately covers the whole row rather than only name/about: the columns an
-- ordinary client may write here ARE the public ones. `notify_email` is set
-- once at signup by the INSERT policy below, and `digest_opt_out_at` is written
-- by the unsubscribe route through the service role, so neither escape route
-- passes through this policy.
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND public.is_active_member());

DROP POLICY IF EXISTS "Plans readable by all" ON public.plans;
CREATE POLICY "Plans readable by all"
  ON public.plans FOR SELECT
  USING (status <> 'removed' AND NOT public.is_blocked_with(user_id));

DROP POLICY IF EXISTS "Users insert own plans" ON public.plans;
CREATE POLICY "Users insert own plans"
  ON public.plans FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_active_member());

-- Editing a plan is publishing. Taking it down is not: `status = 'removed'`
-- hides the row from the SELECT policy above, so a suspended member can always
-- withdraw their own plan even though they cannot change a live one.
DROP POLICY IF EXISTS "Users update own plans" ON public.plans;
CREATE POLICY "Users update own plans"
  ON public.plans FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (public.is_active_member() OR status = 'removed')
  );

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
  WITH CHECK (
    auth.uid() = joiner_id
    AND NOT public.is_blocked_with(poster_id)
    AND public.is_active_member()
  );

DROP POLICY IF EXISTS "Poster updates conversation status" ON public.conversations;
CREATE POLICY "Poster updates conversation status"
  ON public.conversations FOR UPDATE TO authenticated
  USING (auth.uid() = poster_id AND NOT public.is_blocked_with(joiner_id))
  WITH CHECK (auth.uid() = poster_id AND public.is_active_member());

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
    AND public.is_active_member()
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
-- This function does the whole thing in one transaction and refuses the second
-- case outright.
--
-- Two things the first version got wrong, both only visible under concurrency:
--
--   * `SELECT ... FOR UPDATE` locks nothing when the row does not exist yet.
--     For a token nobody has registered before - which is every first
--     registration - the ownership read and the upsert were not serialised
--     against each other at all.
--   * The `ON CONFLICT DO UPDATE` was unconditional, so whatever the ownership
--     read had decided, the write itself would happily rebind the row. Two
--     accounts registering the same token at the same moment therefore both saw
--     "no owner", and the second one took it.
--
-- Both are closed here. A transaction-scoped advisory lock keyed on the token
-- serialises everything touching one token, and the upsert carries the
-- ownership condition itself, so the invariant holds even if the lock is ever
-- removed. A zero-row upsert is the conflict.
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
  affected INT;
  now_ts TIMESTAMPTZ := now();
BEGIN
  -- Serialise every registration of THIS token, whether or not a row exists
  -- yet. Released automatically at the end of the transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_token, 0));

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
      revoked_at = NULL
  -- The ownership check, restated where the write actually happens: take the
  -- row only if it is already ours, or if its owner has retired it.
  -- `push_tokens.x` is the EXISTING row here, which is what ON CONFLICT gives
  -- the WHERE clause. `EXCLUDED.x` above is the row we tried to insert.
  WHERE push_tokens.user_id = p_user_id
     OR push_tokens.revoked_at IS NOT NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected = 0 THEN
    RETURN 'conflict';
  END IF;

  RETURN 'ok';
END;
$$;

-- Service role only: the route calls this after verifying the bearer token.
REVOKE ALL ON FUNCTION public.register_push_token(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_token(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;


-- ───────────────────────────────────────────────────────────────────────────
-- 8 · ATOMIC CONFIRM / DECLINE, WITH CAPACITY
--
-- Confirming used to be "read the row, check status, write the new status".
-- Two taps racing each other both saw `pending`, both wrote, and both sent a
-- confirmation email and push.
--
-- Moving the status guard into the UPDATE fixed the double-notify but not the
-- thing underneath it: the function confirmed ANY pending conversation, and the
-- AFTER UPDATE trigger from 0001 then decremented `spots_left` with a
-- GREATEST(0, ...) floor. So a plan with one spot and three pending requests
-- confirmed all three, each one a promise to a real person, and the count
-- simply bottomed out at zero. Nothing in the product ever checked that a plan
-- still had room at the moment of confirmation.
--
-- Now the conversation row is locked first, then the plan row, always in that
-- order (so two confirmations can never deadlock against each other), and the
-- capacity check happens while both locks are held. Two callers racing for the
-- last spot serialise on the plan's row lock; the loser re-reads the committed
-- `spots_left` of 0 and is told 'full'.
--
-- Outcomes, all mapped in `src/app/api/conversations/route.ts`:
--   updated          - this caller made the transition. The only one that may notify.
--   already_resolved - somebody (possibly this caller, retrying) got there first.
--   full             - the plan has no spots left.
--   closed           - the plan is removed, expired, or past `expires_at`.
--   not_found        - no such conversation for this poster.
--   invalid          - not a status this function will write.
--
-- Declining never consults the plan: turning someone down consumes no capacity
-- and must keep working on a full, closed or expired plan.
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
  conv_plan_id UUID;
  conv_status TEXT;
  plan_status TEXT;
  plan_spots_left INT;
  plan_expires_at TIMESTAMPTZ;
  updated INT;
BEGIN
  IF p_status NOT IN ('confirmed', 'declined') THEN
    RETURN 'invalid';
  END IF;

  -- Lock order, everywhere: conversation, then plan.
  SELECT plan_id, status INTO conv_plan_id, conv_status
  FROM public.conversations
  WHERE id = p_conversation_id AND poster_id = p_poster_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF conv_status <> 'pending' THEN
    RETURN 'already_resolved';
  END IF;

  IF p_status = 'confirmed' THEN
    SELECT status, spots_left, expires_at
      INTO plan_status, plan_spots_left, plan_expires_at
    FROM public.plans
    WHERE id = conv_plan_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN 'not_found';
    END IF;

    -- Closed before full: an expired plan should say so rather than report a
    -- capacity problem it does not have.
    IF plan_status IN ('removed', 'expired') OR plan_expires_at < now() THEN
      RETURN 'closed';
    END IF;
    IF plan_status <> 'open' OR plan_spots_left < 1 THEN
      RETURN 'full';
    END IF;
  END IF;

  UPDATE public.conversations
  SET status = p_status
  WHERE id = p_conversation_id
    AND poster_id = p_poster_id
    AND status = 'pending';

  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated <> 1 THEN
    -- Unreachable while the row lock above is held; kept so a future caller
    -- that drops the lock still fails closed rather than reporting success.
    RETURN 'already_resolved';
  END IF;

  RETURN 'updated';
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
--
-- MUTATING: the DELETE below removes plan_feedback rows whose responder no
-- longer exists. They belong to accounts that were already deleted and should
-- have taken this data with them; the missing foreign key is why they did not.
-- Count them first with the preflight query in the header.
-- ───────────────────────────────────────────────────────────────────────────

DELETE FROM public.plan_feedback
WHERE responder_id NOT IN (SELECT id FROM public.profiles);

ALTER TABLE public.plan_feedback
  DROP CONSTRAINT IF EXISTS plan_feedback_responder_id_fkey;
ALTER TABLE public.plan_feedback
  ADD CONSTRAINT plan_feedback_responder_id_fkey
  FOREIGN KEY (responder_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


-- ───────────────────────────────────────────────────────────────────────────
-- 10 · WELCOME EMAIL, SENT AT MOST ONCE
--
-- /api/welcome decided whether to send from `profiles.created_at` alone: any
-- account younger than fifteen minutes got a welcome email, every time the
-- route was called. The app calls it once, but nothing enforced that - a
-- retried request, a double tap, or fifty concurrent calls all delivered mail.
-- "Age-bounded" is a bound on the window, not on the number of sends.
--
-- The claim below is the bound. `claim_welcome_email` inserts the marker row
-- and returns 'claimed' only to the caller that actually created it; everyone
-- else gets 'already_claimed'. Concurrent callers serialise on the primary key,
-- so exactly one send attempt is made.
--
-- If the provider then fails, the claim is deliberately NOT released. It
-- expires on its own after `p_retry_after`, which keeps a failed send
-- retryable without opening a window where two callers both hold a claim. The
-- send itself also carries a Resend idempotency key derived from the user id,
-- so even a retry that races the provider's own recovery delivers one email.
-- `attempts` caps the whole thing at five tries no matter what.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.welcome_emails (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0
);

-- Same treatment as push_tokens: RLS on, no policies, grants revoked. Only the
-- service role reaches it, and only through the two functions below.
ALTER TABLE public.welcome_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.welcome_emails FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_welcome_email(
  p_user_id UUID,
  p_retry_after INTERVAL DEFAULT INTERVAL '5 minutes',
  p_max_attempts INT DEFAULT 5
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed UUID;
BEGIN
  INSERT INTO public.welcome_emails (user_id, claimed_at, sent_at, attempts)
  VALUES (p_user_id, now(), NULL, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET claimed_at = now(),
      attempts = welcome_emails.attempts + 1
  -- Re-claim only an unsent row whose previous claim has aged out, and only
  -- while there are attempts left. A row with sent_at set is never re-claimed.
  -- `welcome_emails.x` is the EXISTING row, which is what makes this a check on
  -- what is already there rather than on what we just tried to insert.
  WHERE welcome_emails.sent_at IS NULL
    AND welcome_emails.claimed_at < now() - p_retry_after
    AND welcome_emails.attempts < p_max_attempts
  RETURNING user_id INTO claimed;

  IF claimed IS NULL THEN
    RETURN 'already_claimed';
  END IF;
  RETURN 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_welcome_email_sent(p_user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.welcome_emails
  SET sent_at = now()
  WHERE user_id = p_user_id AND sent_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.claim_welcome_email(UUID, INTERVAL, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_welcome_email(UUID, INTERVAL, INT) TO service_role;
REVOKE ALL ON FUNCTION public.mark_welcome_email_sent(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_welcome_email_sent(UUID) TO service_role;


-- ───────────────────────────────────────────────────────────────────────────
-- 11 · REALTIME
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
