import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Confirming a join request is a promise to a real person, so it has to respect
 * the plan's capacity.
 *
 * `resolve_conversation` used to confirm ANY pending conversation, and 0001's
 * trigger then decremented `spots_left` with a GREATEST(0, ...) floor. A
 * one-spot plan with three pending requests confirmed all three and the count
 * simply bottomed out at zero. The capacity check now happens inside the same
 * locked transaction as the status change; these tests cover the route's half
 * of that — that every outcome the function can return is mapped, and that only
 * a real transition notifies anybody.
 */

const rpc = vi.fn();
const notifyUser = vi.fn(async () => {});
const sendConfirmed = vi.fn(async () => {});
const getRouteAuth = vi.fn();
const maybeSingle = vi.fn();
const single = vi.fn(async () => ({ data: { notify_email: 'joiner@example.com' }, error: null }));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ single }) }) })
  }
}));
vi.mock('@/lib/push', () => ({ notifyUser }));
vi.mock('@/lib/resend', () => ({ sendConfirmed, sendMessageAlert: vi.fn() }));
vi.mock('@/lib/moderation', () => ({ suspensionGate: vi.fn(async () => null) }));
vi.mock('@/lib/blocks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/blocks')>('@/lib/blocks');
  return { ...actual, getBlockedIds: vi.fn(async () => []) };
});
vi.mock('@/lib/text-moderation', () => ({
  BLOCKED_LANGUAGE_MESSAGE: 'no',
  containsBlockedLanguage: () => false,
  isBlockedLanguageError: () => false
}));
vi.mock('@/lib/supabase/route', async () => {
  const { NextResponse } = await import('next/server');
  return {
    getRouteAuth,
    requireUser: (auth: { user: unknown }) =>
      auth.user ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  };
});

const POSTER = { id: 'poster-1' };
const CONVERSATION = {
  id: 'conv-1',
  status: 'pending',
  poster_id: 'poster-1',
  joiner_id: 'joiner-1',
  plan: { text: 'coffee saturday' },
  poster: { name: 'Maya' }
};

async function patch(action: 'confirm' | 'decline' = 'confirm') {
  const { PATCH } = await import('./route');
  return PATCH(new Request('https://www.stoop.house/api/conversations', {
    method: 'PATCH',
    body: JSON.stringify({ conversationId: 'conv-1', action })
  }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getRouteAuth.mockResolvedValue({
    user: POSTER,
    supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) },
    via: 'bearer'
  });
  maybeSingle.mockResolvedValue({ data: CONVERSATION, error: null });
  rpc.mockResolvedValue({ data: 'updated', error: null });
});

describe('PATCH /api/conversations', () => {
  it('confirms, and notifies, when the transition actually happened', async () => {
    const response = await patch('confirm');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, status: 'confirmed' });
    expect(rpc).toHaveBeenCalledWith('resolve_conversation', {
      p_conversation_id: 'conv-1',
      p_poster_id: 'poster-1',
      p_status: 'confirmed'
    });
    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(sendConfirmed).toHaveBeenCalledTimes(1);
  });

  it('answers 409 plan_full when the last spot went to somebody else', async () => {
    rpc.mockResolvedValue({ data: 'full', error: null });

    const response = await patch('confirm');

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'plan_full' });
  });

  it('answers 409 plan_closed for a removed, expired or past-its-time plan', async () => {
    rpc.mockResolvedValue({ data: 'closed', error: null });

    const response = await patch('confirm');

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'plan_closed' });
  });

  it('answers 409 already_resolved for a retry of a request that is already answered', async () => {
    rpc.mockResolvedValue({ data: 'already_resolved', error: null });

    const response = await patch('confirm');

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'already_resolved' });
  });

  it('answers 403 when the conversation is not this poster\'s', async () => {
    rpc.mockResolvedValue({ data: 'not_found', error: null });
    expect((await patch('confirm')).status).toBe(403);
  });

  it('notifies nobody unless the status actually changed', async () => {
    for (const outcome of ['full', 'closed', 'already_resolved', 'not_found']) {
      vi.clearAllMocks();
      maybeSingle.mockResolvedValue({ data: CONVERSATION, error: null });
      rpc.mockResolvedValue({ data: outcome, error: null });

      await patch('confirm');

      expect(notifyUser, outcome).not.toHaveBeenCalled();
      expect(sendConfirmed, outcome).not.toHaveBeenCalled();
    }
  });

  it('declines without notifying, and a decline is never refused for capacity', async () => {
    rpc.mockResolvedValue({ data: 'updated', error: null });

    const response = await patch('decline');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, status: 'declined' });
    expect(notifyUser).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ p_status: 'declined' }));
  });

  it('does not confirm on an RPC failure', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'deadlock detected' } });

    expect((await patch('confirm')).status).toBe(500);
    expect(notifyUser).not.toHaveBeenCalled();
  });
});

/**
 * Two requests, one remaining spot. The route is stateless, so the plan's
 * capacity lives in the function; this drives the real sequence the database
 * produces — the first caller wins, the second is told the plan is full.
 */
describe('one spot, two requests', () => {
  it('confirms one and refuses the other', async () => {
    let spotsLeft = 1;
    rpc.mockImplementation(async (_fn: string, args: { p_status: string }) => {
      if (args.p_status !== 'confirmed') return { data: 'updated', error: null };
      if (spotsLeft < 1) return { data: 'full', error: null };
      spotsLeft -= 1;
      return { data: 'updated', error: null };
    });

    const first = await patch('confirm');
    const second = await patch('confirm');

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({ code: 'plan_full' });
    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(spotsLeft).toBe(0);
  });

  it('still lets the host decline the second one', async () => {
    rpc.mockImplementation(async (_fn: string, args: { p_status: string }) =>
      args.p_status === 'confirmed' ? { data: 'full', error: null } : { data: 'updated', error: null }
    );

    expect((await patch('confirm')).status).toBe(409);
    expect((await patch('decline')).status).toBe(200);
  });
});
