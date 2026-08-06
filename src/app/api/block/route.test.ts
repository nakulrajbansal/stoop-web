/**
 * Blocking is one transaction.
 *
 * It used to be an upsert followed by a bulk status update. If the second
 * statement failed the block existed while the person stayed confirmed on the
 * plan, and closing a confirmed request as declined never gave the seat back:
 * the participant disappeared from the roster and the plan stayed full.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const calls: { table: string; op: string; args: any[] }[] = [];
const rpcCalls: { fn: string; args: any }[] = [];
let rpcResult: { data?: any; error?: any } = { data: null };
let currentUser: { id: string } | null = { id: 'user-host' };

function builder(table: string) {
  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: (v: unknown) => unknown) => resolve({ data: null });
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
  supabaseAdmin: {
    from: (table: string) => builder(table),
    rpc: async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      return rpcResult;
    }
  }
}));

function post(body: unknown) {
  return new Request('http://localhost/api/block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as any;
}

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  rpcResult = { data: { ok: true, block_added: true, closed: 1, seats_returned: 1 } };
  currentUser = { id: 'user-host' };
});

describe('POST /api/block', () => {
  it('does the whole thing in one call and writes nothing itself', async () => {
    const { POST } = await import('./route');
    const res = await POST(post({ blockedId: 'user-joiner' }));

    expect(res.status).toBe(200);
    expect(rpcCalls).toEqual([
      { fn: 'block_and_close', args: { p_blocker_id: 'user-host', p_blocked_id: 'user-joiner' } }
    ]);
    // No split mutation: no upsert of the block, no bulk status update.
    expect(calls.some(c => c.op === 'upsert' || c.op === 'update' || c.op === 'insert')).toBe(false);
  });

  it('reports the seat a confirmed participant gave back', async () => {
    const { POST } = await import('./route');
    const body = await (await POST(post({ blockedId: 'user-joiner' }))).json();
    expect(body).toMatchObject({ ok: true, closed: 1, seatsReturned: 1 });
  });

  it('fails closed with fixed copy when the transaction errors', async () => {
    rpcResult = { error: { code: 'P0001', message: 'deadlock on conversations' } };
    const { POST } = await import('./route');
    const res = await POST(post({ blockedId: 'user-joiner' }));

    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/deadlock/);
    expect(calls.some(c => c.op === 'upsert' || c.op === 'update')).toBe(false);
  });

  it('still refuses an anonymous caller and a self block before calling anything', async () => {
    currentUser = null;
    const { POST } = await import('./route');
    expect((await POST(post({ blockedId: 'user-joiner' }))).status).toBe(401);

    currentUser = { id: 'user-host' };
    expect((await POST(post({ blockedId: 'user-host' }))).status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe('the source itself', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/api/block/route.ts'), 'utf8');

  it('has no split block-then-close mutation left', () => {
    expect(source).not.toMatch(/from\('blocks'\)[\s\S]{0,80}\.upsert\(/);
    expect(source).not.toMatch(/from\('conversations'\)[\s\S]{0,80}\.update\(/);
  });
});
