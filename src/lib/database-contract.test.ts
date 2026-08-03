import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INTENT_TAGS, PLAN_CATEGORIES } from './utils';

/**
 * The checks a live database would make, made against the checked-in
 * migrations instead — no credentials required.
 *
 * This exists because the schema and the code had genuinely drifted: a fresh
 * Supabase project built from migrations 0001-0007 was missing
 * profiles.notify_email, four plans columns, the `blocks` table, the
 * `blocked_user_ids` RPC and `conversation_reads`, all of which the running
 * product uses on every request. Nothing caught it, because nothing checked.
 */

const DIR = 'supabase/migrations';
const FILES = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
const ALL_SQL = FILES.map(f => readFileSync(join(DIR, f), 'utf8')).join('\n');
const CONTRACT = readFileSync(join(DIR, '0008_mobile_contract.sql'), 'utf8');

describe('migration set', () => {
  it('is numbered contiguously from 0001', () => {
    const numbers = FILES.map(f => Number(f.slice(0, 4)));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it('ends with the mobile contract migration', () => {
    expect(FILES.at(-1)).toBe('0008_mobile_contract.sql');
  });
});

describe('every table the runtime queries exists in a migration', () => {
  // Kept in step with `grep -o "\.from('[a-z_]*'" src` by hand; the assertion
  // below is what makes a forgotten one visible.
  const TABLES = [
    'cities', 'neighborhoods', 'profiles', 'plans', 'conversations', 'messages',
    'reports', 'otp_attempts', 'ops_items', 'plan_feedback',
    'blocks', 'conversation_reads', 'push_tokens'
  ];

  for (const table of TABLES) {
    it(`creates ${table}`, () => {
      const created = new RegExp(`CREATE TABLE (IF NOT EXISTS )?(public\\.)?${table}\\b`, 'i');
      expect(created.test(ALL_SQL), `no CREATE TABLE for ${table}`).toBe(true);
    });
  }
});

describe('every column the runtime selects exists in a migration', () => {
  const COLUMNS: Record<string, string[]> = {
    profiles: ['notify_email', 'warned_at', 'digest_opt_out_at', 'blocked_at'],
    plans: ['slug', 'when_date', 'when_time_specific', 'intent_tags'],
    conversations: ['followup_sent_at'],
    reports: ['conversation_id', 'resolved_at'],
    conversation_reads: ['last_seen_at'],
    push_tokens: ['expo_push_token', 'installation_id', 'revoked_at']
  };

  for (const [table, columns] of Object.entries(COLUMNS)) {
    for (const column of columns) {
      it(`${table}.${column}`, () => {
        expect(ALL_SQL).toMatch(new RegExp(`\\b${column}\\b`));
      });
    }
  }

  it('adds the post-launch plans columns idempotently, not with a bare ALTER', () => {
    for (const column of ['slug', 'when_date', 'when_time_specific', 'intent_tags']) {
      expect(CONTRACT).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
  });

  it('adds profiles.notify_email idempotently', () => {
    expect(CONTRACT).toMatch(/ALTER TABLE public\.profiles\s+ADD COLUMN IF NOT EXISTS notify_email TEXT;/);
  });
});

describe('every function the runtime calls exists in a migration', () => {
  for (const fn of [
    'blocked_user_ids',
    'is_blocked_with',
    'is_active_member',
    'register_push_token',
    'resolve_conversation',
    'claim_welcome_email',
    'mark_welcome_email_sent',
    'contains_blocked_language',
    'expire_old_plans'
  ]) {
    it(`creates ${fn}`, () => {
      expect(ALL_SQL).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION (public\\.)?${fn}\\b`));
    });
  }

  it('pins search_path on every SECURITY DEFINER function', () => {
    // Without it, a caller-controlled search_path can point `public.blocks` at
    // a table they own and the definer's privileges execute against it.
    const definers = [...CONTRACT.matchAll(
      /CREATE OR REPLACE FUNCTION public\.(\w+)[\s\S]*?AS \$\$/g
    )];
    for (const definer of definers) {
      if (!definer[0].includes('SECURITY DEFINER')) continue;
      expect(definer[0], `${definer[1]} has no SET search_path`)
        .toMatch(/SET search_path = public, pg_temp/);
    }
  });
});

describe('the check constraints match what the API accepts', () => {
  it('allows exactly the categories the API validates', () => {
    const match = /plans_category_check\s+CHECK \(category IN \(([^)]*)\)\)/.exec(CONTRACT);
    expect(match, 'plans_category_check not found').toBeTruthy();
    const inSql = [...match![1].matchAll(/'([^']*)'/g)].map(m => m[1]);
    expect(inSql.sort()).toEqual([...PLAN_CATEGORIES].sort());
  });

  it('allows exactly the intent tags the API offers', () => {
    const match = /intent_tags <@ ARRAY\[([\s\S]*?)\]::text\[\]/.exec(CONTRACT);
    expect(match, 'intent_tags constraint not found').toBeTruthy();
    const inSql = [...match![1].matchAll(/'([^']*)'/g)].map(m => m[1]);
    expect(inSql.sort()).toEqual(INTENT_TAGS.map(t => t.id).sort());
  });

  it('allows 1, 2 or 3 spots, which is what the API validates', () => {
    expect(CONTRACT).toMatch(/plans_spots_total_check\s+CHECK \(spots_total IN \(1, 2, 3\)\)/);
  });
});

describe('blocks are enforced in row level security, not only in the routes', () => {
  const BLOCK_AWARE = [
    'Profiles readable by authenticated',
    'Plans readable by all',
    'Participants read conversations',
    'Joiner starts conversation',
    'Read messages in own conversations',
    'Send to own conversations'
  ];

  for (const policy of BLOCK_AWARE) {
    it(`"${policy}" consults is_blocked_with`, () => {
      const block = new RegExp(
        `CREATE POLICY "${policy}"[\\s\\S]*?;`, 'm'
      ).exec(CONTRACT);
      expect(block, `policy ${policy} not found`).toBeTruthy();
      expect(block![0]).toContain('is_blocked_with');
    });
  }

  it('drops each policy before recreating it, so re-running is safe', () => {
    for (const policy of BLOCK_AWARE) {
      expect(CONTRACT).toContain(`DROP POLICY IF EXISTS "${policy}"`);
    }
  });

  it('checks both directions of a block', () => {
    expect(CONTRACT).toMatch(/blocker_id = auth\.uid\(\) AND blocked_id = other/);
    expect(CONTRACT).toMatch(/blocker_id = other AND blocked_id = auth\.uid\(\)/);
  });
});

/**
 * A suspended member keeps a valid Supabase access token until it expires.
 * `suspensionGate` runs in the HTTP routes, so until 0008 that token still
 * worked against PostgREST and Realtime: a suspended account could publish a
 * plan, open a conversation, send a message and rename its public profile
 * without ever calling the API.
 */
describe('suspension is enforced in row level security, not only in the routes', () => {
  function policy(name: string): string {
    const found = new RegExp(`CREATE POLICY "${name}"[\\s\\S]*?;`, 'm').exec(CONTRACT);
    expect(found, `policy ${name} not found`).toBeTruthy();
    return found![0];
  }

  // Every direct authenticated write that publishes or changes something
  // another member can see.
  const STANDING_GATED = [
    'Users insert own plans',
    'Users update own plans',
    'Joiner starts conversation',
    'Poster updates conversation status',
    'Send to own conversations',
    'Users update own profile'
  ];

  for (const name of STANDING_GATED) {
    it(`"${name}" requires an active account`, () => {
      expect(policy(name)).toContain('is_active_member()');
    });
  }

  it('puts the standing check in WITH CHECK, so it governs the row being written', () => {
    for (const name of STANDING_GATED) {
      const withCheck = /WITH CHECK \(([\s\S]*)\)/.exec(policy(name));
      expect(withCheck, `${name} has no WITH CHECK`).toBeTruthy();
      expect(withCheck![1], `${name}`).toContain('is_active_member()');
    }
  });

  it('drops each policy before recreating it, so re-running is safe', () => {
    for (const name of STANDING_GATED) {
      expect(CONTRACT).toContain(`DROP POLICY IF EXISTS "${name}"`);
    }
  });

  it('treats a caller with no profile row as active, so signup still works', () => {
    const fn = /CREATE OR REPLACE FUNCTION public\.is_active_member[\s\S]*?\$\$;/.exec(CONTRACT);
    expect(fn).toBeTruthy();
    // NOT EXISTS(suspended row) — an absent profile is mid-signup, not suspended.
    expect(fn![0]).toMatch(/NOT EXISTS \([\s\S]*?blocked_at IS NOT NULL/);
    // And an anonymous caller is never "active".
    expect(fn![0]).toMatch(/WHEN auth\.uid\(\) IS NULL THEN false/);
  });

  it('is SECURITY DEFINER, because blocked_at is not readable by the API roles', () => {
    const fn = /CREATE OR REPLACE FUNCTION public\.is_active_member[\s\S]*?\$\$;/.exec(CONTRACT);
    expect(fn![0]).toContain('SECURITY DEFINER');
    expect(fn![0]).toContain('SET search_path = public, pg_temp');
  });

  /**
   * Suspension stops someone reaching other members. It must not trap them in
   * the product or take away the protective controls while they are reviewed.
   */
  it('leaves the protective escape routes open', () => {
    // Read marks: no standing check anywhere in their policies.
    for (const name of ['Members write their own read marks', 'Members update their own read marks']) {
      const found = new RegExp(`CREATE POLICY "${name}"[\\s\\S]*?;`, 'm').exec(CONTRACT);
      expect(found, name).toBeTruthy();
      expect(found![0]).not.toContain('is_active_member');
    }

    // Taking your own plan down is a removal, not a publication.
    expect(policy('Users update own plans')).toMatch(/is_active_member\(\) OR status = 'removed'/);

    // Deleting your own plan outright is untouched by this migration, so 0001's
    // policy still stands with no standing condition on it.
    expect(CONTRACT).not.toContain('DROP POLICY IF EXISTS "Users delete own plans"');
  });

  it('does not gate blocking or reporting on standing', () => {
    expect(CONTRACT).not.toMatch(/CREATE POLICY[^;]*ON public\.blocks[^;]*is_active_member/);
    expect(CONTRACT).not.toMatch(/CREATE POLICY[^;]*ON public\.reports[^;]*is_active_member/);
  });
});

describe('the block list RPC is not an enumeration tool', () => {
  /**
   * `blocked_user_ids(for_user)` takes an ARBITRARY id and answers with that
   * person's block relationships in both directions — including who has blocked
   * them, which the product promises nobody can see. Granted to `authenticated`
   * it let any signed-in member walk another member's block graph.
   */
  it('is service-role only', () => {
    expect(CONTRACT).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.blocked_user_ids\(UUID\) TO service_role;/
    );
    expect(CONTRACT).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.blocked_user_ids\(UUID\) TO [^;]*authenticated/
    );
    expect(CONTRACT).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.blocked_user_ids\(UUID\) FROM anon, authenticated;/
    );
  });

  it('keeps the self-scoped predicate available to ordinary clients', () => {
    // is_blocked_with() answers only about the CURRENT caller, so it is safe
    // where blocked_user_ids() is not — and the read policies need it.
    expect(CONTRACT).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.is_blocked_with\(UUID\) TO anon, authenticated, service_role;/
    );
  });
});

describe('account deletion still cascades', () => {
  // Deleting the auth user cascades to profiles; everything that points at a
  // person has to cascade from there or it outlives them.
  const CASCADING = [
    ['blocks', 'blocker_id'],
    ['blocks', 'blocked_id'],
    ['conversation_reads', 'user_id'],
    ['plan_feedback', 'responder_id']
  ] as const;

  for (const [table, column] of CASCADING) {
    it(`${table}.${column} cascades from profiles`, () => {
      const pattern = new RegExp(
        `${column}[\\s\\S]{0,120}?REFERENCES public\\.profiles\\(id\\) ON DELETE CASCADE`
      );
      expect(pattern.test(CONTRACT), `${table}.${column} does not cascade`).toBe(true);
    });
  }
});

describe('private columns stay private', () => {
  it('grants the API roles only the display columns of profiles', () => {
    const match = /GRANT SELECT \(([\s\S]*?)\) ON public\.profiles TO anon, authenticated;/.exec(CONTRACT);
    expect(match, 'profiles column grant not found').toBeTruthy();
    const granted = match![1].split(',').map(s => s.trim()).filter(Boolean);

    for (const secret of ['phone_e164', 'notify_email', 'blocked_at', 'warned_at', 'digest_opt_out_at']) {
      expect(granted, `${secret} must not be readable by anon/authenticated`).not.toContain(secret);
    }
    expect(granted).toContain('name');
    expect(granted).toContain('initials');
  });

  it('revokes table-wide SELECT before granting columns', () => {
    const revokeAt = CONTRACT.indexOf('REVOKE SELECT ON public.profiles FROM anon, authenticated;');
    const grantAt = CONTRACT.indexOf('GRANT SELECT (');
    expect(revokeAt).toBeGreaterThan(-1);
    expect(revokeAt).toBeLessThan(grantAt);
  });

  it('keeps push_tokens away from the API roles entirely', () => {
    expect(ALL_SQL).toContain('REVOKE ALL ON public.push_tokens FROM anon, authenticated;');
  });

  it('restricts the service-role-only functions to the service role', () => {
    for (const fn of ['register_push_token', 'resolve_conversation']) {
      const grant = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`);
      expect(grant.test(CONTRACT), `${fn} grant`).toBe(true);
      expect(CONTRACT).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC;`));
    }
  });
});

describe('push token registration cannot be steered by the client', () => {
  const REGISTER = /CREATE OR REPLACE FUNCTION public\.register_push_token[\s\S]*?\$\$;/.exec(CONTRACT)![0];

  it('scopes the same-install revoke to the calling user', () => {
    expect(REGISTER).toMatch(/UPDATE public\.push_tokens[\s\S]*?WHERE user_id = p_user_id\s+AND installation_id = p_installation_id/);
  });

  it('refuses to rebind a token that is live under another account', () => {
    expect(REGISTER).toMatch(/IF owner IS NOT NULL AND owner <> p_user_id AND revoked IS NULL THEN\s+RETURN 'conflict';/);
  });

  /**
   * `SELECT ... FOR UPDATE` locks nothing when the row does not exist, which is
   * every FIRST registration of a token. Two accounts registering the same
   * token concurrently therefore both read "no owner", and the unconditional
   * ON CONFLICT then let the second one take it.
   */
  it('serialises on the token itself, not on a row that may not exist yet', () => {
    expect(REGISTER).toMatch(/pg_advisory_xact_lock\(hashtextextended\(p_token, 0\)\)/);
    // Taken before anything reads or writes the row.
    expect(REGISTER.indexOf('pg_advisory_xact_lock'))
      .toBeLessThan(REGISTER.indexOf('SELECT user_id, revoked_at'));
  });

  it('carries the ownership condition into the upsert, so the write cannot rebind either', () => {
    const upsert = /ON CONFLICT \(expo_push_token\) DO UPDATE[\s\S]*?;/.exec(REGISTER);
    expect(upsert, 'upsert not found').toBeTruthy();
    expect(upsert![0]).toMatch(
      /WHERE push_tokens\.user_id = p_user_id\s+OR push_tokens\.revoked_at IS NOT NULL/
    );
    // A conditional DO UPDATE that matches nothing is silent, so the row count
    // has to be the thing that reports the conflict.
    expect(REGISTER).toMatch(/GET DIAGNOSTICS affected = ROW_COUNT;[\s\S]*?IF affected = 0 THEN\s+RETURN 'conflict';/);
  });
});

describe('confirm/decline is atomic, and checks capacity', () => {
  const RESOLVE = /CREATE OR REPLACE FUNCTION public\.resolve_conversation[\s\S]*?\$\$;/.exec(CONTRACT)![0];

  it('puts the pending guard in the UPDATE, not only in a prior read', () => {
    expect(RESOLVE).toMatch(/UPDATE public\.conversations[\s\S]*?AND status = 'pending';/);
    expect(RESOLVE).toContain('GET DIAGNOSTICS updated = ROW_COUNT');
  });

  /**
   * The status guard alone stopped double-notifying but not overselling: the
   * function confirmed any pending conversation, and 0001's trigger decremented
   * spots_left with a GREATEST(0, ...) floor. A one-spot plan with three
   * pending requests confirmed all three.
   */
  it('locks the conversation and then the plan, always in that order', () => {
    const convLock = /SELECT plan_id, status INTO[\s\S]*?FROM public\.conversations[\s\S]*?FOR UPDATE;/.exec(RESOLVE);
    const planLock = /FROM public\.plans[\s\S]*?FOR UPDATE;/.exec(RESOLVE);
    expect(convLock, 'conversation is not locked').toBeTruthy();
    expect(planLock, 'plan is not locked').toBeTruthy();
    // One order everywhere is what makes two concurrent confirms unable to
    // deadlock against each other.
    expect(convLock!.index).toBeLessThan(planLock!.index);
  });

  it('reads capacity under the lock and refuses a full plan', () => {
    expect(RESOLVE).toMatch(/SELECT status, spots_left, expires_at/);
    expect(RESOLVE).toMatch(/plan_status <> 'open' OR plan_spots_left < 1 THEN\s+RETURN 'full';/);
  });

  it('refuses a removed, expired, or past-its-time plan, and says closed rather than full', () => {
    expect(RESOLVE).toMatch(
      /plan_status IN \('removed', 'expired'\) OR plan_expires_at < now\(\) THEN\s+RETURN 'closed';/
    );
    expect(RESOLVE.indexOf("RETURN 'closed'")).toBeLessThan(RESOLVE.indexOf("RETURN 'full'"));
  });

  it('never consults the plan when declining, so a decline consumes no capacity', () => {
    // Everything between the confirmed-guard and the UPDATE is the capacity
    // block, and nothing outside it may touch the plan.
    const guardAt = RESOLVE.indexOf("IF p_status = 'confirmed' THEN");
    const updateAt = RESOLVE.indexOf('UPDATE public.conversations');
    expect(guardAt, 'capacity check is not guarded by the status').toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(updateAt);

    const guarded = RESOLVE.slice(guardAt, updateAt);
    expect(guarded).toContain('FROM public.plans');
    expect(guarded).toContain("RETURN 'full'");
    expect(guarded).toContain("RETURN 'closed'");

    const outside = RESOLVE.slice(0, guardAt) + RESOLVE.slice(updateAt);
    expect(outside).not.toContain('public.plans');
  });

  it('reports every outcome the route maps', () => {
    for (const outcome of ['updated', 'already_resolved', 'full', 'closed', 'not_found', 'invalid']) {
      expect(RESOLVE, outcome).toContain(`RETURN '${outcome}'`);
    }
  });
});

/**
 * /api/welcome was bounded by the age of the account and nothing else, so every
 * call inside the first fifteen minutes sent another email.
 */
describe('the welcome email is claimed once, in the database', () => {
  const CLAIM = /CREATE OR REPLACE FUNCTION public\.claim_welcome_email[\s\S]*?\$\$;/.exec(CONTRACT)![0];

  it('keeps the marker table away from the API roles entirely', () => {
    expect(CONTRACT).toContain('CREATE TABLE IF NOT EXISTS public.welcome_emails');
    expect(CONTRACT).toContain('ALTER TABLE public.welcome_emails ENABLE ROW LEVEL SECURITY;');
    expect(CONTRACT).toContain('REVOKE ALL ON public.welcome_emails FROM anon, authenticated;');
  });

  it('claims through the primary key, so concurrent callers serialise', () => {
    expect(CLAIM).toMatch(/INSERT INTO public\.welcome_emails[\s\S]*?ON CONFLICT \(user_id\) DO UPDATE/);
    // No row came back means somebody else holds it.
    expect(CLAIM).toMatch(/IF claimed IS NULL THEN\s+RETURN 'already_claimed';/);
  });

  it('never re-claims a row that has already been sent', () => {
    expect(CLAIM).toMatch(/WHERE welcome_emails\.sent_at IS NULL/);
  });

  it('lets a failed send retry once the claim ages out, and caps the attempts', () => {
    expect(CLAIM).toMatch(/claimed_at < now\(\) - p_retry_after/);
    expect(CLAIM).toMatch(/attempts < p_max_attempts/);
  });

  it('cascades with the account', () => {
    expect(CONTRACT).toMatch(/user_id UUID PRIMARY KEY REFERENCES public\.profiles\(id\) ON DELETE CASCADE/);
  });

  it('restricts both welcome functions to the service role', () => {
    for (const fn of ['claim_welcome_email', 'mark_welcome_email_sent']) {
      expect(CONTRACT).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`));
      expect(CONTRACT).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC;`));
    }
  });
});

/**
 * 0008 is not purely additive, and the header used to say it was. Four
 * statements change existing rows; a reader deciding whether it is safe to run
 * against production has to be told which.
 */
describe('the migration header describes what it actually does', () => {
  const HEADER = CONTRACT.slice(0, CONTRACT.indexOf('-- ─'));

  it('does not claim to leave existing data alone', () => {
    expect(HEADER).not.toMatch(/Nothing here drops or rewrites user data/);
    expect(HEADER).toMatch(/IT IS NOT PURELY ADDITIVE/);
  });

  it('names each mutating statement', () => {
    expect(HEADER).toMatch(/BACKFILLS `plans\.slug`/);
    expect(HEADER).toMatch(/DE-DUPLICATES `plans\.slug`/);
    expect(HEADER).toMatch(/DELETES rows from `plan_feedback`/);
    expect(HEADER).toMatch(/REPLACES three CHECK constraints/);
  });

  it('gives a preflight query for every constraint that can abort the migration', () => {
    // ADD CONSTRAINT validates existing rows and errors out on a violation, so
    // each of these has to be counted on a restored copy first.
    expect(HEADER).toMatch(/where category not in/);
    expect(HEADER).toMatch(/where spots_total not in/);
    expect(HEADER).toMatch(/array_length\(intent_tags,1\) > 2/);
  });
});

describe('idempotency', () => {
  it('uses IF EXISTS / IF NOT EXISTS / OR REPLACE for every create in 0008', () => {
    const creates = [...CONTRACT.matchAll(/^CREATE (TABLE|INDEX|UNIQUE INDEX|FUNCTION|POLICY|TRIGGER)/gm)];
    // Every bare CREATE must be one of the guarded forms.
    for (const create of creates) {
      const line = CONTRACT.slice(create.index!, CONTRACT.indexOf('\n', create.index!));
      expect(line, line).toMatch(/IF NOT EXISTS|OR REPLACE|^CREATE POLICY|^CREATE TRIGGER/);
    }
  });

  it('drops each trigger before creating it', () => {
    for (const trigger of [
      'plans_reject_blocked_language',
      'messages_reject_blocked_language',
      'profiles_reject_blocked_language'
    ]) {
      expect(CONTRACT).toContain(`DROP TRIGGER IF EXISTS ${trigger}`);
    }
  });

  it('never drops a table or a column', () => {
    expect(CONTRACT).not.toMatch(/DROP TABLE/i);
    expect(CONTRACT).not.toMatch(/DROP COLUMN/i);
  });
});
