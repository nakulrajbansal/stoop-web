import { describe, expect, it, vi } from 'vitest';
import { avatarObjectPath, isMissingObjectError, removeAvatarObject } from './avatar-storage';

/**
 * Supabase Storage's `remove()` resolves with `{ data, error }`; it does not
 * throw. Account deletion wrapped it in a try/catch and called the catch
 * "non-fatal if there was none", so a storage failure was indistinguishable
 * from a clean delete. The auth user was then destroyed anyway and the member's
 * photo stayed on a public URL, belonging to an account that no longer existed.
 */

function storage(result: unknown, options: { throws?: boolean } = {}) {
  const remove = vi.fn(async () => {
    if (options.throws) throw new Error('socket hang up');
    return result as { data: unknown; error: { message?: string } | null };
  });
  return { storage: { from: vi.fn(() => ({ remove })) }, remove };
}

describe('removeAvatarObject', () => {
  it('reports success and that the object was there', async () => {
    const { storage: s, remove } = storage({ data: [{ name: 'u1.jpg' }], error: null });

    expect(await removeAvatarObject(s, 'u1')).toEqual({ ok: true, existed: true });
    expect(remove).toHaveBeenCalledWith(['u1.jpg']);
  });

  it('reports a failure the caller can act on rather than swallowing it', async () => {
    const { storage: s } = storage({ data: null, error: { message: 'Internal server error' } });

    expect(await removeAvatarObject(s, 'u1')).toEqual({
      ok: false,
      reason: 'Internal server error'
    });
  });

  it('treats a thrown transport error as a failure, not an absent object', async () => {
    const { storage: s } = storage(null, { throws: true });

    const result = await removeAvatarObject(s, 'u1');
    expect(result.ok).toBe(false);
  });

  /**
   * Somebody who never uploaded a photo must still be able to delete their
   * account, so "not there" is done, not broken.
   */
  it('succeeds when the object was never there', async () => {
    const { storage: s } = storage({ data: [], error: null });
    expect(await removeAvatarObject(s, 'u1')).toEqual({ ok: true, existed: false });
  });

  it('succeeds when storage reports the object as not found', async () => {
    const { storage: s } = storage({ data: null, error: { message: 'Object not found' } });
    expect(await removeAvatarObject(s, 'u1')).toEqual({ ok: true, existed: false });
  });
});

describe('isMissingObjectError', () => {
  it('recognises the shapes storage uses for a missing object', () => {
    expect(isMissingObjectError({ message: 'Object not found' })).toBe(true);
    expect(isMissingObjectError({ message: 'The resource does not exist' })).toBe(true);
    expect(isMissingObjectError({ message: 'NoSuchKey' })).toBe(true);
  });

  it('does not mistake an operational failure for a missing object', () => {
    expect(isMissingObjectError({ message: 'Internal server error' })).toBe(false);
    expect(isMissingObjectError({ message: 'permission denied' })).toBe(false);
    expect(isMissingObjectError({ message: '' })).toBe(false);
    expect(isMissingObjectError(null)).toBe(false);
    expect(isMissingObjectError(undefined)).toBe(false);
  });
});

describe('avatarObjectPath', () => {
  it('is the public key the Avatar component renders', () => {
    expect(avatarObjectPath('abc-123')).toBe('abc-123.jpg');
  });
});
