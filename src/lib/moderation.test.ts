import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Account standing has to fail closed.
 *
 * The old `isSuspended` returned a plain boolean and answered `false` when the
 * lookup itself failed, so a Supabase blip let a suspended account keep posting
 * and messaging for as long as the blip lasted.
 */

const maybeSingle = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })
  }
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function lib() {
  return import('./moderation');
}

describe('accountStanding', () => {
  it('is ok for a profile with no blocked_at', async () => {
    maybeSingle.mockResolvedValue({ data: { blocked_at: null }, error: null });
    expect(await (await lib()).accountStanding('u1')).toBe('ok');
  });

  it('is suspended when blocked_at is set', async () => {
    maybeSingle.mockResolvedValue({ data: { blocked_at: '2026-01-01T00:00:00Z' }, error: null });
    expect(await (await lib()).accountStanding('u1')).toBe('suspended');
  });

  it('is ok for a verified phone with no profile row yet', async () => {
    // Mid-signup. Not suspended, and must not be treated as a failure.
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await (await lib()).accountStanding('u1')).toBe('ok');
  });

  it('is unknown when the lookup fails, not ok', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    expect(await (await lib()).accountStanding('u1')).toBe('unknown');
  });
});

describe('suspensionGate', () => {
  it('lets a member in good standing through', async () => {
    maybeSingle.mockResolvedValue({ data: { blocked_at: null }, error: null });
    expect(await (await lib()).suspensionGate('u1')).toBeNull();
  });

  it('answers 403 with the code the app branches on', async () => {
    maybeSingle.mockResolvedValue({ data: { blocked_at: '2026-01-01T00:00:00Z' }, error: null });
    const response = await (await lib()).suspensionGate('u1');
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({ code: 'account_suspended' });
  });

  it('refuses the write when standing cannot be established', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const response = await (await lib()).suspensionGate('u1');
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({ code: 'standing_unavailable' });
  });
});

describe('isSuspended', () => {
  it('is true only for a definite suspension', async () => {
    const { isSuspended } = await lib();

    maybeSingle.mockResolvedValue({ data: { blocked_at: '2026-01-01T00:00:00Z' }, error: null });
    expect(await isSuspended('u1')).toBe(true);

    vi.spyOn(console, 'error').mockImplementation(() => {});
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await isSuspended('u1')).toBe(false);
  });
});
