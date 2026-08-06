/**
 * The signed-in profile editor.
 *
 * profiles.name is the private full name and the postdeploy hardening migration
 * revokes it from anon and authenticated, so the browser can no longer read its
 * own full name straight from PostgREST. /profile used to do exactly that, and
 * with the column denied the row came back empty and the page bounced the user
 * to /auth: signed in, but told to sign in.
 *
 * This route is the replacement authority. It takes no profile id from anybody:
 * the only id it will ever use is the one on the verified session. Everything it
 * refuses, it refuses with fixed copy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Result = { data?: any; error?: any };

const calls: { table: string; op: string; args: any[] }[] = [];
let results: Record<string, Result[]> = {};
let currentUser: { id: string } | null = { id: 'user-me' };

function builder(table: string) {
  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown) => resolve(results[table]?.shift() ?? { data: null });
        }
        return (...args: any[]) => {
          calls.push({ table, op: prop, args });
          return proxy;
        };
      }
    }
  );
  return proxy;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: (table: string) => builder(table)
  })
}));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: (table: string) => builder(table) }
}));

const ME = {
  id: 'user-me',
  name: 'Ada Lovelace',
  display_name: 'Ada',
  about: 'runs slow',
  city_id: 'city-1',
  neighborhood_id: 'hood-1',
  initials: 'AL',
  avatar_bg: '#eee',
  avatar_fg: '#333',
  is_founding_member: true,
  city: { slug: 'nyc', name: 'New York City' },
  neighborhood: { slug: 'williamsburg', name: 'Williamsburg' }
};

function get(url = 'http://localhost/api/profile') {
  return new Request(url) as any;
}
function patch(body: unknown) {
  return new Request('http://localhost/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as any;
}

const eqCalls = (table: string) => calls.filter(c => c.table === table && c.op === 'eq').map(c => c.args);
const selects = (table: string) => calls.filter(c => c.table === table && c.op === 'select').map(c => String(c.args[0]));

beforeEach(() => {
  calls.length = 0;
  results = {};
  currentUser = { id: 'user-me' };
});

describe('GET /api/profile', () => {
  it('refuses an anonymous caller and reads nothing', async () => {
    currentUser = null;
    const { GET } = await import('./route');
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(calls.filter(c => c.table === 'profiles')).toEqual([]);
  });

  it('returns the caller their own private profile', async () => {
    results = { profiles: [{ data: ME }] };
    const { GET } = await import('./route');
    const res = await GET(get());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toMatchObject({
      id: 'user-me',
      name: 'Ada Lovelace',
      displayName: 'Ada',
      about: 'runs slow',
      initials: 'AL'
    });
    expect(body.profile.city.slug).toBe('nyc');
    expect(body.profile.neighborhood.slug).toBe('williamsburg');
  });

  it('scopes the read to the session id and never to anything the caller sent', async () => {
    results = { profiles: [{ data: ME }] };
    const { GET } = await import('./route');
    await GET(get('http://localhost/api/profile?id=user-someone-else&user_id=user-other'));

    // Exactly one filter, and it is the session's own id.
    expect(eqCalls('profiles')).toEqual([['id', 'user-me']]);
    expect(JSON.stringify(calls)).not.toMatch(/user-someone-else|user-other/);
  });

  it('never hands back the columns that are private even to the owner', async () => {
    results = { profiles: [{ data: ME }] };
    const { GET } = await import('./route');
    const res = await GET(get());
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/phone_e164|notify_email|blocked_at/);
    for (const select of selects('profiles')) {
      expect(select).not.toMatch(/phone_e164|notify_email/);
    }
  });

  it('fails closed with fixed copy when the read errors', async () => {
    results = { profiles: [{ error: { code: '42501', message: 'permission denied for column name' } }] };
    const { GET } = await import('./route');
    const res = await GET(get());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.profile).toBeUndefined();
    expect(body.error).toMatch(/could not load your profile/i);
    expect(JSON.stringify(body)).not.toMatch(/permission denied|42501/);
  });

  it('says not found rather than pretending, when there is no row yet', async () => {
    results = { profiles: [{ data: null }] };
    const { GET } = await import('./route');
    const res = await GET(get());
    expect(res.status).toBe(404);
  });

  it('is never cached anywhere', async () => {
    results = { profiles: [{ data: ME }] };
    const { GET } = await import('./route');
    const res = await GET(get());
    expect(res.headers.get('Cache-Control')).toMatch(/private/);
    expect(res.headers.get('Cache-Control')).toMatch(/no-store/);
  });
});

describe('PATCH /api/profile', () => {
  const ok = (over: Record<string, unknown> = {}) => ({
    data: { name: 'Ada Lovelace', display_name: 'Ada', initials: 'AL', ...over }
  });

  function saveable(over: Record<string, unknown> = {}) {
    return { name: 'Ada Lovelace', city: 'nyc', neighborhood: 'williamsburg', about: 'runs slow', ...over };
  }

  function lookups() {
    return {
      cities: [{ data: { id: 'city-1' } }],
      neighborhoods: [{ data: { id: 'hood-1' } }]
    };
  }

  it('refuses an anonymous caller and writes nothing', async () => {
    currentUser = null;
    const { PATCH } = await import('./route');
    const res = await PATCH(patch(saveable()));
    expect(res.status).toBe(401);
    expect(calls.some(c => c.op === 'update')).toBe(false);
  });

  it('writes only to the session id, whatever id the body carries', async () => {
    results = { ...lookups(), profiles: [ok()] };
    const { PATCH } = await import('./route');
    const res = await PATCH(patch(saveable({ id: 'user-someone-else', user_id: 'user-other' })));

    expect(res.status).toBe(200);
    expect(eqCalls('profiles')).toEqual([['id', 'user-me']]);
    const update = calls.find(c => c.table === 'profiles' && c.op === 'update');
    expect(update?.args[0]).not.toHaveProperty('id');
    expect(JSON.stringify(calls)).not.toMatch(/user-someone-else|user-other/);
  });

  it('refuses to write columns the editor has no business touching', async () => {
    results = { ...lookups(), profiles: [ok()] };
    const { PATCH } = await import('./route');
    await PATCH(
      patch(
        saveable({
          is_founding_member: true,
          blocked_at: null,
          notify_email: 'attacker@example.test',
          phone_e164: '+15550001111',
          display_name: 'Ada Lovelace'
        })
      )
    );

    const written = calls.find(c => c.table === 'profiles' && c.op === 'update')?.args[0] ?? {};
    expect(Object.keys(written).sort()).toEqual(
      ['about', 'city_id', 'initials', 'name', 'neighborhood_id'].sort()
    );
  });

  it('normalizes the name it stores, so the projection is a first name', async () => {
    results = { ...lookups(), profiles: [ok()] };
    const { PATCH } = await import('./route');
    const nbsp = String.fromCharCode(0xa0);
    await PATCH(patch(saveable({ name: `  Ada${nbsp}${nbsp}Lovelace  ` })));

    const written = calls.find(c => c.table === 'profiles' && c.op === 'update')?.args[0] ?? {};
    expect(written.name).toBe('Ada Lovelace');
    expect(written.initials).toBe('AL');
  });

  it('keeps initials working for a single-word name', async () => {
    results = { ...lookups(), profiles: [ok({ name: 'Prince', display_name: 'Prince', initials: 'P' })] };
    const { PATCH } = await import('./route');
    const res = await PATCH(patch(saveable({ name: '  Prince ' })));

    const written = calls.find(c => c.table === 'profiles' && c.op === 'update')?.args[0] ?? {};
    expect(written.name).toBe('Prince');
    expect(written.initials).toBe('P');
    expect((await res.json()).profile.displayName).toBe('Prince');
  });

  it('reports the display_name the database actually generated, not one it made up', async () => {
    results = { ...lookups(), profiles: [ok()] };
    const { PATCH } = await import('./route');
    const res = await PATCH(patch(saveable()));

    // The update asks for the generated column back in the same statement, so
    // the answer is the stored public identity rather than a local guess.
    const select = calls.find(c => c.table === 'profiles' && c.op === 'select');
    expect(String(select?.args[0])).toMatch(/display_name/);
    expect((await res.json()).profile).toMatchObject({ name: 'Ada Lovelace', displayName: 'Ada' });
  });

  it('refuses an empty or whitespace-only name with fixed copy', async () => {
    const { PATCH } = await import('./route');
    for (const name of ['', '   ', String.fromCharCode(0x3000), null, 42]) {
      calls.length = 0;
      const res = await PATCH(patch(saveable({ name })));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/name/i);
      expect(calls.some(c => c.op === 'update')).toBe(false);
    }
  });

  it('refuses a name longer than the column allows', async () => {
    const { PATCH } = await import('./route');
    const res = await PATCH(patch(saveable({ name: 'A'.repeat(51) })));
    expect(res.status).toBe(400);
    expect(calls.some(c => c.op === 'update')).toBe(false);
  });

  it('refuses a neighborhood that is not in the chosen city', async () => {
    results = { cities: [{ data: { id: 'city-1' } }], neighborhoods: [{ data: null }] };
    const { PATCH } = await import('./route');
    const res = await PATCH(patch(saveable({ neighborhood: 'not-a-hood' })));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/neighborhood/i);
    expect(calls.some(c => c.op === 'update')).toBe(false);
  });

  it('fails closed with fixed copy when the write errors', async () => {
    results = { ...lookups(), profiles: [{ error: { code: '23514', message: 'profiles_name_check violated' } }] };
    const { PATCH } = await import('./route');
    const res = await PATCH(patch(saveable()));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/could not save/i);
    expect(JSON.stringify(body)).not.toMatch(/profiles_name_check|23514/);
  });

  it('fails closed on a body that is not JSON at all', async () => {
    const { PATCH } = await import('./route');
    const bad = new Request('http://localhost/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json'
    }) as any;
    const res = await PATCH(bad);
    expect(res.status).toBe(400);
    expect(calls.some(c => c.op === 'update')).toBe(false);
  });
});

describe('the source itself', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/api/profile/route.ts'), 'utf8');

  it('takes no profile id from the request, anywhere', () => {
    expect(source).not.toMatch(/searchParams\.get\(/);
    expect(source).not.toMatch(/params\s*[:.]/);

    // Every filter on a profile id, whatever it is filtered with. The only
    // acceptable answer is the id on the verified session.
    const filters = [...source.matchAll(/\.eq\(\s*'id',\s*([^)]+)\)/g)].map(m => m[1].trim());
    expect(filters.length).toBeGreaterThan(0);
    expect(filters.every(f => f === 'user.id')).toBe(true);
  });

  it('reads the private column with the service role, never the browser session', () => {
    expect(source).toMatch(/supabaseAdmin[\s\S]{0,80}from\('profiles'\)/);
  });
});
