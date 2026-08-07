/**
 * Where Google and Apple come back to.
 *
 * This is the one route in the app a stranger can aim a browser at with
 * attacker-chosen query parameters and expect a redirect out of it, so it gets
 * treated like one. Three things it must never do: send anybody off the site,
 * repeat what the provider said, or leave somebody holding a session with no
 * profile and no way to finish making one.
 *
 * It also must not become a second signup implementation. It exchanges the
 * code, asks whether a profile exists, and hands the person either to where
 * they were going or back to /auth to finish. Everything else is the profile
 * route's job.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const exchange = vi.fn();
let profileRow: { id: string } | null = null;
let profileError: unknown = null;
const adminCalls: { table: string; op: string; args: unknown[] }[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: exchange
    }
  })
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from(table: string) {
      const chain: any = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => unknown) =>
                resolve({ data: profileRow, error: profileError });
            }
            return (...args: unknown[]) => {
              adminCalls.push({ table, op: prop, args });
              return chain;
            };
          }
        }
      );
      return chain;
    }
  }
}));

const SOURCE = readFileSync(join(process.cwd(), 'src/app/auth/callback/route.ts'), 'utf8');

/**
 * What would actually run. The comment explaining WHY this route does not read
 * a configured app URL is worth keeping, and to a regex it is indistinguishable
 * from reading one.
 */
const CODE = SOURCE.split('\n')
  .filter(line => !/^\s*(\/\/|\/\*|\*)/.test(line))
  .join('\n');

function req(query: string, origin = 'https://stoop.house') {
  return new Request(`${origin}/auth/callback${query}`) as any;
}

async function where(res: any) {
  return res.headers.get('location') ?? '';
}

beforeEach(() => {
  exchange.mockReset();
  exchange.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  profileRow = null;
  profileError = null;
  adminCalls.length = 0;
});

describe('a provider that came back happy', () => {
  it('exchanges the code and sends an established member where they were going', async () => {
    profileRow = { id: 'user-1' };
    const { GET } = await import('./route');
    const res = await GET(req('?code=abc123&next=%2Fplan%2Fcoffee-ab12'));

    expect(exchange).toHaveBeenCalledWith('abc123');
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(await where(res)).toBe('https://stoop.house/plan/coffee-ab12');
  });

  it('defaults an established member to the feed', async () => {
    profileRow = { id: 'user-1' };
    const { GET } = await import('./route');
    expect(await where(await GET(req('?code=abc123')))).toBe('https://stoop.house/feed');
  });

  it('sends somebody with no profile yet back to /auth, straight to the profile step', async () => {
    profileRow = null;
    const { GET } = await import('./route');
    const location = await where(await GET(req('?code=abc123&next=post')));

    const url = new URL(location);
    expect(url.origin).toBe('https://stoop.house');
    expect(url.pathname).toBe('/auth');
    // The page must not ask a Google user for a phone number, so it is told
    // which step to open on rather than having to guess.
    expect(url.searchParams.get('step')).toBe('profile');
    expect(url.searchParams.get('next')).toBe('post');
  });

  it('looks the profile up by the id the exchange returned, not by anything in the URL', async () => {
    profileRow = { id: 'user-1' };
    const { GET } = await import('./route');
    await GET(req('?code=abc123&id=user-someone-else&user_id=user-other'));

    const filters = adminCalls.filter(c => c.op === 'eq').map(c => c.args);
    expect(filters).toEqual([['id', 'user-1']]);
    expect(JSON.stringify(adminCalls)).not.toMatch(/someone-else|user-other/);
  });

  it('never selects a private column while it is there', async () => {
    profileRow = { id: 'user-1' };
    const { GET } = await import('./route');
    await GET(req('?code=abc123'));
    for (const call of adminCalls.filter(c => c.op === 'select')) {
      expect(String(call.args[0])).not.toMatch(/phone_e164|notify_email|name/);
    }
  });
});

