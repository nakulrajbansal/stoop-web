import { describe, it, expect } from 'vitest';
import { getBlockedIds, getBlockedIdsResult } from './blocks';

function client(response: { data?: unknown; error?: unknown }) {
  return { rpc: async () => response } as any;
}

describe('getBlockedIdsResult', () => {
  it('returns the ids when the lookup works', async () => {
    const result = await getBlockedIdsResult(
      client({ data: [{ other_id: 'user-a' }, { other_id: 'user-b' }] }),
      'me'
    );
    expect(result).toEqual({ ok: true, ids: ['user-a', 'user-b'] });
  });

  it('returns an empty list, not a failure, when nobody is blocked', async () => {
    expect(await getBlockedIdsResult(client({ data: [] }), 'me')).toEqual({ ok: true, ids: [] });
  });

  it('reports a failure rather than an empty list when the lookup errors', async () => {
    const result = await getBlockedIdsResult(client({ error: { message: 'schema cache miss' } }), 'me');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/schema cache miss/);
  });

  it('treats a missing payload as a failure too', async () => {
    expect((await getBlockedIdsResult(client({ data: null }), 'me')).ok).toBe(false);
  });

  it('reports a thrown error instead of letting it escape', async () => {
    const throwing = { rpc: async () => { throw new Error('connection reset'); } } as any;
    const result = await getBlockedIdsResult(throwing, 'me');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/connection reset/);
  });
});

describe('getBlockedIds, the lenient wrapper the feed surfaces use', () => {
  it('still answers with a list so browsing keeps working', async () => {
    expect(await getBlockedIds(client({ data: [{ other_id: 'user-a' }] }), 'me')).toEqual(['user-a']);
    expect(await getBlockedIds(client({ error: { message: 'nope' } }), 'me')).toEqual([]);
  });
});
