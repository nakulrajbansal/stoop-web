/**
 * Making an account, on the server.
 *
 * Until this release the browser inserted its own profiles row: it chose the
 * id, the phone number, the timestamp that claimed the phone was verified, and
 * the address every notification would go to. That was survivable while phone
 * verification was the only door, because the row still had to satisfy an RLS
 * policy pinned to auth.uid(). It stops being survivable the moment a Google
 * session exists, because there is no longer a verified phone in the row to
 * anchor anything to.
 *
 * So creation moves here, and this route is deliberately thin. It proves who is
 * asking, bounds what they sent, and hands it to a service-role function that
 * goes and asks auth.users and auth.identities what actually happened. The
 * route never decides that an identity is verified. It cannot: it only sees
 * what the browser typed.
 *
 * The rule that shapes every test below: there is no actor id in the request
 * contract, and there is no provider claim the database will take at face
 * value.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rpc = vi.fn();
const sendWelcome = vi.fn();
let currentUser: { id: string; email?: string | null } | null = { id: 'user-me' };

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) }
  })
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => {
      throw new Error('creation must go through the function, not a table write');
    }
  }
}));

vi.mock('@/lib/resend', () => ({
  sendWelcome: (...args: unknown[]) => sendWelcome(...args)
}));

const SOURCE = readFileSync(join(process.cwd(), 'src/app/api/profile/route.ts'), 'utf8');

const CREATED = {
  id: 'user-me',
  display_name: 'Ada',
  name: 'Ada Lovelace',
  initials: 'AL',
  notify_email: 'ada@example.test',
  created: true
};

function post(body: unknown) {
  return new Request('http://localhost/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  }) as any;
}

const phoneSignup = (over: Record<string, unknown> = {}) => ({
  provider: 'phone',
  name: 'Ada Lovelace',
  city: 'nyc',
  neighborhood: 'williamsburg',
  about: 'runs slow',
  email: 'ada@example.test',
  phone: '+15550001001',
  ...over
});

const socialSignup = (over: Record<string, unknown> = {}) => ({
  provider: 'google',
  name: 'Ada Lovelace',
  city: 'nyc',
  neighborhood: 'williamsburg',
  about: 'runs slow',
  ...over
});

const args = () => (rpc.mock.calls[0]?.[1] ?? {}) as Record<string, unknown>;

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: CREATED, error: null });
  sendWelcome.mockReset();
  sendWelcome.mockResolvedValue(undefined);
  currentUser = { id: 'user-me' };
});

describe('who is asking', () => {
  it('refuses an anonymous caller and creates nothing', async () => {
    currentUser = null;
    const { POST } = await import('./route');
    const res = await POST(post(phoneSignup()));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(sendWelcome).not.toHaveBeenCalled();
  });

  it('takes the actor from the session and ignores every id in the body', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      post(
        phoneSignup({
          id: 'user-someone-else',
          user_id: 'user-other',
          actor: 'user-third',
          p_actor: 'user-fourth'
        })
      )
    );

    expect(res.status).toBe(200);
    const passed = JSON.stringify(args());
    expect(passed).toMatch(/user-me/);
    expect(passed).not.toMatch(/someone-else|user-other|user-third|user-fourth/);
  });

  it('goes through the service-only function, never a table insert', async () => {
    const { POST } = await import('./route');
    await POST(post(phoneSignup()));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('create_profile_for_verified_identity');
  });
});

describe('what the browser is allowed to assert', () => {
  it('never sends a verification timestamp, because the database reads that from auth', async () => {
    const { POST } = await import('./route');
    await POST(post(phoneSignup({ phone_verified_at: '2020-01-01T00:00:00.000Z' })));
    const passed = JSON.stringify(args());
    expect(passed).not.toMatch(/phone_verified_at|2020-01-01/);
    expect(SOURCE).not.toMatch(/phone_verified_at/);
  });

  it('never lets a Google or Apple signup choose the address its mail goes to', async () => {
    const { POST } = await import('./route');
    await POST(post(socialSignup({ email: 'attacker@example.test' })));
    // The provider email is the only one the database will use for a social
    // identity, and the route does not even carry a competing one to it.
    expect(JSON.stringify(args())).not.toMatch(/attacker@example\.test/);
  });

  it('still carries the typed notification email for a phone signup, since there is no other source', async () => {
    const { POST } = await import('./route');
    await POST(post(phoneSignup({ email: '  Ada@Example.TEST ' })));
    expect(JSON.stringify(args())).toMatch(/ada@example\.test/);
  });

  it('passes the claimed provider for the database to check, and only a known one', async () => {
    const { POST } = await import('./route');
    for (const provider of ['phone', 'google', 'apple']) {
      rpc.mockClear();
      await POST(post({ ...socialSignup(), provider, email: 'ada@example.test', phone: '+15550001001' }));
      expect(JSON.stringify(args())).toMatch(new RegExp(provider));
    }

    for (const provider of ['email', 'facebook', 'PHONE', '', null, 42, 'google; --']) {
      rpc.mockClear();
      const res = await POST(post(socialSignup({ provider })));
      expect(res.status, `provider ${String(provider)} must be refused`).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it('refuses to let the body name a column of its own choosing', async () => {
    const { POST } = await import('./route');
    await POST(
      post(
        phoneSignup({
          is_founding_member: true,
          blocked_at: null,
          display_name: 'Ada Lovelace',
          avatar_bg: '#000'
        })
      )
    );
    const passed = JSON.stringify(args());
    expect(passed).not.toMatch(/founding|blocked_at|display_name|avatar_bg/);
  });
});

describe('what it bounds before the database sees it', () => {
  const bad = async (body: unknown, pattern: RegExp) => {
    rpc.mockClear();
    const { POST } = await import('./route');
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(pattern);
    expect(rpc).not.toHaveBeenCalled();
  };

  it('refuses an empty or absurd name', async () => {
    for (const name of ['', '   ', String.fromCharCode(0x3000), null, 42]) {
      await bad(phoneSignup({ name }), /name/i);
    }
    await bad(phoneSignup({ name: 'A'.repeat(51) }), /name/i);
  });

  it('normalizes the name it does accept', async () => {
    const { POST } = await import('./route');
    const nbsp = String.fromCharCode(0xa0);
    await POST(post(phoneSignup({ name: `  Ada${nbsp}${nbsp}Lovelace  ` })));
    expect(args().p_name).toBe('Ada Lovelace');
  });

  it('refuses a missing or malformed notification email from a phone signup', async () => {
    for (const email of ['', 'not-an-email', 'a@b', 'a b@example.test', null, `${'a'.repeat(250)}@example.test`]) {
      await bad(phoneSignup({ email }), /email/i);
    }
  });

  it('refuses a missing city or neighborhood', async () => {
    await bad(phoneSignup({ city: '' }), /neighborhood|city/i);
    await bad(phoneSignup({ neighborhood: '' }), /neighborhood|city/i);
    await bad(phoneSignup({ city: 42, neighborhood: [] }), /neighborhood|city/i);
  });

  it('bounds the one line about you rather than refusing it', async () => {
    const { POST } = await import('./route');
    await POST(post(phoneSignup({ about: 'x'.repeat(500) })));
    expect(String(args().p_about ?? '').length).toBeLessThanOrEqual(140);
  });

  it('fails closed on a body that is not JSON at all', async () => {
    await bad('not json', /request|read/i);
  });
});

describe('what it says when it cannot', () => {
  it('answers a database failure with fixed copy and no internals', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function public.create_profile_for_verified_identity does not exist' }
    });
    const { POST } = await import('./route');
    const res = await POST(post(phoneSignup()));

    expect(res.status).toBe(503);
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/42883|does not exist|create_profile_for_verified_identity|public\./);
    expect(body).toMatch(/could not/i);
  });

  it('tells somebody whose number is already on Stoop to sign in, not that a constraint fired', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "profiles_phone_e164_key"'
      }
    });
    const { POST } = await import('./route');
    const res = await POST(post(phoneSignup()));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already/i);
    expect(body.error).toMatch(/sign in/i);
    expect(JSON.stringify(body)).not.toMatch(/23505|constraint|profiles_phone_e164_key/);
  });

  it('tells somebody whose identity did not check out to try another way in', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'no verified google identity for actor 1234' }
    });
    const { POST } = await import('./route');
    const res = await POST(post(socialSignup()));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/verify|again|phone/i);
    expect(JSON.stringify(body)).not.toMatch(/42501|actor 1234|identity for actor/);
  });

  it('never caches any of it', async () => {
    const { POST } = await import('./route');
    const res = await POST(post(phoneSignup()));
    expect(res.headers.get('Cache-Control')).toMatch(/private/);
    expect(res.headers.get('Cache-Control')).toMatch(/no-store/);
  });

  it('returns the public identity the database generated, and nothing private', async () => {
    const { POST } = await import('./route');
    const res = await POST(post(phoneSignup()));
    const body = JSON.stringify(await res.json());
    expect(body).toMatch(/Ada/);
    expect(body).not.toMatch(/notify_email|phone_e164|ada@example\.test|\+1555/);
  });
});

describe('the welcome email', () => {
  it('goes to the address the database stored, never one the browser named', async () => {
    rpc.mockResolvedValue({
      data: { ...CREATED, notify_email: 'stored@example.test', name: 'Ada Lovelace' },
      error: null
    });
    const { POST } = await import('./route');
    await POST(post(phoneSignup({ email: 'ada@example.test' })));

    expect(sendWelcome).toHaveBeenCalledTimes(1);
    expect(sendWelcome.mock.calls[0][0]).toBe('stored@example.test');
    expect(sendWelcome.mock.calls[0][1]).toBe('Ada Lovelace');
  });

  it('is not sent again when the same person submits twice', async () => {
    // The function is idempotent, so the second submit returns the existing row
    // and says it created nothing. A second welcome would be the visible half of
    // a double write.
    rpc.mockResolvedValue({ data: { ...CREATED, created: false }, error: null });
    const { POST } = await import('./route');
    const res = await POST(post(phoneSignup()));

    expect(res.status).toBe(200);
    expect(sendWelcome).not.toHaveBeenCalled();
  });

  it('is not sent when creation failed', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'no' } });
    const { POST } = await import('./route');
    await POST(post(phoneSignup()));
    expect(sendWelcome).not.toHaveBeenCalled();
  });

  it('does not fail the signup when the mailer is down', async () => {
    sendWelcome.mockRejectedValue(new Error('resend 503'));
    const { POST } = await import('./route');
    const res = await POST(post(phoneSignup()));
    expect(res.status).toBe(200);
  });
});

describe('the source itself', () => {
  it('never inserts into profiles from anywhere in the app', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap(entry => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });

    const offenders = walk(join(process.cwd(), 'src'))
      .filter(f => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter(f => /from\(\s*'profiles'\s*\)[\s\S]{0,120}\.insert\(/.test(readFileSync(f, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('carries no actor id in its request contract', () => {
    const post = SOURCE.slice(SOURCE.indexOf('export async function POST'));
    expect(post).not.toMatch(/body\??\.(id|user_id|actor)/);
    expect(post).toMatch(/user\.id/);
  });
});
