import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Revoking a push token, and the one case the old rule could not serve.
 *
 * The revoke was scoped to `user_id = caller`, full stop. That is right for an
 * installation id on its own — it is a hint the client supplies, and a guessed
 * one must never switch off a stranger's notifications. But it made a shared
 * phone unfixable: sign out with no signal, the revoke is written down as
 * pending, someone else signs in on that phone, and the retry now runs under
 * the new account, matches nothing, and the pending record is deleted. The
 * first person's registration stays live and their notifications keep arriving
 * on a phone that is not theirs any more.
 *
 * A caller presenting the exact token AND the exact installation id is the
 * device: both live in that phone's keychain and neither is guessable. That
 * pair revokes the registration whoever owned it.
 */

const rows: { id: string; user_id: string; expo_push_token: string; installation_id: string }[] = [];
const requireUserMock = vi.fn();
const getRouteAuth = vi.fn();

/** A tiny stand-in for the PostgREST builder, over an in-memory table. */
function table() {
  return {
    delete() {
      const filters: Record<string, string> = {};
      const builder = {
        eq(column: string, value: string) {
          filters[column] = value;
          return builder;
        },
        select() {
          const matches = rows.filter(r =>
            Object.entries(filters).every(([k, v]) => (r as unknown as Record<string, string>)[k] === v)
          );
          for (const match of matches) rows.splice(rows.indexOf(match), 1);
          return Promise.resolve({ data: matches.map(m => ({ id: m.id })), error: null });
        }
      };
      return builder;
    },
    select() {
      const filters: Record<string, string> = {};
      const builder = {
        eq(column: string, value: string) {
          filters[column] = value;
          return builder;
        },
        limit() {
          const matches = rows.filter(r =>
            Object.entries(filters).every(([k, v]) => (r as unknown as Record<string, string>)[k] === v)
          );
          return Promise.resolve({ data: matches.map(m => ({ id: m.id })), error: null });
        }
      };
      return builder;
    }
  };
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: () => table(), rpc: vi.fn(async () => ({ data: 'ok', error: null })) }
}));
vi.mock('@/lib/moderation', () => ({ suspensionGate: vi.fn(async () => null) }));
vi.mock('@/lib/supabase/route', async () => {
  const { NextResponse } = await import('next/server');
  return {
    getRouteAuth,
    requireUser: (auth: { user: unknown }) => {
      requireUserMock(auth);
      return auth.user ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  };
});

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const OTHER_TOKEN = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';
const INSTALL = 'install-1';

async function revoke(body: unknown, userId = 'user-2') {
  getRouteAuth.mockResolvedValue({ user: { id: userId }, supabase: {}, via: 'bearer' });
  const { DELETE } = await import('./route');
  const request = new Request('https://www.stoop.house/api/push/register', {
    method: 'DELETE',
    body: JSON.stringify(body)
  });
  return DELETE(request as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  rows.length = 0;
  rows.push({ id: 'row-1', user_id: 'user-1', expo_push_token: TOKEN, installation_id: INSTALL });
});

describe('DELETE /api/push/register', () => {
  it('revokes this account\'s own registration', async () => {
    rows.push({ id: 'row-2', user_id: 'user-2', expo_push_token: OTHER_TOKEN, installation_id: 'install-2' });

    const response = await revoke({ token: OTHER_TOKEN, installationId: 'install-2' });

    await expect(response.json()).resolves.toMatchObject({ ok: true, revoked: 1, tokenCleared: true });
    expect(rows.map(r => r.id)).toEqual(['row-1']);
  });

  /**
   * The account-switch case. user-2 is signed in on a phone whose still-live
   * registration belongs to user-1, and presents both keys from its own
   * keychain.
   */
  it('revokes a former owner\'s registration when the exact token and install are presented', async () => {
    const response = await revoke({ token: TOKEN, installationId: INSTALL }, 'user-2');

    await expect(response.json()).resolves.toMatchObject({ ok: true, revoked: 1, tokenCleared: true });
    expect(rows).toHaveLength(0);
  });

  it('does not let a guessed installation id touch someone else\'s registration', async () => {
    const response = await revoke({ installationId: INSTALL }, 'user-2');

    await expect(response.json()).resolves.toMatchObject({ revoked: 0 });
    expect(rows).toHaveLength(1);
  });

  it('does not let a token alone revoke someone else\'s registration', async () => {
    const response = await revoke({ token: TOKEN }, 'user-2');

    const body = await response.json();
    expect(body.revoked).toBe(0);
    // And it says so: the registration is still live, so the phone must keep
    // its pending record rather than forgetting it.
    expect(body.tokenCleared).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it('reports tokenCleared false when the pair does not match the stored row', async () => {
    const response = await revoke({ token: TOKEN, installationId: 'a-different-install' }, 'user-2');

    const body = await response.json();
    expect(body.revoked).toBe(0);
    expect(body.tokenCleared).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it('is a no-op, honestly reported, when there is nothing left to revoke', async () => {
    rows.length = 0;

    const response = await revoke({ token: TOKEN, installationId: INSTALL });

    const body = await response.json();
    expect(body.revoked).toBe(0);
    // Nothing was deleted, but nothing with that token remains either, so the
    // phone's obligation is discharged.
    expect(body.tokenCleared).toBe(true);
  });

  it('refuses a request with neither key', async () => {
    expect((await revoke({})).status).toBe(400);
  });

  it('needs a verified caller', async () => {
    getRouteAuth.mockResolvedValue({ user: null, supabase: {}, via: 'cookie' });
    const { DELETE } = await import('./route');
    const response = await DELETE(new Request('https://www.stoop.house/api/push/register', {
      method: 'DELETE',
      body: JSON.stringify({ token: TOKEN, installationId: INSTALL })
    }) as never);

    expect(response.status).toBe(401);
    expect(rows).toHaveLength(1);
  });
});
