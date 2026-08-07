/**
 * The generated types have to admit that a profile can have no phone number.
 *
 * next.config.js keeps ignoreBuildErrors on, so a stale type here does not fail
 * the build. It fails something worse and later: code that reads
 * `profile.phone_e164` as a string, does not guard it, and only finds out on
 * the first Google account. The types are hand-maintained in this repo, so this
 * is the thing that notices when the SQL moved and they did not.
 */
import { describe, it, expect, expectTypeOf } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from './database';

type Profiles = Database['public']['Tables']['profiles'];
type Fns = Database['public']['Functions'];

const SOURCE = readFileSync(join(process.cwd(), 'src', 'types', 'database.ts'), 'utf8');

describe('profiles.phone_e164', () => {
  it('can be absent on a row that is read', () => {
    expectTypeOf<Profiles['Row']['phone_e164']>().toEqualTypeOf<string | null>();
  });

  it('does not have to be supplied on an insert', () => {
    expectTypeOf<Profiles['Insert']>().toMatchTypeOf<{ phone_e164?: string | null }>();
    // Absent entirely is the social case, and it must still be a valid insert.
    expectTypeOf<{ id: string; name: string; city_id: string }>().toMatchTypeOf<Profiles['Insert']>();
  });

  it('can be set back to null on an update', () => {
    expectTypeOf<Profiles['Update']>().toMatchTypeOf<{ phone_e164?: string | null }>();
  });

  it('is a nullable string everywhere it is written down', () => {
    const profiles = SOURCE.slice(SOURCE.indexOf('profiles: {'), SOURCE.indexOf('plans: {'));
    const mentions = profiles.match(/phone_e164\??:[^;]+/g) ?? [];
    expect(mentions.length).toBe(3);
    for (const mention of mentions) {
      expect(mention, mention).toMatch(/null/);
    }
  });
});

describe('the creation function', () => {
  it('is declared, so a typo in its name is a type error rather than a 503', () => {
    expectTypeOf<Fns>().toHaveProperty('create_profile_for_verified_identity');
  });

  it('takes slugs and a provider, and no actor id the browser could choose', () => {
    type Args = Fns['create_profile_for_verified_identity']['Args'];
    expectTypeOf<Args>().toHaveProperty('p_actor');
    expectTypeOf<Args>().toHaveProperty('p_provider');
    expectTypeOf<Args>().toHaveProperty('p_city_slug');
    expectTypeOf<Args>().toHaveProperty('p_neighborhood_slug');
    expectTypeOf<Args['p_provider']>().toEqualTypeOf<'phone' | 'google' | 'apple'>();
  });

  it('returns the public identity and says whether it created anything', () => {
    type Returns = Fns['create_profile_for_verified_identity']['Returns'];
    expectTypeOf<Returns>().toHaveProperty('created');
    expectTypeOf<Returns>().toHaveProperty('display_name');
  });

  it('is no longer the empty record it was when nothing had one', () => {
    expect(SOURCE).not.toMatch(/Functions: Record<string, never>/);
  });
});
