/**
 * Route-level checks for the private roster.
 *
 * The authorization matrix itself is covered exhaustively as pure functions in
 * src/lib/participants.test.ts. What is checked here is the wiring: that the
 * route denies before it reads, that it fails closed when the block lookup
 * cannot answer, and that a permitted viewer gets first names only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data?: any; count?: number; error?: any };

let results: Record<string, Result[]> = {};
let currentUser: { id: string } | null = null;
let blockLookup: { ok: true; ids: string[] } | { ok: false; error: string } = { ok: true, ids: [] };

function builder(table: string) {
  const proxy: any = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'then') {
          return (resolve: (value: Result) => unknown) =>
            resolve(results[table]?.shift() ?? { data: null });
        }
        return () => proxy;
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
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (table: string) => builder(table) } }));
vi.mock('@/lib/blocks', () => ({
  getBlockedIds: async () => (blockLookup.ok ? blockLookup.ids : []),
  getBlockedIdsResult: async () => blockLookup
}));

const PLAN_ID = '6f1c2a90-0000-4000-8000-000000000001';
const HOST = 'user-host';
const CONFIRMED = 'user-confirmed';

function get(id = PLAN_ID) {
  const req = new Request(`http://localhost/api/plans/${id}/participants`) as any;
  return { req, params: Promise.resolve({ id }) };
}

function openPlan() {
  return { data: { id: PLAN_ID, user_id: HOST, status: 'open' } };
}

beforeEach(() => {
  results = {};
  currentUser = null;
  blockLookup = { ok: true, ids: [] };
});

describe('GET /api/plans/[id]/participants', () => {
  it('turns an anonymous viewer away before reading anything', async () => {
    const { GET } = await import('./route');
    const { req, params } = get();
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
    expect(await res.json()).not.toHaveProperty('roster');
  });

  it('rejects a plan id that is not a uuid', async () => {
    currentUser = { id: HOST };
    const { GET } = await import('./route');
    const { req, params } = get('coffee-at-partners-ab12');
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });

  it('gives a signed-in stranger a 403 and no roster', async () => {
    currentUser = { id: 'user-stranger' };
    results = { plans: [openPlan()], conversations: [{ data: [{ joiner_id: CONFIRMED, status: 'confirmed' }] }] };
    const { GET } = await import('./route');
    const { req, params } = get();
    const res = await GET(req, { params });
    expect(res.status).toBe(403);
    expect(await res.json()).not.toHaveProperty('roster');
  });

  it('fails closed when the block lookup cannot answer', async () => {
    currentUser = { id: HOST };
    results = { plans: [openPlan()], conversations: [{ data: [{ joiner_id: CONFIRMED, status: 'confirmed' }] }] };
    blockLookup = { ok: false, error: 'schema cache miss' };
    const { GET } = await import('./route');
    const { req, params } = get();
    const res = await GET(req, { params });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).not.toHaveProperty('roster');
    expect(body.error).toMatch(/try again/i);
  });

  it('answers the host with confirmed people only, first names only', async () => {
    currentUser = { id: HOST };
    results = {
      plans: [openPlan()],
      conversations: [
        {
          data: [
            { joiner_id: CONFIRMED, status: 'confirmed' },
            { joiner_id: 'user-pending', status: 'pending' },
            { joiner_id: 'user-gone', status: 'withdrawn' }
          ]
        }
      ],
      profiles: [
        {
          data: [
            { id: HOST, name: 'Maya Rodriguez', about: 'lives by the park', neighborhood_id: 'hood-1' },
            { id: CONFIRMED, name: 'Theo Park', about: null, neighborhood_id: 'hood-1' }
          ]
        }
      ],
      neighborhoods: [{ data: [{ id: 'hood-1', name: 'Williamsburg' }] }]
    };
    const { GET } = await import('./route');
    const { req, params } = get();
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.roster.map((entry: any) => entry.firstName)).toEqual(['Maya', 'Theo']);
    expect(body.roster.map((entry: any) => entry.role)).toEqual(['host', 'joiner']);
    expect(JSON.stringify(body)).not.toMatch(/Rodriguez|user-pending|user-gone/);
    expect(res.headers.get('Cache-Control')).toMatch(/no-store/);
  });
});
