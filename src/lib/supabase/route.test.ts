import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The credential boundary every API route sits behind.
 *
 * The rule that matters: cookie auth is reached only when NO Authorization
 * header was sent. A header that is present but unusable used to fall through
 * to whatever cookies rode along, so a request that presented a broken bearer
 * token could still succeed on an ambient browser session.
 */

const getUserWithToken = vi.fn();
const getUserFromCookies = vi.fn();
const createSupabaseClient = vi.fn(() => ({ auth: { getUser: getUserWithToken } }));
const createCookieClient = vi.fn(async () => ({ auth: { getUser: getUserFromCookies } }));

vi.mock('@supabase/supabase-js', () => ({ createClient: createSupabaseClient }));
vi.mock('./server', () => ({ createClient: createCookieClient }));

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLWhlcmU';
const USER = { id: 'user-1' };

function request(headers: Record<string, string> = {}) {
  return new Request('https://www.stoop.house/api/plans', { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon-key';
});

async function lib() {
  return import('./route');
}

describe('getRouteAuth', () => {
  it('verifies a valid bearer token against Supabase Auth on every request', async () => {
    getUserWithToken.mockResolvedValue({ data: { user: USER }, error: null });

    const auth = await (await lib()).getRouteAuth(request({ authorization: `Bearer ${JWT}` }));

    expect(auth.via).toBe('bearer');
    expect(auth.user).toEqual(USER);
    expect(auth.rejected).toBeUndefined();
    // The token is handed to Supabase, not decoded locally.
    expect(getUserWithToken).toHaveBeenCalledWith(JWT);
    expect(createCookieClient).not.toHaveBeenCalled();
  });

  it('returns no user for an expired or forged token, and does not fall back to cookies', async () => {
    getUserWithToken.mockResolvedValue({ data: null, error: { message: 'token is expired' } });

    const auth = await (await lib()).getRouteAuth(request({
      authorization: `Bearer ${JWT}`,
      cookie: 'sb-access-token=someone-elses-session'
    }));

    expect(auth.user).toBeNull();
    expect(auth.via).toBe('bearer');
    expect(createCookieClient).not.toHaveBeenCalled();
  });

  it('rejects a malformed Authorization header outright, cookies present or not', async () => {
    for (const header of ['Bearer', 'Bearer garbage', 'Basic abc', `Bearer ${JWT} extra`]) {
      vi.clearAllMocks();
      const auth = await (await lib()).getRouteAuth(request({
        authorization: header,
        cookie: 'sb-access-token=someone-elses-session'
      }));

      expect(auth.rejected, header).toBe('malformed_authorization');
      expect(auth.user, header).toBeNull();
      expect(createCookieClient, header).not.toHaveBeenCalled();
      expect(getUserWithToken, header).not.toHaveBeenCalled();
    }
  });

  it('uses cookie auth only when no Authorization header was sent', async () => {
    getUserFromCookies.mockResolvedValue({ data: { user: USER } });

    const auth = await (await lib()).getRouteAuth(request({ cookie: 'sb-access-token=browser-session' }));

    expect(auth.via).toBe('cookie');
    expect(auth.user).toEqual(USER);
    expect(createCookieClient).toHaveBeenCalled();
  });

  it('treats an empty Authorization header as absent, so a browser is unaffected', async () => {
    getUserFromCookies.mockResolvedValue({ data: { user: USER } });

    const auth = await (await lib()).getRouteAuth(request({ authorization: '   ' }));

    expect(auth.via).toBe('cookie');
    expect(auth.rejected).toBeUndefined();
  });
});

describe('requireUser', () => {
  it('passes a verified caller through', async () => {
    const { requireUser } = await lib();
    expect(requireUser({ supabase: {} as never, user: USER as never, via: 'bearer' })).toBeNull();
  });

  it('answers the same 401 for a missing session and for a broken credential', async () => {
    const { requireUser } = await lib();

    const noSession = requireUser({ supabase: {} as never, user: null, via: 'cookie' })!;
    const malformed = requireUser({
      supabase: {} as never,
      user: null,
      via: 'bearer',
      rejected: 'malformed_authorization'
    })!;

    expect(noSession.status).toBe(401);
    expect(malformed.status).toBe(401);
    await expect(malformed.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});
