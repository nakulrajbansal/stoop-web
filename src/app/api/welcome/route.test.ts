import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The welcome email must be sent at most once per account, however many times
 * the route is called and however many callers arrive at the same moment.
 *
 * It used to be bounded only by the age of the account: any call inside the
 * first fifteen minutes sent mail, so a retry loop or fifty concurrent calls
 * delivered fifty emails. The bound is now a database claim.
 */

const maybeSingle = vi.fn();
const rpc = vi.fn();
const sendWelcome = vi.fn();
const suspensionGate = vi.fn(async () => null);
const getRouteAuth = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    rpc
  }
}));
vi.mock('@/lib/resend', () => ({ sendWelcome }));
vi.mock('@/lib/moderation', () => ({ suspensionGate }));
vi.mock('@/lib/supabase/route', async () => {
  const { NextResponse } = await import('next/server');
  return {
    getRouteAuth,
    requireUser: (auth: { user: unknown }) =>
      auth.user ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  };
});

const USER = { id: 'user-1' };
const FRESH = { name: 'Maya Chen', notify_email: 'maya@example.com', created_at: new Date().toISOString() };

/** One shared claim marker, so concurrent calls contend the way the row does. */
function databaseWithOneClaim() {
  let claimed = false;
  rpc.mockImplementation(async (fn: string) => {
    if (fn === 'claim_welcome_email') {
      if (claimed) return { data: 'already_claimed', error: null };
      claimed = true;
      return { data: 'claimed', error: null };
    }
    return { data: null, error: null };
  });
}

async function post() {
  const { POST } = await import('./route');
  return POST(new Request('https://www.stoop.house/api/welcome', { method: 'POST' }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getRouteAuth.mockResolvedValue({ user: USER, supabase: {}, via: 'bearer' });
  suspensionGate.mockResolvedValue(null);
  maybeSingle.mockResolvedValue({ data: FRESH, error: null });
  sendWelcome.mockResolvedValue(true);
  databaseWithOneClaim();
});

describe('POST /api/welcome', () => {
  it('sends once for a brand-new account', async () => {
    const response = await post();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, sent: true });
    expect(sendWelcome).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('mark_welcome_email_sent', { p_user_id: 'user-1' });
  });

  it('never takes the recipient or the name from the caller', async () => {
    await post();
    // Both come from the profile row read server side.
    expect(sendWelcome).toHaveBeenCalledWith('maya@example.com', 'Maya Chen', 'welcome:user-1');
  });

  it('sends nothing on a repeat call, even inside the age window', async () => {
    await post();
    sendWelcome.mockClear();

    const again = await post();

    expect(sendWelcome).not.toHaveBeenCalled();
    await expect(again.json()).resolves.toMatchObject({ sent: false, reason: 'already_claimed' });
  });

  it('sends once for fifty repeated calls', async () => {
    for (let i = 0; i < 50; i++) await post();
    expect(sendWelcome).toHaveBeenCalledTimes(1);
  });

  it('sends once when the calls arrive concurrently', async () => {
    const responses = await Promise.all(Array.from({ length: 12 }, () => post()));

    expect(sendWelcome).toHaveBeenCalledTimes(1);
    const bodies = await Promise.all(responses.map(r => r.json()));
    expect(bodies.filter((b: { sent: boolean }) => b.sent)).toHaveLength(1);
  });

  it('still refuses an account older than the window without touching the claim', async () => {
    maybeSingle.mockResolvedValue({
      data: { ...FRESH, created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
      error: null
    });

    await expect((await post()).json()).resolves.toMatchObject({ sent: false, reason: 'too_old' });
    expect(rpc).not.toHaveBeenCalled();
    expect(sendWelcome).not.toHaveBeenCalled();
  });

  describe('when the provider fails', () => {
    it('answers 503 and does not record a send that did not happen', async () => {
      sendWelcome.mockResolvedValue(false);

      const response = await post();

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ code: 'welcome_send_failed' });
      expect(rpc).not.toHaveBeenCalledWith('mark_welcome_email_sent', expect.anything());
    });

    /**
     * Releasing the claim on failure would re-open the window this route exists
     * to close, and we cannot tell a dropped message from a dropped connection.
     * The claim ages out on its own instead, and the send carries an
     * idempotency key so the eventual retry cannot deliver a second copy.
     */
    it('holds the claim rather than releasing it, so an immediate retry sends nothing', async () => {
      sendWelcome.mockResolvedValue(false);
      await post();
      sendWelcome.mockClear();
      sendWelcome.mockResolvedValue(true);

      const retry = await post();

      expect(sendWelcome).not.toHaveBeenCalled();
      await expect(retry.json()).resolves.toMatchObject({ sent: false });
    });

    it('carries an idempotency key derived from the account, not from the request', async () => {
      await post();
      expect(sendWelcome).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'welcome:user-1');
    });
  });

  it('is 503, not a send, when the claim itself cannot be taken', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    const response = await post();

    expect(response.status).toBe(503);
    expect(sendWelcome).not.toHaveBeenCalled();
  });

  it('needs a verified caller', async () => {
    getRouteAuth.mockResolvedValue({ user: null, supabase: {}, via: 'cookie' });

    expect((await post()).status).toBe(401);
    expect(sendWelcome).not.toHaveBeenCalled();
  });
});
