/**
 * The two migrations that let an account exist without a phone number.
 *
 * Like the rest of db-migrations.test.ts these read the SQL as text, so they
 * prove the shape of what would run and nothing about what Postgres accepted.
 * The executable proof is supabase/rehearsal.
 *
 * The split is the whole point. The expand file is additive and safe to run
 * while the CURRENT production code is serving: it drops a NOT NULL and adds a
 * function nothing calls yet. The contract file takes the browser's ability to
 * insert a profile away, which breaks the current production code on purpose,
 * so it runs only after the new application is live. Anything that belongs in
 * the second file and drifts into the first is an outage on a signup screen.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations');
const HARDENING = '20260806090000_postdeploy_boundary_hardening.sql';
const EXPAND = '20260807120000_three_path_signup_expand.sql';
const CONTRACT = '20260807123000_postdeploy_profile_insert_contract.sql';

const read = (file: string) => readFileSync(join(DIR, file), 'utf8');

describe('the order the two files must run in', () => {
  it('puts both after every migration already in the repo', () => {
    const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
    expect(files).toContain(EXPAND);
    expect(files).toContain(CONTRACT);
    for (const file of files.filter(f => f !== EXPAND && f !== CONTRACT)) {
      expect(EXPAND > file, `${EXPAND} must sort after ${file}`).toBe(true);
    }
    expect(CONTRACT > EXPAND).toBe(true);
    expect(EXPAND > HARDENING).toBe(true);
  });

  it('says in the expand file that it is safe to run before the deploy', () => {
    const sql = read(EXPAND);
    expect(sql).toMatch(/safe to run (more than once|while|before)/i);
    expect(sql).toMatch(/before/i);
    // It must not quietly do the contract file's job.
    expect(sql).not.toMatch(/REVOKE INSERT ON public\.profiles/i);
    expect(sql).not.toMatch(/DROP POLICY[^\n]*profiles/i);
  });

  it('says in the contract file, in as many words, that it runs only after the deploy', () => {
    const sql = read(CONTRACT);
    expect(sql).toMatch(/ONLY AFTER/i);
    expect(sql).toMatch(/deployed|serving/i);
  });

  it('writes both without an em dash, like the rest of the repo', () => {
    expect(read(EXPAND)).not.toMatch(/\u2014/);
    expect(read(CONTRACT)).not.toMatch(/\u2014/);
  });
});

describe('expand: a phone number stops being mandatory', () => {
  const sql = read(EXPAND);

  it('drops the NOT NULL', () => {
    expect(sql).toMatch(/ALTER (TABLE )?(public\.)?profiles[\s\S]{0,80}ALTER COLUMN phone_e164 DROP NOT NULL/i);
  });

  it('keeps a phone number unique when there is one', () => {
    // Postgres treats NULLs as distinct, so the original UNIQUE index already
    // does the right thing for social accounts. What must not happen is a file
    // that drops the constraint to "make room" for the nulls.
    expect(sql).not.toMatch(/DROP CONSTRAINT[^\n]*phone_e164/i);
    expect(sql).not.toMatch(/DROP INDEX[^\n]*phone_e164/i);
    // And it is asserted rather than assumed, so a project that drifted gets one.
    expect(sql).toMatch(/UNIQUE/i);
    expect(sql).toMatch(/phone_e164/);
  });

  it('leaves every other column alone', () => {
    const nullDrops = sql.match(/ALTER COLUMN \w+ DROP NOT NULL/gi) ?? [];
    expect(nullDrops).toEqual(['ALTER COLUMN phone_e164 DROP NOT NULL']);
  });
});

describe('expand: the function that creates a profile', () => {
  const sql = read(EXPAND);
  const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.create_profile_for_verified_identity'));

  it('exists, and runs as its owner', () => {
    expect(fn).toBeTruthy();
    expect(fn).toMatch(/SECURITY DEFINER/);
  });

  it('pins its search_path and schema-qualifies everything it touches', () => {
    expect(fn).toMatch(/SET search_path = ''|SET search_path = pg_catalog, pg_temp|SET search_path = public, pg_temp/);
    for (const object of ['public.profiles', 'auth.users', 'auth.identities', 'public.cities', 'public.neighborhoods']) {
      expect(fn, `${object} must be schema-qualified`).toMatch(new RegExp(object.replace('.', '\\.')));
    }
    // No bare table name in a FROM or an INSERT.
    expect(fn).not.toMatch(/\bFROM\s+(profiles|cities|neighborhoods|users|identities)\b/);
    expect(fn).not.toMatch(/\bINSERT INTO\s+profiles\b/);
  });

  it('is reachable by the service role and nobody else', () => {
    const grants = sql.slice(sql.indexOf('create_profile_for_verified_identity'));
    expect(grants).toMatch(/REVOKE ALL ON FUNCTION public\.create_profile_for_verified_identity[^;]*FROM PUBLIC/i);
    expect(grants).toMatch(/REVOKE[^;]*FROM[^;]*\banon\b/i);
    expect(grants).toMatch(/REVOKE[^;]*FROM[^;]*\bauthenticated\b/i);
    expect(grants).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_profile_for_verified_identity[^;]*TO service_role/i);
    expect(grants).not.toMatch(/GRANT EXECUTE[^;]*TO[^;]*\b(anon|authenticated|PUBLIC)\b/i);
  });

  it('asks auth what happened, and never believes metadata', () => {
    expect(fn).toMatch(/FROM auth\.users/);
    expect(fn).toMatch(/FROM auth\.identities/);
    // user_metadata is writable by the user in Supabase. Reading a provider, an
    // email or a name out of it would hand the whole check back to the client.
    expect(fn).not.toMatch(/raw_user_meta_data|user_metadata|raw_app_meta_data|app_metadata/);
  });

  it('accepts exactly three identity paths and refuses every other', () => {
    expect(fn).toMatch(/'phone'/);
    expect(fn).toMatch(/'google'/);
    expect(fn).toMatch(/'apple'/);
    // An email/password or an unknown provider falls through to a refusal.
    expect(fn).toMatch(/RAISE EXCEPTION[\s\S]{0,200}ERRCODE = '42501'/);
  });

  it('requires a confirmed phone, and takes the verified time from auth rather than the clock', () => {
    expect(fn).toMatch(/phone_confirmed_at/);
    // phone_verified_at is set from the auth column, not now(), and not from a
    // parameter. A client that could name its own verification time could claim
    // a number it never held.
    const assignment = fn.match(/phone_verified_at[^,)\n]*/g) ?? [];
    expect(assignment.length).toBeGreaterThan(0);
    expect(fn).not.toMatch(/phone_verified_at\s*(:?=)\s*now\(\)/i);
    expect(fn).not.toMatch(/p_phone_verified_at|p_verified_at/);
  });

  it('refuses a phone that is not the one auth confirmed', () => {
    expect(fn).toMatch(/IS DISTINCT FROM|<>|!=/);
    expect(fn).toMatch(/p_phone/);
  });

  it('stores no phone at all for a social identity', () => {
    expect(fn).toMatch(/phone_e164/);
    expect(fn).toMatch(/NULL/);
  });

  it('takes the notification address for a social identity from auth, not from the caller', () => {
    expect(fn).toMatch(/notify_email/);
    // The parameter exists for phone signups, which have no other source, and
    // for a social call it is either absent or has to match what auth holds.
    expect(fn).toMatch(/p_notify_email/);
  });

  it('checks the neighborhood really is in the chosen city', () => {
    expect(fn).toMatch(/city_id\s*=/);
    expect(fn).toMatch(/public\.neighborhoods/);
    expect(fn).toMatch(/p_city_slug|p_city/);
    expect(fn).toMatch(/p_neighborhood_slug|p_neighborhood/);
    // Slugs, not ids: an id straight from a browser is an id nobody checked.
    expect(fn).not.toMatch(/p_city_id|p_neighborhood_id/);
  });

  it('bounds the name and the one line about you', () => {
    expect(fn).toMatch(/length\(/);
    expect(fn).toMatch(/50/);
    expect(fn).toMatch(/140/);
    // The same separator class the generated display_name column uses, so a
    // pasted name is stored the way the projection expects.
    expect(fn).toMatch(/u00a0/);
  });

  it('validates the email it is given rather than storing whatever arrived', () => {
    expect(fn).toMatch(/@/);
    expect(fn).toMatch(/lower\(/i);
  });

  it('never writes the generated public name', () => {
    const insert = fn.slice(fn.indexOf('INSERT INTO public.profiles'), fn.indexOf('ON CONFLICT'));
    expect(insert).not.toMatch(/display_name/);
  });

  it('is create-only, so a second submit changes nothing', () => {
    // Idempotent by returning what is already there. An UPDATE here would turn
    // signup into an unguarded way to rewrite an established profile.
    expect(fn).toMatch(/ON CONFLICT[\s\S]{0,40}DO NOTHING|IF FOUND THEN|already/i);
    expect(fn).not.toMatch(/UPDATE public\.profiles/);
    expect(fn).not.toMatch(/ON CONFLICT[\s\S]{0,40}DO UPDATE/i);
  });

  it('tells the caller whether it really created something', () => {
    // So the server can send exactly one welcome email.
    expect(fn).toMatch(/created/);
  });

  it('hands back what the server needs to send one welcome email, and never the phone number', () => {
    // The stored notification address goes back to the route so the mailer uses
    // what Postgres actually kept rather than what the browser typed. It stops
    // at the server: the HTTP response is asserted clean in
    // src/app/api/profile/create.test.ts. The phone number has no such excuse
    // and never leaves the row.
    const returns = [...fn.matchAll(/RETURN jsonb_build_object\(([\s\S]*?)\);/g)].map(m => m[1]);
    expect(returns.length).toBeGreaterThan(0);
    for (const returned of returns) {
      expect(returned).toMatch(/notify_email/);
      expect(returned).not.toMatch(/phone_e164|phone_verified_at/);
    }
  });
});

