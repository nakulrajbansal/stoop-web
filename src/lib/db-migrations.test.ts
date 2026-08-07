/**
 * These tests read the migration SQL as text. They do not connect to Postgres,
 * so they prove the shape of what would run, not that a database accepted it.
 * The live rehearsal is a separate, manual gate (see docs/RUNBOOK.md).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations');
const CLARITY = '20260805210000_plan_clarity_contract.sql';
const WITHDRAWAL = '20260805211500_conversation_withdrawal.sql';
const HARDENING = '20260806090000_postdeploy_boundary_hardening.sql';

const read = (file: string) => readFileSync(join(DIR, file), 'utf8');

describe('migration numbering', () => {
  it('adds all three files after every migration already in the repo', () => {
    const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
    expect(files).toContain(CLARITY);
    expect(files).toContain(WITHDRAWAL);
    expect(files).toContain(HARDENING);
    // Only the files that predate this trio. Later releases add later
    // timestamps of their own, and they have their own ordering tests
    // (src/lib/signup-migrations.test.ts); they are not "previous".
    const previous = files.filter(f => f < CLARITY);
    for (const file of previous) {
      // The repo numbers old migrations 000N and new ones by timestamp, so a
      // timestamped name has to sort last either way.
      expect(CLARITY > file).toBe(true);
    }
    expect(WITHDRAWAL > CLARITY).toBe(true);
  });
});

describe('plan clarity migration', () => {
  const sql = read(CLARITY);

  it('adds cost_expectation without breaking rows that predate it', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS cost_expectation TEXT/i);
    expect(sql).not.toMatch(/cost_expectation TEXT NOT NULL/i);
    expect(sql).toMatch(/cost_expectation IS NULL OR cost_expectation IN \('free', 'pay-own-way', 'ticket-required'\)/);
  });

  it('drops the old constraint first so it can be run twice', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS plans_cost_expectation_check/i);
  });

  it('backfills only the value that is unambiguous, and never invents one', () => {
    expect(sql).toMatch(/SET cost_expectation = 'free'/);
    expect(sql).not.toMatch(/SET cost_expectation = 'pay-own-way'/);
    expect(sql).not.toMatch(/SET cost_expectation = 'ticket-required'/);
  });

  it('guards the backfill on a column this repo never created', () => {
    expect(sql).toMatch(/information_schema\.columns/);
    expect(sql).toMatch(/column_name = 'intent_tags'/);
  });

  it('does not force a meeting point or a time onto existing rows', () => {
    expect(sql).not.toMatch(/ALTER COLUMN spot SET NOT NULL/i);
    expect(sql).not.toMatch(/ALTER COLUMN when_time_specific SET NOT NULL/i);
  });
});

describe('withdrawal migration', () => {
  const sql = read(WITHDRAWAL);

  it('adds withdrawn to the conversation states', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS conversations_status_check/i);
    expect(sql).toMatch(/'pending', 'confirmed', 'declined', 'withdrawn'/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ/i);
  });

  it('replaces the old confirm-only trigger', () => {
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS on_conversation_confirmed ON public\.conversations/i);
    expect(sql).toMatch(/CREATE TRIGGER on_conversation_status_change/i);
  });

  it('locks the plan row before it touches capacity, in both directions', () => {
    const locks = sql.match(/FROM public\.plans\s+WHERE id = [^;]*FOR UPDATE/gi) ?? [];
    expect(locks.length).toBeGreaterThanOrEqual(2);
  });

  it('refuses to overbook instead of clamping at zero', () => {
    expect(sql).toMatch(/spots_left < 1/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
    expect(sql).not.toMatch(/GREATEST\(0, spots_left - 1\)/);
  });

  it('restores exactly one spot, capped at the size the plan was posted with', () => {
    expect(sql).toMatch(/LEAST\(plan_row\.spots_total, plan_row\.spots_left \+ 1\)/);
    expect(sql).toMatch(/WHEN plan_row\.status = 'full' THEN 'open'/);
  });

  it('returns early when the request is already withdrawn, so no second refund', () => {
    expect(sql).toMatch(/already/i);
    expect(sql).toMatch(/conv\.status = 'withdrawn'/);
  });

  it('lets only the requester withdraw and only the host decide', () => {
    expect(sql).toMatch(/conv\.joiner_id <> p_actor_id/);
    expect(sql).toMatch(/conv\.poster_id <> p_actor_id/);
  });
});

describe('only Stoop moves a request', () => {
  // These are contract steps: they break the previous release, so they run
  // after the deploy, not with the expand migrations.
  const sql = read(HARDENING);

  it('takes UPDATE on conversations away from the API roles', () => {
    expect(sql).toMatch(/REVOKE UPDATE ON public\.conversations FROM anon, authenticated/i);
  });

  it('adds a guard trigger that runs before the write', () => {
    expect(sql).toMatch(/CREATE TRIGGER guard_conversation_status\s+BEFORE UPDATE ON public\.conversations/i);
    expect(sql).toMatch(/RAISE EXCEPTION 'conversation status is set by Stoop, not by a client'/);
    expect(sql).toMatch(/ERRCODE = '42501'/);
  });

  it('leaves the guard as an invoker function, or it would see the wrong user', () => {
    const after = sql.split('CREATE OR REPLACE FUNCTION public.guard_conversation_status')[1] ?? '';
    // The declaration only, up to the body: a SECURITY DEFINER trigger would
    // report its own owner as current_user and let every client through.
    const header = after.split('AS $$')[0];
    expect(header).not.toMatch(/SECURITY DEFINER/);
    expect(header).toMatch(/SET search_path = public, pg_temp/);
    expect(after.split('$$;')[0]).toMatch(/pg_has_role\(current_user, 'service_role', 'USAGE'\)/);
  });

  it('still lets the service role and the lifecycle functions through', () => {
    expect(sql).toMatch(/pg_has_role\(current_user, table_owner, 'USAGE'\)/);
  });
});

describe('asking again', () => {
  const sql = read(WITHDRAWAL);

  it('records the re-request rather than erasing the withdrawal', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS reopen_count INTEGER NOT NULL DEFAULT 0/i);
    expect(sql).not.toMatch(/withdrawn_at = NULL/);
  });

  it('is capped, requester only, and never reopens a decline', () => {
    const fn = sql.split('CREATE OR REPLACE FUNCTION public.start_or_reopen_conversation')[1] ?? '';
    expect(fn).toMatch(/conv\.status = 'declined'/);
    expect(fn).toMatch(/conv\.reopen_count >= 1/);
    expect(fn).toMatch(/SET status = 'pending'/);
  });
});

describe('a request and its opener are one transaction', () => {
  const sql = read(WITHDRAWAL);
  const fn = sql.split('CREATE OR REPLACE FUNCTION public.start_or_reopen_conversation')[1]?.split('$$;')[0] ?? '';

  it('writes the opening message inside the same function that changes the state', () => {
    expect(fn).toMatch(/INSERT INTO public\.conversations/);
    expect(fn).toMatch(/INSERT INTO public\.messages/);
  });

  it('does not leave a second entry point that moves state without the opener', () => {
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.request_again_conversation/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.request_again_conversation/i);
  });

  it('checks the message before it writes anything', () => {
    const beforeFirstWrite = fn.split('INSERT INTO public.conversations')[0];
    expect(beforeFirstWrite).toMatch(/char_length\(msg\) < 5 OR char_length\(msg\) > 2000/);
  });

  it('keeps the whole guest list of checks the route used to do', () => {
    expect(fn).toMatch(/plan_row\.user_id = p_actor_id/);      // not your own plan
    expect(fn).toMatch(/public\.blocks/);                        // either direction
    expect(fn).toMatch(/plan_row\.status <> 'open'/);            // plan open
    expect(fn).toMatch(/plan_row\.spots_left < 1/);              // capacity
    expect(fn).toMatch(/unique_violation/);                      // one row per joiner
  });

  it('takes the pair lock before the conversation, then locks the authoritative plan row', () => {
    const ownerRead = fn.indexOf('FROM public.plans');
    const pairLock = fn.indexOf('pg_advisory_xact_lock');
    const convLock = fn.indexOf('FROM public.conversations');
    const planLock = fn.lastIndexOf('FROM public.plans');
    expect(ownerRead).toBeGreaterThan(-1);
    expect(pairLock).toBeGreaterThan(ownerRead);
    expect(convLock).toBeGreaterThan(pairLock);
    expect(planLock).toBeGreaterThan(convLock);
  });

  it('shares the unordered user-pair lock with block_and_close', () => {
    const blockFn = sql.split('CREATE OR REPLACE FUNCTION public.block_and_close')[1]?.split('$$;')[0] ?? '';
    for (const body of [fn, blockFn]) {
      expect(body).toMatch(/pg_advisory_xact_lock/);
      expect(body).toMatch(/hashtextextended/);
      expect(body).toMatch(/LEAST\(/);
      expect(body).toMatch(/GREATEST\(/);
    }
  });

  it('tells the caller whether the host should hear about it', () => {
    expect(fn).toMatch(/'notify_host'/);
  });
});

describe('function security', () => {
  const sql = read(WITHDRAWAL) + '\n' + read(CLARITY);
  const names = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\s*\(/g)].map(m => m[1]);

  it('defines the three service-only entry points', () => {
    expect(names).toContain('withdraw_conversation');
    expect(names).toContain('confirm_conversation');
    expect(names).toContain('start_or_reopen_conversation');
  });

  it('pins the search path on every function it defines', () => {
    const definitions = sql.split('CREATE OR REPLACE FUNCTION').slice(1);
    for (const body of definitions) {
      expect(body).toMatch(/SET search_path = public, pg_temp/);
    }
  });

  it('revokes execute from the API roles and grants it to service_role only', () => {
    for (const name of ['withdraw_conversation', 'confirm_conversation', 'start_or_reopen_conversation']) {
      const revoke = new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon, authenticated`, 'i');
      const grant = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO service_role`, 'i');
      expect(sql).toMatch(revoke);
      expect(sql).toMatch(grant);
    }
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION[^;]*TO (anon|authenticated)/i);
  });

  it('does not hand joiners a direct update path to the conversation status', () => {
    expect(sql).not.toMatch(/CREATE POLICY[^;]*conversations FOR UPDATE[^;]*joiner_id/is);
  });
});

describe('expand and contract are separate migrations', () => {
  const expand = read(WITHDRAWAL);
  const contract = read(HARDENING);

  it('runs everything additive before the deploy, and nothing that breaks the old code', () => {
    // The exact projection expression is pinned in profile-identity.test.ts,
    // next to the TypeScript that has to agree with it.
    expect(expand).toMatch(/ADD COLUMN IF NOT EXISTS display_name TEXT\s+GENERATED ALWAYS AS[\s\S]{0,400}STORED;/);
    expect(expand).toMatch(/GRANT SELECT \(display_name\) ON public\.profiles TO anon, authenticated/);
    // None of these may appear before the new code is serving.
    expect(expand).not.toMatch(/REVOKE SELECT \(name\)/);
    expect(expand).not.toMatch(/REVOKE INSERT ON public\.(conversations|messages)/);
    expect(expand).not.toMatch(/REVOKE UPDATE ON public\.conversations/);
    expect(expand).not.toMatch(/DROP POLICY IF EXISTS "Joiner starts conversation"/);
    expect(expand).not.toMatch(/DROP POLICY IF EXISTS "Send to own conversations"/);
    expect(expand).not.toMatch(/CREATE TRIGGER guard_conversation_status/);
  });

  it('closes every legacy path in the postdeploy migration', () => {
    // A column-only REVOKE does not beat a legacy table-level SELECT grant.
    expect(contract).toMatch(/REVOKE SELECT ON public\.profiles FROM anon, authenticated/);
    expect(contract).toMatch(/GRANT SELECT \([\s\S]*display_name[\s\S]*\) ON public\.profiles TO anon, authenticated/);
    expect(contract).not.toMatch(/GRANT SELECT \([\s\S]*\bname\b[\s\S]*\) ON public\.profiles/);
    expect(contract).toMatch(/DROP POLICY IF EXISTS "Joiner starts conversation" ON public\.conversations/);
    expect(contract).toMatch(/REVOKE INSERT ON public\.conversations FROM anon, authenticated/);
    expect(contract).toMatch(/DROP POLICY IF EXISTS "Send to own conversations" ON public\.messages/);
    expect(contract).toMatch(/REVOKE INSERT ON public\.messages FROM anon, authenticated/);
    expect(contract).toMatch(/REVOKE UPDATE ON public\.conversations FROM anon, authenticated/);
    expect(contract).toMatch(/CREATE TRIGGER guard_conversation_status\s+BEFORE UPDATE ON public\.conversations/);
  });

  it('says plainly that it runs after the deploy, and is idempotent', () => {
    expect(contract).toMatch(/ONLY AFTER the reviewed application code is deployed/i);
    expect(contract).toMatch(/DROP TRIGGER IF EXISTS guard_conversation_status/i);
    expect(contract).toMatch(/Safe to run more than once/i);
  });

  it('sorts after both expand migrations', () => {
    const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
    expect(files).toContain(HARDENING);
    expect(HARDENING > WITHDRAWAL).toBe(true);
  });

  it('does not hand the API roles a view or the private columns', () => {
    for (const sql of [expand, contract]) {
      expect(sql).not.toMatch(/CREATE (OR REPLACE )?VIEW/i);
      expect(sql).not.toMatch(/GRANT SELECT \(name\)/);
      expect(sql).not.toMatch(/GRANT SELECT[^;]*notify_email/);
      expect(sql).not.toMatch(/GRANT SELECT[^;]*phone_e164/);
    }
  });

  it('leaves an already active conversation alone rather than writing another opener', () => {
    const fn = expand.split('CREATE OR REPLACE FUNCTION public.start_or_reopen_conversation')[1]?.split('$$;')[0] ?? '';
    expect(fn).toMatch(/conv\.status IN \('pending', 'confirmed'\)/);
    expect(fn).toMatch(/'message_written', false/);
  });
});

describe('blocking gives the seat back', () => {
  const sql = read(WITHDRAWAL);
  const fn = sql.split('CREATE OR REPLACE FUNCTION public.block_and_close')[1]?.split('$$;')[0] ?? '';

  it('refunds a confirmed seat however it is given up, and never for a plain decline', () => {
    const trigger = sql.split('CREATE OR REPLACE FUNCTION public.handle_conversation_status_change')[1]?.split('$$;')[0] ?? '';
    expect(trigger).toMatch(/OLD\.status = 'confirmed' AND NEW\.status IN \('withdrawn', 'declined'\)/);
    // Pending to declined never reaches the refund branch.
    expect(trigger).not.toMatch(/NEW\.status = 'declined' THEN[\s\S]{0,120}spots_left \+ 1/);
  });

  it('writes the block and closes the conversations in one function', () => {
    expect(fn).toMatch(/INSERT INTO public\.blocks/);
    expect(fn).toMatch(/SET status = 'declined'/);
    expect(fn).toMatch(/FOR UPDATE/);
    expect(fn).toMatch(/ON CONFLICT \(blocker_id, blocked_id\) DO NOTHING/);
  });

  it('is service_role only and pins its search path', () => {
    expect(fn).toMatch(/SET search_path = public, pg_temp/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.block_and_close\([^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.block_and_close\([^)]*\) TO service_role/);
  });

  it('reports what it did, so the route can say it', () => {
    expect(fn).toMatch(/'seats_returned'/);
    expect(fn).toMatch(/'closed'/);
  });
});

describe('sending a message is one transaction', () => {
  const sql = read(WITHDRAWAL);
  const fn = sql.split('CREATE OR REPLACE FUNCTION public.send_conversation_message')[1]?.split('$$;')[0] ?? '';

  it('exists, is service_role only, and pins its search path', () => {
    expect(fn).toMatch(/SET search_path = public, pg_temp/);
    expect(fn).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.send_conversation_message\([^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.send_conversation_message\([^)]*\) TO service_role/);
  });

  it('serializes the sender across every conversation before it counts', () => {
    const lockAt = fn.indexOf('FROM public.profiles WHERE id = p_sender_id\n     FOR UPDATE');
    const profileLock = fn.match(/FROM public\.profiles WHERE id = p_sender_id[\s\S]{0,30}FOR UPDATE/);
    expect(profileLock).not.toBeNull();
    // The count comes after the lock, or the limit is per request rather than
    // per person.
    expect(fn.indexOf('count(*)')).toBeGreaterThan(fn.indexOf('FOR UPDATE'));
  });

  it('re-checks participant, status and blocks under the locks', () => {
    expect(fn).toMatch(/conv\.poster_id <> p_sender_id AND conv\.joiner_id <> p_sender_id/);
    expect(fn).toMatch(/conv\.status NOT IN \('pending', 'confirmed'\)/);
    expect(fn).toMatch(/FROM public\.blocks/);
    const insertAt = fn.indexOf('INSERT INTO public.messages');
    expect(fn.indexOf('public.blocks')).toBeLessThan(insertAt);
    expect(fn.indexOf('sent_today >= p_daily_limit')).toBeLessThan(insertAt);
  });

  it('never turns a count error into a zero', () => {
    expect(fn).toMatch(/INTO STRICT sent_today/);
    expect(fn).not.toMatch(/COALESCE\(\s*count/i);
  });

  it('schema-qualifies every table it touches', () => {
    const bare = fn.match(/(FROM|INTO|UPDATE)\s+(?!public\.)(profiles|conversations|messages|blocks|plans)\b/g) ?? [];
    expect(bare).toEqual([]);
  });
});

describe('nobody is seated across a block', () => {
  const sql = read(WITHDRAWAL);
  const confirm = sql.split('CREATE OR REPLACE FUNCTION public.confirm_conversation')[1]?.split('$$;')[0] ?? '';
  const trigger =
    sql.split('CREATE OR REPLACE FUNCTION public.handle_conversation_status_change')[1]?.split('$$;')[0] ?? '';

  const symmetric = /blocker_id = ([\w.]+) AND blocked_id = ([\w.]+)\)\s*\n?\s*OR \(blocker_id = \2 AND blocked_id = \1/;

  it('re-checks the block inside confirm_conversation, in both directions', () => {
    expect(confirm).toMatch(/FROM public\.blocks/);
    expect(confirm).toMatch(symmetric);
  });

  it('checks it before anything can take a spot', () => {
    const blockAt = confirm.indexOf('public.blocks');
    const planLockAt = confirm.indexOf('FROM public.plans');
    const updateAt = confirm.indexOf('UPDATE public.conversations');
    expect(blockAt).toBeGreaterThan(-1);
    expect(blockAt).toBeLessThan(planLockAt);
    expect(blockAt).toBeLessThan(updateAt);
  });

  it('answers with a fixed bounded refusal rather than SQL detail', () => {
    const refusal = confirm.match(/'code', 'blocked', 'error',\s*\n?\s*'([^']+)'/);
    expect(refusal).not.toBeNull();
    // No format(), no %, no interpolated identifier in the copy the client sees.
    expect(refusal?.[1]).not.toMatch(/%|SQLERRM|conv\.|plan_row\./);
    expect(confirm).not.toMatch(/'code', 'blocked'[\s\S]{0,120}format\(/);
  });

  it('still lets the host decline, block or no block', () => {
    // The check lives inside the confirm branch only. A decline is how a host
    // closes a request they do not want, and blocking must not take that away.
    const branch = confirm.split("IF new_status = 'confirmed' THEN")[1]?.split('END IF;')[0] ?? '';
    expect(branch).toMatch(/public\.blocks/);
    const beforeBranch = confirm.split("IF new_status = 'confirmed' THEN")[0] ?? '';
    expect(beforeBranch).not.toMatch(/public\.blocks/);
  });

  it('is enforced again at the transition itself, so no path can skip it', () => {
    expect(trigger).toMatch(/FROM public\.blocks/);
    expect(trigger).toMatch(symmetric);
    // Before the plan lock, so a blocked confirmation never touches capacity.
    expect(trigger.indexOf('public.blocks')).toBeLessThan(trigger.indexOf('FROM public.plans'));
    expect(trigger).toMatch(/RAISE EXCEPTION[^;]*USING ERRCODE = '42501'/);
  });

  it('leaves the refund path alone, so a block can still close a confirmed seat', () => {
    const refund = trigger.split("OLD.status = 'confirmed'")[1] ?? '';
    expect(refund).not.toMatch(/public\.blocks/);
  });
});
