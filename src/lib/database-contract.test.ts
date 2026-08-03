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
    'register_push_token',
    'resolve_conversation',
    'contains_blocked_language',
    'expire_old_plans'
  ]) {
    it(`creates ${fn}`, () => {
      expect(ALL_SQL).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION (public\\.)?${fn}\\b`));
    });
  }
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
  it('scopes the same-install revoke to the calling user', () => {
    const fn = /CREATE OR REPLACE FUNCTION public\.register_push_token[\s\S]*?\$\$;/.exec(CONTRACT);
    expect(fn).toBeTruthy();
    const body = fn![0];
    expect(body).toMatch(/UPDATE public\.push_tokens[\s\S]*?WHERE user_id = p_user_id\s+AND installation_id = p_installation_id/);
  });

  it('refuses to rebind a token that is live under another account', () => {
    expect(CONTRACT).toMatch(/IF owner IS NOT NULL AND owner <> p_user_id AND revoked IS NULL THEN\s+RETURN 'conflict';/);
  });
});

describe('confirm/decline is atomic', () => {
  it('puts the pending guard in the UPDATE, not in a prior read', () => {
    const fn = /CREATE OR REPLACE FUNCTION public\.resolve_conversation[\s\S]*?\$\$;/.exec(CONTRACT);
    expect(fn).toBeTruthy();
    expect(fn![0]).toMatch(/UPDATE public\.conversations[\s\S]*?AND status = 'pending';/);
    expect(fn![0]).toContain('GET DIAGNOSTICS updated = ROW_COUNT');
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
