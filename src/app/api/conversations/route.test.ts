/**
 * Route-level checks for the request lifecycle.
 *
 * Covers the three things the pure modules cannot: what happens when the
 * lifecycle functions are not in the database yet, what a POST does when it
 * lands on a conversation that is already resolved, and that asking again is
 * an explicit act rather than a side effect of pressing Message.
 *
 * Supabase and Resend are stubbed. Nothing here touches a database, a network,
 * or a real email.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data?: any; count?: number; error?: any };

const calls: { table: string; op: string; args: any[] }[] = [];
const rpcCalls: { fn: string; args: any }[] = [];
const emails: { kind: string; args: any[] }[] = [];

let results: Record<string, Result[]> = {};
let rpcResults: Record<string, Result> = {};
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

const MISSING_FUNCTION = {
  error: { code: 'PGRST202', message: 'Could not find the function public.confirm_conversation in the schema cache' }
};

const admin = {
  from: (table: string) => builder(table),
  rpc: async (fn: string, args: any) => {
    rpcCalls.push({ fn, args });
    return rpcResults[fn] ?? { data: null, error: null };
  }
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: (table: string) => builder(table)
  })
}));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: admin }));
vi.mock('@/lib/moderation', () => ({ isSuspended: async () => false }));
let blockLookup: { ok: true; ids: string[] } | { ok: false; error: string } = { ok: true, ids: [] };
vi.mock('@/lib/blocks', () => ({
  getBlockedIds: async () => (blockLookup.ok ? blockLookup.ids : []),
  getBlockedIdsResult: async () => blockLookup
}));
vi.mock('@/lib/resend', () => ({
  sendMessageAlert: async (...args: any[]) => { emails.push({ kind: 'message', args }); },
  sendConfirmed: async (...args: any[]) => { emails.push({ kind: 'confirmed', args }); },
  sendWithdrawn: async (...args: any[]) => { emails.push({ kind: 'withdrawn', args }); },
  sendRequestedAgain: async (...args: any[]) => { emails.push({ kind: 'again', args }); }
}));

const OPEN_PLAN = { data: { id: 'plan-1', user_id: 'user-host', status: 'open', spots_left: 2 } };

function post(body: unknown) {
  return new Request('http://localhost/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as any;
}

function patch(body: unknown) {
  return new Request('http://localhost/api/conversations', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as any;
}

const OPENER = 'I am around that morning and would love to come along.';

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  emails.length = 0;
  results = {};
  rpcResults = {};
  currentUser = { id: 'user-joiner' };
  blockLookup = { ok: true, ids: [] };
});

const RPC = 'start_or_reopen_conversation';

function rpcOk(over: Record<string, unknown> = {}) {
  return {
    data: {
      ok: true,
      conversation_id: 'conv-1',
      status: 'pending',
      created: false,
      reopened: false,
      notify_host: false,
      ...over
    }
  };
}

function rpcRefusal(code: string, error: string) {
  return { data: { ok: false, code, error, conversation_id: 'conv-1' } };
}

// Everything the email lookups read after the transaction commits.
function emailFixtures() {
  return {
    profiles: [{ data: { notify_email: 'host@example.test' } }, { data: { name: 'Theo' } }],
    plans: [{ data: { text: 'coffee saturday' } }]
  };
}

const wrote = () => calls.some(c => c.op === 'insert' || c.op === 'update' || c.op === 'upsert');

describe('POST goes through one transaction', () => {
  it('sends the request and its opener to a single function call', async () => {
    results = emailFixtures();
    rpcResults = { [RPC]: rpcOk({ created: true, notify_host: true }) };
    const { POST } = await import('./route');
    const res = await POST(post({ planId: 'plan-1', firstMessage: OPENER }));

    expect(res.status).toBe(200);
    expect(rpcCalls).toEqual([
      {
        fn: RPC,
        args: {
          p_plan_id: 'plan-1',
          p_actor_id: 'user-joiner',
          p_message: OPENER,
          p_request_again: false
        }
      }
    ]);
    // The route must not write the conversation or the message itself: that is
    // the split that could half commit.
    expect(wrote()).toBe(false);
  });

  it('passes the explicit re-request flag through', async () => {
    results = emailFixtures();
    rpcResults = { [RPC]: rpcOk({ reopened: true, notify_host: true }) };
    const { POST } = await import('./route');
    await POST(post({ planId: 'plan-1', firstMessage: OPENER, requestAgain: true }));
    expect(rpcCalls[0].args.p_request_again).toBe(true);
  });

  it('reports the status the database actually left the row in', async () => {
    results = emailFixtures();
    rpcResults = { [RPC]: rpcOk({ status: 'confirmed' }) };
    const { POST } = await import('./route');
    const res = await POST(post({ planId: 'plan-1', firstMessage: OPENER }));
    const body = await res.json();
    expect(body.status).toBe('confirmed');
    expect(body.note).toMatch(/spot is reserved/i);
  });
});

describe('POST fails closed', () => {
  it('sends no email and writes nothing when the transaction raises', async () => {
    rpcResults = { [RPC]: { error: { code: 'P0001', message: 'messages insert failed' } } };
    const { POST } = await import('./route');
    const res = await POST(post({ planId: 'plan-1', firstMessage: OPENER }));

    expect(res.status).toBe(500);
    expect(emails).toHaveLength(0);
    expect(wrote()).toBe(false);
    // Whatever the database said stays in the logs.
    expect(JSON.stringify(await res.json())).not.toMatch(/messages insert failed/);
  });

  it('answers 503 and writes nothing when the function is not migrated yet', async () => {
    rpcResults = { [RPC]: MISSING_FUNCTION };
    const { POST } = await import('./route');
    const res = await POST(post({ planId: 'plan-1', firstMessage: OPENER }));
    expect(res.status).toBe(503);
    expect(emails).toHaveLength(0);
    expect(wrote()).toBe(false);
  });

  it('maps each refusal to its own status, and never emails', async () => {
    const cases: [string, number][] = [
      ['not_found', 404],
      ['own_plan', 400],
      ['blocked', 403],
      ['plan_closed', 400],
      ['no_spots', 400],
      ['bad_message', 400],
      ['declined', 409],
      ['withdrawn', 409],
      ['reopen_limit', 409]
    ];
    const { POST } = await import('./route');
    for (const [code, status] of cases) {
      rpcCalls.length = 0;
      emails.length = 0;
      calls.length = 0;
      rpcResults = { [RPC]: rpcRefusal(code, `refused: ${code}`) };
      const res = await POST(post({ planId: 'plan-1', firstMessage: OPENER, requestAgain: true }));
      expect(res.status, code).toBe(status);
      expect(emails, code).toHaveLength(0);
      expect(wrote()).toBe(false);
    }
  });

  it('tells a withdrawn requester they may ask again, and a declined one they may not', async () => {
    const { POST } = await import('./route');

    rpcResults = { [RPC]: rpcRefusal('withdrawn', 'You left this plan.') };
    const withdrawn = await (await POST(post({ planId: 'plan-1', firstMessage: OPENER }))).json();
    expect(withdrawn.canRequestAgain).toBe(true);
    expect(withdrawn.status).toBe('withdrawn');

    rpcResults = { [RPC]: rpcRefusal('declined', 'The host declined this one.') };
    const declined = await (await POST(post({ planId: 'plan-1', firstMessage: OPENER }))).json();
    expect(declined.canRequestAgain).toBe(false);
    expect(declined.status).toBe('declined');
  });
});

describe('POST notifies the host exactly once', () => {
  it('emails a first request as a new message', async () => {
    results = emailFixtures();
    rpcResults = { [RPC]: rpcOk({ created: true, notify_host: true }) };
    const { POST } = await import('./route');
    await POST(post({ planId: 'plan-1', firstMessage: OPENER }));
    expect(emails.map(e => e.kind)).toEqual(['message']);
  });

  it('emails a genuine reopen as somebody asking again', async () => {
    results = emailFixtures();
    rpcResults = { [RPC]: rpcOk({ reopened: true, notify_host: true }) };
    const { POST } = await import('./route');
    await POST(post({ planId: 'plan-1', firstMessage: OPENER, requestAgain: true }));
    expect(emails.map(e => e.kind)).toEqual(['again']);
  });

  it('says nothing on a repeat message into a thread that already exists', async () => {
    results = emailFixtures();
    rpcResults = { [RPC]: rpcOk({ notify_host: false }) };
    const { POST } = await import('./route');
    await POST(post({ planId: 'plan-1', firstMessage: OPENER, requestAgain: true }));
    expect(emails).toHaveLength(0);
  });
});

describe('PATCH before the lifecycle migration has run', () => {
  beforeEach(() => {
    currentUser = { id: 'user-host' };
    results = {
      conversations: [
        {
          data: {
            id: 'conv-1', status: 'pending', poster_id: 'user-host', joiner_id: 'user-joiner',
            plan_id: 'plan-1', plan: { text: 'coffee saturday' },
            poster: { name: 'Maya' }, joiner: { name: 'Theo' }
          }
        }
      ]
    };
  });

  it('refuses to confirm rather than falling back to a non atomic write', async () => {
    rpcResults = { confirm_conversation: MISSING_FUNCTION };
    const { PATCH } = await import('./route');
    const res = await PATCH(patch({ conversationId: 'conv-1', action: 'confirm' }));
    expect(res.status).toBe(503);
    expect(calls.some(c => c.table === 'conversations' && c.op === 'update')).toBe(false);
    expect(emails).toHaveLength(0);
  });

  it('refuses to decline the same way', async () => {
    rpcResults = { confirm_conversation: MISSING_FUNCTION };
    const { PATCH } = await import('./route');
    const res = await PATCH(patch({ conversationId: 'conv-1', action: 'decline' }));
    expect(res.status).toBe(503);
    expect(calls.some(c => c.table === 'conversations' && c.op === 'update')).toBe(false);
  });

  it('confirms through the function when it is there, and emails once', async () => {
    rpcResults = {
      confirm_conversation: { data: { ok: true, status: 'confirmed', spots_left: 1, plan_status: 'open' } }
    };
    results.profiles = [{ data: { notify_email: 'joiner@example.test' } }];
    const { PATCH } = await import('./route');
    const res = await PATCH(patch({ conversationId: 'conv-1', action: 'confirm' }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('confirmed');
    expect(emails.map(e => e.kind)).toEqual(['confirmed']);
  });

  it('surfaces a closed plan as its own answer, not as no spots left', async () => {
    rpcResults = {
      confirm_conversation: { data: { ok: false, code: 'plan_closed', error: 'This plan is closed.' } }
    };
    const { PATCH } = await import('./route');
    const res = await PATCH(patch({ conversationId: 'conv-1', action: 'confirm' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/closed/i);
    expect(emails).toHaveLength(0);
  });
});

describe('the private requester card', () => {
  function get(conversationId: string) {
    return new Request(`http://localhost/api/conversations?conversationId=${conversationId}`) as any;
  }

  it('fails closed with fixed copy when the block lookup cannot answer', async () => {
    currentUser = { id: 'user-host' };
    results = {
      conversations: [
        { data: { id: 'conv-1', status: 'pending', poster_id: 'user-host', joiner_id: 'user-joiner', plan_id: 'plan-1' } }
      ]
    };
    blockLookup = { ok: false, error: 'schema cache miss' };

    const { GET } = await import('./route');
    const res = await GET(get('conv-1'));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).not.toHaveProperty('requester');
    expect(JSON.stringify(body)).not.toMatch(/schema cache miss/);
    // No admin profile or message reads happen once the lookup has failed.
    expect(calls.some(c => c.table === 'profiles' || c.table === 'messages')).toBe(false);
  });

  it('shows the opener from the current request cycle after a re-request', async () => {
    currentUser = { id: 'user-host' };
    results = {
      conversations: [
        {
          data: {
            id: 'conv-1', status: 'pending', poster_id: 'user-host', joiner_id: 'user-joiner',
            plan_id: 'plan-1', reopened_at: '2026-08-06T10:00:00.000Z'
          }
        }
      ],
      profiles: [{ data: { id: 'user-joiner', name: 'Theo Park', about: null, neighborhood_id: null } }],
      plans: [{ count: 0 }],
      messages: [{ data: [{ text: 'Asking again, if there is still room.' }] }]
    };

    const { GET } = await import('./route');
    const res = await GET(get('conv-1'));
    const body = await res.json();

    expect(body.requester.opener).toBe('Asking again, if there is still room.');
    // The read is scoped to the current cycle, not simply the oldest message.
    const messageRead = calls.filter(c => c.table === 'messages');
    expect(messageRead.some(c => c.op === 'gte' && c.args[0] === 'created_at')).toBe(true);
  });

  it('takes the first message when the request has never been reopened', async () => {
    currentUser = { id: 'user-host' };
    results = {
      conversations: [
        {
          data: {
            id: 'conv-1', status: 'pending', poster_id: 'user-host', joiner_id: 'user-joiner',
            plan_id: 'plan-1', reopened_at: null
          }
        }
      ],
      profiles: [{ data: { id: 'user-joiner', name: 'Theo Park', about: null, neighborhood_id: null } }],
      plans: [{ count: 0 }],
      messages: [{ data: [{ text: 'I am around that morning.' }] }]
    };

    const { GET } = await import('./route');
    const res = await GET(get('conv-1'));
    expect((await res.json()).requester.opener).toBe('I am around that morning.');
    expect(calls.filter(c => c.table === 'messages').some(c => c.op === 'gte')).toBe(false);
  });
});

describe('POST onto a conversation that is already active', () => {
  it('returns the state without writing a message or emailing', async () => {
    results = emailFixtures();
    rpcResults = {
      [RPC]: rpcOk({ status: 'pending', created: false, reopened: false, message_written: false, notify_host: false })
    };
    const { POST } = await import('./route');
    const res = await POST(post({ planId: 'plan-1', firstMessage: OPENER }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('pending');
    expect(body.messageWritten).toBe(false);
    // The daily message limit lives in /api/messages, so this path must not be
    // a way to add messages around it.
    expect(wrote()).toBe(false);
    expect(emails).toHaveLength(0);
  });

  it('says so for a confirmed thread too', async () => {
    results = emailFixtures();
    rpcResults = {
      [RPC]: rpcOk({ status: 'confirmed', message_written: false, notify_host: false })
    };
    const { POST } = await import('./route');
    const body = await (await POST(post({ planId: 'plan-1', firstMessage: OPENER }))).json();
    expect(body.status).toBe('confirmed');
    expect(body.messageWritten).toBe(false);
    expect(emails).toHaveLength(0);
  });
});
