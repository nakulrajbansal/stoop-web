/**
 * Sending a message is one transaction, or it is nothing.
 *
 * The route used to read the conversation, read the blocks, count the day and
 * then insert. A decline, a withdrawal or a block landing in any of those gaps
 * still produced a message and an email, and two parallel requests could both
 * pass the daily count before either wrote. Static mocks cannot show a race, so
 * what these tests hold is the shape that makes the race impossible: the route
 * decides nothing and writes nothing, it calls one function and reports what it
 * says. The race itself is proved in the SQL probes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Result = { data?: any; count?: number; error?: any };

const calls: { table: string; op: string; args: any[] }[] = [];
const rpcCalls: { fn: string; args: any }[] = [];
const emails: { kind: string; args: any[] }[] = [];
let results: Record<string, Result[]> = {};
let rpcResult: Result = { data: null };
let currentUser: { id: string } | null = { id: 'user-joiner' };

function builder(table: string) {
  const proxy: any = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'then') {
          return (resolve: (value: Result) => unknown) =>
            resolve(results[table]?.shift() ?? { data: null });
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
  supabaseAdmin: {
    from: (table: string) => builder(table),
    rpc: async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      return rpcResult;
    }
  }
}));
vi.mock('@/lib/moderation', () => ({ isSuspended: async () => false }));
vi.mock('@/lib/resend', () => ({
  sendReplyAlert: async (...args: any[]) => { emails.push({ kind: 'reply', args }); }
}));

const RPC = 'send_conversation_message';

function sent(over: Record<string, unknown> = {}) {
  return {
    data: {
      ok: true,
      message_id: 'msg-1',
      created_at: '2026-08-06T12:00:00.000Z',
      conversation_id: 'conv-1',
      recipient_id: 'user-host',
      status: 'pending',
      sent_today: 3,
      ...over
    }
  };
}

const refusal = (code: string) => ({ data: { ok: false, code, error: `refused: ${code}` } });

function post(body: unknown) {
  return new Request('http://localhost/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as any;
}

const wroteMessage = () => calls.some(c => c.table === 'messages' && c.op === 'insert');

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  emails.length = 0;
  results = {};
  rpcResult = { data: null };
  currentUser = { id: 'user-joiner' };
});

describe('the route holds no authority of its own', () => {
  it('sends everything to one function and inserts nothing itself', async () => {
    rpcResult = sent();
    results = {
      messages: [{ count: 1 }],
      profiles: [{ data: { notify_email: 'host@example.test' } }, { data: { name: 'Theo' } }],
      conversations: [{ data: { plan: { text: 'coffee saturday' } } }]
    };

    const { POST } = await import('./route');
    const res = await POST(post({ conversationId: 'conv-1', text: 'see you there' }));

    expect(res.status).toBe(200);
    expect(rpcCalls).toEqual([
      {
        fn: RPC,
        args: {
          p_conversation_id: 'conv-1',
          p_sender_id: 'user-joiner',
          p_message: 'see you there',
          p_daily_limit: 50
        }
      }
    ]);
    expect(wroteMessage()).toBe(false);
  });

  it('runs no rate count of its own, before or after', async () => {
    rpcResult = sent();
    results = { messages: [{ count: 1 }] };
    const { POST } = await import('./route');
    await POST(post({ conversationId: 'conv-1', text: 'see you there' }));

    // The only message read left is the 15 minute "are they still here" check
    // for the email, which is scoped to the recipient in this conversation.
    const senderCounts = calls.filter(
      c => c.table === 'messages' && c.op === 'eq' && c.args[0] === 'from_user_id' && c.args[1] === 'user-joiner'
    );
    expect(senderCounts).toEqual([]);
  });

  it('reads nothing about the conversation before the write', async () => {
    rpcResult = refusal('closed');
    const { POST } = await import('./route');
    await POST(post({ conversationId: 'conv-1', text: 'are you sure?' }));
    // The refusal came from the transaction, not from a read the route did.
    expect(calls).toEqual([]);
    expect(rpcCalls).toHaveLength(1);
  });
});

describe('what the transaction refuses', () => {
  const cases: [string, number, RegExp][] = [
    ['closed', 409, /conversation is closed/i],
    ['blocked', 403, /no longer available/i],
    ['forbidden', 403, /not allowed/i],
    ['not_found', 404, /not found/i],
    ['rate_limited', 429, /limit reached/i],
    ['bad_message', 400, /out of range/i]
  ];

  for (const [code, status, copy] of cases) {
    it(`answers ${code} with ${status}, fixed copy, no email`, async () => {
      rpcResult = refusal(code);
      const { POST } = await import('./route');
      const res = await POST(post({ conversationId: 'conv-1', text: 'hello' }));

      expect(res.status).toBe(status);
      const body = await res.json();
      expect(body.error).toMatch(copy);
      // The database's own wording never reaches the client.
      expect(body.error).not.toMatch(/refused:/);
      expect(wroteMessage()).toBe(false);
      expect(emails).toHaveLength(0);
    });
  }

  it('fails closed and emails nobody when the transaction errors', async () => {
    rpcResult = { error: { code: 'P0001', message: 'deadlock detected on messages' } };
    const { POST } = await import('./route');
    const res = await POST(post({ conversationId: 'conv-1', text: 'hello' }));

    expect(res.status).toBe(503);
    expect(emails).toHaveLength(0);
    expect(wroteMessage()).toBe(false);
    expect(JSON.stringify(await res.json())).not.toMatch(/deadlock/);
  });

  it('fails closed when the function is not migrated yet', async () => {
    rpcResult = { error: { code: 'PGRST202', message: 'Could not find the function' } };
    const { POST } = await import('./route');
    const res = await POST(post({ conversationId: 'conv-1', text: 'hello' }));
    expect(res.status).toBe(503);
    expect(emails).toHaveLength(0);
  });
});

describe('the email happens after the commit, and only then', () => {
  it('notifies the person the transaction named', async () => {
    rpcResult = sent({ recipient_id: 'user-host' });
    results = {
      messages: [{ count: 0 }],
      profiles: [{ data: { notify_email: 'host@example.test' } }, { data: { name: 'Theo' } }],
      conversations: [{ data: { plan: { text: 'coffee saturday' } } }]
    };
    const { POST } = await import('./route');
    await POST(post({ conversationId: 'conv-1', text: 'see you there' }));
    expect(emails.map(e => e.kind)).toEqual(['reply']);
  });

  it('stays quiet when the other person is still in the thread', async () => {
    rpcResult = sent();
    results = { messages: [{ count: 2 }] };
    const { POST } = await import('./route');
    await POST(post({ conversationId: 'conv-1', text: 'see you there' }));
    expect(emails).toHaveLength(0);
  });

  it('reads a first name for the email, never the full one', async () => {
    rpcResult = sent();
    results = {
      messages: [{ count: 0 }],
      profiles: [{ data: { notify_email: 'host@example.test' } }, { data: { name: 'Theo' } }],
      conversations: [{ data: { plan: { text: 'coffee saturday' } } }]
    };
    const { POST } = await import('./route');
    await POST(post({ conversationId: 'conv-1', text: 'see you there' }));

    const profileSelects = calls.filter(c => c.table === 'profiles' && c.op === 'select');
    expect(profileSelects.some(c => String(c.args[0]).includes('name:display_name'))).toBe(true);
    expect(profileSelects.some(c => /(^|[^:])\bname\b(?!:)/.test(String(c.args[0])))).toBe(false);
  });
});

describe('the route still refuses what it can refuse cheaply', () => {
  it('turns away an anonymous caller before the transaction', async () => {
    currentUser = null;
    const { POST } = await import('./route');
    const res = await POST(post({ conversationId: 'conv-1', text: 'hello' }));
    expect(res.status).toBe(401);
    expect(rpcCalls).toHaveLength(0);
  });

  it('rejects an empty or oversized body without calling anything', async () => {
    const { POST } = await import('./route');
    expect((await POST(post({ conversationId: 'conv-1', text: '' }))).status).toBe(400);
    expect((await POST(post({ conversationId: 'conv-1', text: 'x'.repeat(2001) }))).status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe('the source itself', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/api/messages/route.ts'), 'utf8');

  it('has no direct message insert left in it', () => {
    expect(source).not.toMatch(/from\('messages'\)[\s\S]{0,80}\.insert\(/);
  });

  it(`does not count the sender day for itself`, () => {
    expect(source).not.toMatch(/eq\('from_user_id', user\.id\)/);
  });
});
