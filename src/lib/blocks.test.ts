import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The block list has to fail closed.
 *
 * `getBlockedIds` answered `[]` when the RPC failed, and `[]` reads as "nobody
 * is blocked". A Supabase blip therefore un-blocked everyone for its duration:
 * the feed showed a blocked member's plans to the person who blocked them, and
 * /api/conversations let the pair start talking. An empty list is a real answer
 * and must not double as an error.
 */

const rpc = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { rpc }
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function lib() {
  return import('./blocks');
}

describe('getBlockedIds', () => {
  it('returns both directions of the relationship', async () => {
    rpc.mockResolvedValue({ data: [{ other_id: 'a' }, { other_id: 'b' }], error: null });
    expect(await (await lib()).getBlockedIds('u1')).toEqual(['a', 'b']);
  });

  it('returns an empty list when there genuinely are no blocks', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await (await lib()).getBlockedIds('u1')).toEqual([]);
  });

  it('treats a null payload with no error as no blocks', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await (await lib()).getBlockedIds('u1')).toEqual([]);
  });

  it('throws on a lookup failure instead of reporting nobody is blocked', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const { getBlockedIds, BlockLookupError } = await lib();
    await expect(getBlockedIds('u1')).rejects.toBeInstanceOf(BlockLookupError);
  });

  /**
   * The RPC takes an arbitrary user id and answers with that person's block
   * relationships in BOTH directions, which includes who has blocked them. It
   * used to be granted to `authenticated`, so any signed-in member could
   * enumerate anyone's block graph. 0008 restricts it to the service role, so
   * the lookup has to go through the admin client.
   */
  it('goes through the service-role client, not the caller\'s own', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await (await lib()).getBlockedIds('u1');
    expect(rpc).toHaveBeenCalledWith('blocked_user_ids', { for_user: 'u1' });
  });
});

describe('blockLookupUnavailable', () => {
  it('is a retryable 503, not a 500 and not an empty result', async () => {
    const response = (await lib()).blockLookupUnavailable();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'block_lookup_unavailable' });
  });
});