describe('the redirect cannot be aimed off the site', () => {
  const offsite = [
    'https://evil.example/steal',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '%2f%2fevil.example',
    'https://stoop.house.evil.example/feed'
  ];

  it('lands an established member on the feed instead of the attacker', async () => {
    profileRow = { id: 'user-1' };
    const { GET } = await import('./route');
    for (const next of offsite) {
      const location = await where(await GET(req(`?code=abc123&next=${encodeURIComponent(next)}`)));
      expect(new URL(location).origin, `${next} escaped`).toBe('https://stoop.house');
      expect(location).not.toMatch(/evil\.example/);
    }
  });

  it('does not smuggle the hostile value back through /auth either', async () => {
    profileRow = null;
    const { GET } = await import('./route');
    for (const next of offsite) {
      const location = await where(await GET(req(`?code=abc123&next=${encodeURIComponent(next)}`)));
      expect(location).not.toMatch(/evil\.example/);
      expect(new URL(location).searchParams.get('next')).toBeNull();
    }
  });

  it('redirects within the origin it was actually reached on, so a preview stays on the preview', async () => {
    // Reading a configured production URL here is how a preview tester ends up
    // authenticated against production.
    profileRow = { id: 'user-1' };
    const { GET } = await import('./route');
    const location = await where(
      await GET(req('?code=abc123', 'https://stoop-git-feature.vercel.app'))
    );
    expect(new URL(location).origin).toBe('https://stoop-git-feature.vercel.app');
    expect(CODE).not.toMatch(/NEXT_PUBLIC_APP_URL/);
  });
});

describe('every way it can fail', () => {
  it('handles somebody pressing Cancel on the provider screen', async () => {
    const { GET } = await import('./route');
    const location = await where(
      await GET(
        req('?error=access_denied&error_description=The+user+denied+the+request&error_code=1001')
      )
    );
    const url = new URL(location);
    expect(url.pathname).toBe('/auth');
    expect(url.searchParams.get('err')).toBe('denied');
    // Not one word of what the provider said.
    expect(location).not.toMatch(/denied\+the\+request|error_description|access_denied/);
    expect(exchange).not.toHaveBeenCalled();
  });

  it('handles arriving with no code at all', async () => {
    const { GET } = await import('./route');
    const url = new URL(await where(await GET(req(''))));
    expect(url.pathname).toBe('/auth');
    expect(url.searchParams.get('err')).toBe('missing');
    expect(exchange).not.toHaveBeenCalled();
  });

  it('handles an exchange the provider or Supabase rejects', async () => {
    exchange.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid request: both auth code and code verifier should be non-empty' }
    });
    const { GET } = await import('./route');
    const location = await where(await GET(req('?code=stale')));
    const url = new URL(location);
    expect(url.searchParams.get('err')).toBe('exchange');
    expect(location).not.toMatch(/code verifier|invalid request/);
  });

  it('handles the exchange throwing, which is what a network fault looks like', async () => {
    exchange.mockRejectedValue(new Error('fetch failed: ECONNREFUSED 10.0.0.1:443'));
    const { GET } = await import('./route');
    const location = await where(await GET(req('?code=abc123')));
    expect(new URL(location).searchParams.get('err')).toBe('server');
    expect(location).not.toMatch(/ECONNREFUSED|10\.0\.0\.1|fetch failed/);
  });

  it('does not guess when the profile lookup itself is broken', async () => {
    // Treating a failed read as "no profile" would march an existing member
    // through signup again and try to create a profile they already have.
    profileError = { code: '42501', message: 'permission denied for table profiles' };
    profileRow = null;
    const { GET } = await import('./route');
    const location = await where(await GET(req('?code=abc123')));
    const url = new URL(location);
    expect(url.searchParams.get('err')).toBe('server');
    expect(url.searchParams.get('step')).toBeNull();
    expect(location).not.toMatch(/permission denied|42501/);
  });

  it('keeps a failure on the same origin and carries the destination through', async () => {
    const { GET } = await import('./route');
    const url = new URL(await where(await GET(req('?error=access_denied&next=post'))));
    expect(url.origin).toBe('https://stoop.house');
    expect(url.searchParams.get('next')).toBe('post');
  });
});

describe('the source itself', () => {
  it('is a server route that is never cached or statically evaluated', () => {
    expect(SOURCE).toMatch(/export const dynamic = 'force-dynamic'/);
  });

  it('creates no profile of its own', () => {
    // One writer. The callback is a doorway, not a second signup path.
    expect(SOURCE).not.toMatch(/\.insert\(/);
    expect(SOURCE).not.toMatch(/create_profile_for_verified_identity/);
  });

  it('logs nothing that carries the code or the session', () => {
    const logged = [...SOURCE.matchAll(/console\.(log|error|warn)\(([^\n]*)/g)].map(m => m[2]);
    for (const line of logged) {
      expect(line).not.toMatch(/\bcode\b|session|access_token|user\.id/);
    }
  });
});
