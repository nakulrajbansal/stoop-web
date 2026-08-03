import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Account deletion must not destroy the auth user while the member's photo is
 * still on a public URL.
 *
 * The avatar removal was wrapped in a try/catch and called non-fatal, but
 * Supabase Storage's `remove()` reports failure by resolving with `{ error }`
 * rather than throwing, so the catch never fired. A storage outage looked
 * exactly like a clean delete, the cascade root was deleted anyway, and the
 * orphaned object had no account left to retry from.
 */

const remove = vi.fn();
const deleteUser = vi.fn();
const getRouteAuth = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    storage: { from: () => ({ remove }) },
    auth: { admin: { deleteUser } }
  }
}));
vi.mock('@/lib/supabase/route', async () => {
  const { NextResponse } = await import('next/server');
  return {
    getRouteAuth,
    requireUser: (auth: { user: unknown }) =>
      auth.user ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  };
});

async function del() {
  const { DELETE } = await import('./route');
  return DELETE(new Request('https://www.stoop.house/api/account', { method: 'DELETE' }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getRouteAuth.mockResolvedValue({ user: { id: 'user-1' }, supabase: {}, via: 'bearer' });
  remove.mockResolvedValue({ data: [{ name: 'user-1.jpg' }], error: null });
  deleteUser.mockResolvedValue({ error: null });
});

describe('DELETE /api/account', () => {
  it('removes the photo and then the account', async () => {
    const response = await del();

    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledWith(['user-1.jpg']);
    expect(deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('deletes an account that never had a photo', async () => {
    remove.mockResolvedValue({ data: [], error: null });

    expect((await del()).status).toBe(200);
    expect(deleteUser).toHaveBeenCalled();
  });

  it('treats an object storage says is missing as already gone', async () => {
    remove.mockResolvedValue({ data: null, error: { message: 'Object not found' } });

    expect((await del()).status).toBe(200);
    expect(deleteUser).toHaveBeenCalled();
  });

  it('refuses to delete the account when the photo cannot be removed', async () => {
    remove.mockResolvedValue({ data: null, error: { message: 'Internal server error' } });

    const response = await del();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'avatar_delete_failed' });
    // The one thing that must not happen: losing the ability to retry.
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('is retryable — the same request succeeds once storage recovers', async () => {
    remove.mockResolvedValueOnce({ data: null, error: { message: 'Internal server error' } });
    expect((await del()).status).toBe(503);

    remove.mockResolvedValue({ data: [{ name: 'user-1.jpg' }], error: null });
    expect((await del()).status).toBe(200);
    expect(deleteUser).toHaveBeenCalledTimes(1);
  });

  it('reports a failed auth delete rather than claiming success', async () => {
    deleteUser.mockResolvedValue({ error: { message: 'nope' } });
    expect((await del()).status).toBe(500);
  });

  it('needs a verified caller', async () => {
    getRouteAuth.mockResolvedValue({ user: null, supabase: {}, via: 'cookie' });

    expect((await del()).status).toBe(401);
    expect(remove).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
