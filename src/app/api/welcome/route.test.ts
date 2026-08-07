/**
 * The welcome email cannot be aimed.
 *
 * This route took an address and a name out of the request body. Any signed-in
 * person could therefore send a Stoop-branded welcome to any address, under any
 * name, from our verified sending domain. The browser call is gone (POST
 * /api/profile sends the welcome itself now), but a route that still accepts a
 * recipient is still the hole, so the contract is what these tests are about:
 * there is nothing in the request to abuse.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sendWelcome = vi.fn();
let currentUser: { id: string } | null = { id: 'user-me' };
let profile: { name: string; notify_email: string | null } | null = {
  name: 'Ada Lovelace',
  notify_email: 'stored@example.test'
};
let readError: unknown = null;
const eqArgs: unknown[][] = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) }
  })
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => {
      const chain: any = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => unknown) => resolve({ data: profile, error: readError });
            }
            return (...args: unknown[]) => {
              if (prop === 'eq') eqArgs.push(args);
              return chain;
            };
          }
        }
      );
      return chain;
    }
  }
}));

vi.mock('@/lib/resend', () => ({ sendWelcome: (...a: unknown[]) => sendWelcome(...a) }));

const SOURCE = readFileSync(join(process.cwd(), 'src/app/api/welcome/route.ts'), 'utf8');

const post = (body?: unknown) =>
  new Request('http://localhost/api/welcome', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }) as any;

beforeEach(() => {
  sendWelcome.mockReset();
  sendWelcome.mockResolvedValue(undefined);
  currentUser = { id: 'user-me' };
  profile = { name: 'Ada Lovelace', notify_email: 'stored@example.test' };
  readError = null;
  eqArgs.length = 0;
});

describe('POST /api/welcome', () => {
  it('refuses an anonymous caller and sends nothing', async () => {
    currentUser = null;
    const { POST } = await import('./route');
    expect((await POST(post())).status).toBe(401);
    expect(sendWelcome).not.toHaveBeenCalled();
  });

  it('mails the caller their own stored address, whatever the body says', async () => {
    const { POST } = await import('./route');
    const res = await POST(post({ email: 'attacker@example.test', name: 'Stoop Security Team' }));

    expect(res.status).toBe(200);
    expect(sendWelcome).toHaveBeenCalledTimes(1);
    expect(sendWelcome.mock.calls[0][0]).toBe('stored@example.test');
    expect(sendWelcome.mock.calls[0][1]).toBe('Ada Lovelace');
  });

  it('looks it up by the session id and nothing else', async () => {
    const { POST } = await import('./route');
    await POST(post({ id: 'user-someone-else' }));
    expect(eqArgs).toEqual([['id', 'user-me']]);
  });

  it('does not fall over on a body that is not JSON, because it never reads one', async () => {
    const { POST } = await import('./route');
    const bad = new Request('http://localhost/api/welcome', { method: 'POST', body: 'not json' }) as any;
    expect((await POST(bad)).status).toBe(200);
  });

  it('says nothing useful when there is no address to send to', async () => {
    profile = { name: 'Ada Lovelace', notify_email: null };
    const { POST } = await import('./route');
    const res = await POST(post());
    expect(res.status).toBe(404);
    expect(sendWelcome).not.toHaveBeenCalled();
  });

  it('fails closed with fixed copy when the mailer is down', async () => {
    sendWelcome.mockRejectedValue(new Error('resend 503: rate limited for domain stoop.house'));
    const { POST } = await import('./route');
    const res = await POST(post());
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/resend|rate limited|stoop\.house/);
  });

  it('is never cached', async () => {
    const { POST } = await import('./route');
    const res = await POST(post());
    expect(res.headers.get('Cache-Control')).toMatch(/private/);
    expect(res.headers.get('Cache-Control')).toMatch(/no-store/);
  });

  it('has no request contract left at all', () => {
    // Code only. The comment explaining that the body is deliberately not read
    // is the documentation of this rule, and to a regex it looks like breaking
    // it.
    const code = SOURCE.split('\n')
      .filter(line => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .join('\n');
    expect(code).not.toMatch(/req\.json\(\)/);
    expect(code).not.toMatch(/body/);
    expect(code).not.toMatch(/searchParams/);
  });
});