describe('contract: the browser stops being able to insert a profile', () => {
  const sql = read(CONTRACT);
  // What would actually run. These files carry more explanation than SQL, and a
  // sentence about what is deliberately NOT revoked reads, to a regex, exactly
  // like a revoke.
  const code = sql
    .split('\n')
    .filter(line => !/^\s*--/.test(line))
    .join('\n');

  it('drops the legacy insert policy and revokes the privilege underneath it', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS[^\n]*ON public\.profiles/i);
    // The policy alone is not enough: a table-level grant from an older project
    // survives a policy drop, and RLS is not the only thing standing there.
    expect(sql).toMatch(/REVOKE INSERT ON public\.profiles FROM[^;]*anon/i);
    expect(sql).toMatch(/REVOKE INSERT ON public\.profiles FROM[^;]*authenticated/i);
  });

  it('leaves the service role and the function path alone', () => {
    expect(code).not.toMatch(/REVOKE[^;]*service_role/i);
    expect(code).not.toMatch(/DROP FUNCTION[^;]*create_profile_for_verified_identity/i);
  });

  it('does not take away the reads the signed-in app still needs', () => {
    expect(code).not.toMatch(/REVOKE SELECT/i);
    expect(code).not.toMatch(/REVOKE UPDATE ON public\.profiles/i);
  });

  it('is safe to run twice', () => {
    expect(sql).toMatch(/IF EXISTS/i);
    expect(sql).toMatch(/safe to run more than once|idempotent|re-run/i);
  });
});
