/**
 * @vitest-environment jsdom
 *
 * Nav is the surface that tells a signed-in person they are signed in. It read
 * profiles.name, which the postdeploy hardening migration revokes from the
 * authenticated role: the row came back with an error, the component kept its
 * null profile, and the header rendered "Sign in" to somebody who was already
 * signed in. Worse when it half worked, because then the avatar identified the
 * wrong person to nobody's benefit.
 *
 * These tests run the component against a client that behaves the way PostgREST
 * behaves after the migration: display_name is readable, name is denied.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Nav from './Nav';

const SOURCE = readFileSync(join(process.cwd(), 'src', 'components', 'Nav.tsx'), 'utf8');

const selects: string[] = [];
let user: { id: string } | null = { id: 'user-me' };

/** Postgres after the contract migration: name is denied to this role. */
function contractStateRow(select: string) {
  if (/(^|[\s,(])name([\s,)]|$)/.test(select)) {
    return { data: null, error: { code: '42501', message: 'permission denied for column name' } };
  }
  return {
    data: {
      id: 'user-me',
      name: 'Ada',
      initials: 'AL',
      avatar_bg: '#eee',
      avatar_fg: '#333'
    },
    error: null
  };
}

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
    },
    from: () => {
      const state = { select: '' };
      const chain: any = {
        select: (arg: string) => {
          state.select = arg;
          selects.push(arg);
          return chain;
        },
        eq: () => chain,
        single: async () => contractStateRow(state.select)
      };
      return chain;
    }
  })
}));

beforeEach(() => {
  selects.length = 0;
  user = { id: 'user-me' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 0 }) }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Nav in the contract state', () => {
  it('asks for the projection and never for the full name', async () => {
    render(<Nav />);
    await waitFor(() => expect(selects.length).toBeGreaterThan(0));

    expect(selects[0]).toMatch(/name:display_name/);
    // A bare `name` in the select list is the whole bug.
    const fields = selects[0].split(',').map(f => f.trim());
    expect(fields).not.toContain('name');
  });

  it('still shows the signed-in header rather than falling back to Sign in', async () => {
    render(<Nav />);
    await screen.findByRole('link', { name: /post a plan/i });
    expect(screen.queryByRole('link', { name: /^sign in$/i })).toBeNull();
    expect(screen.getByRole('link', { name: /your profile/i })).toBeDefined();
  });

  it('shows the signed-out header when there is genuinely no session', async () => {
    user = null;
    render(<Nav />);
    expect(await screen.findByRole('link', { name: /^sign in$/i })).toBeDefined();
    expect(selects).toEqual([]);
  });
});

/**
 * What a signed-out visitor is offered at the top of the page.
 *
 * The header said Browse and Sign in, and nothing else, on the one page whose
 * whole argument is "post a plan". Somebody who has decided to post had to
 * guess that Sign in was also the way to make an account, and somebody who
 * wanted an account without a draft had no button at all.
 *
 * Four ways in now, and the hrefs are the point of these tests rather than the
 * wording: /post keeps the composer's own gate in the loop, which is what parks
 * a half-written draft before sending anyone to verify a number.
 */
describe('the signed-out header offers a way in', () => {
  beforeEach(() => {
    user = null;
  });

  it('names all four, each pointing somewhere safe', async () => {
    render(<Nav />);

    const browse = await screen.findByRole('link', { name: /^browse$/i });
    expect(browse.getAttribute('href')).toBe('/feed');

    // /post, never straight to /auth. The composer saves the draft and sends an
    // unsigned visitor to /auth?next=post itself, so a plan typed before
    // signing up survives the detour.
    const post = screen.getByRole('link', { name: /^post a plan$/i });
    expect(post.getAttribute('href')).toBe('/post');

    const signUp = screen.getByRole('link', { name: /^sign up$/i });
    expect(signUp.getAttribute('href')).toBe('/auth?mode=signup');

    const signIn = screen.getByRole('link', { name: /^sign in$/i });
    expect(signIn.getAttribute('href')).toBe('/auth?mode=signin');
  });

  it('reads as words, not as a mark somebody has to decode', async () => {
    render(<Nav />);
    const post = await screen.findByRole('link', { name: /^post a plan$/i });
    // The signed-in header may shrink this to a "+" because that person has
    // already been told what it does. A visitor who has never posted has not.
    expect(post.textContent?.replace(/\s+/g, '')).toMatch(/[A-Za-z]/);
    expect(post.textContent?.trim()).not.toBe('+');
  });

  it('asks the database for nothing at all', async () => {
    render(<Nav />);
    await screen.findByRole('link', { name: /^sign up$/i });
    expect(selects).toEqual([]);
  });
});

/**
 * The same header on a 320px phone, which is where it can go wrong.
 *
 * Four actions plus a wordmark do not fit across 320px, and the two ways that
 * usually get papered over are both worse than choosing: a bar that scrolls
 * sideways hides whatever is off the right edge with no way to know it is
 * there, and a bar that wraps grows past the fixed 58px height and gets
 * clipped. So one action steps out of the top row on a phone, and it is the one
 * an existing user needs least urgently, because the auth screen itself carries
 * the way back for them.
 */
describe('the signed-out header at 320px', () => {
  const signedOut = SOURCE.slice(SOURCE.indexOf(') : ('), SOURCE.lastIndexOf('</nav>'));

  function linkWith(fragment: string): string {
    const links = [...signedOut.matchAll(/<Link[\s\S]*?>/g)].map(m => m[0]);
    const found = links.find(link => link.includes(fragment));
    expect(found, `no signed-out link for ${fragment}`).toBeDefined();
    return found!;
  }

  it('never becomes a strip you have to scroll sideways', () => {
    expect(SOURCE).not.toMatch(/overflow-x|overflow-auto|overflow-scroll|snap-x/);
  });

  it('stays on one row, because the bar has a fixed height to be clipped against', () => {
    expect(SOURCE).toMatch(/h-\[58px\]/);
    expect(SOURCE).not.toMatch(/flex-wrap/);
  });

  it('keeps both conversion actions on the phone, and only steps Sign in out', () => {
    expect(linkWith('href="/post"')).not.toMatch(/\bhidden\b/);
    expect(linkWith('mode=signup')).not.toMatch(/\bhidden\b/);
    expect(linkWith('href="/feed"')).not.toMatch(/\bhidden\b/);
    // The one that is allowed to go, and it has to say so rather than vanish
    // at every width.
    expect(linkWith('mode=signin')).toMatch(/hidden sm:/);
  });

  it('spends less gutter and less gap on a phone than it does on a desktop', () => {
    const bar = SOURCE.match(/<nav[^>]*className="([^"]*)"/);
    expect(bar, 'the nav element is no longer findable').not.toBeNull();
    expect(bar![1]).toMatch(/\bpx-[\d.]+ sm:px-[\d.]+/);
    expect(bar![1]).toMatch(/\bgap-[\d.]+ sm:gap-[\d.]+/);
  });

  it('gives every signed-out action a tap target worth aiming at', () => {
    // .btn-sm is 30px tall, which is a fine mouse target and a poor thumb one.
    for (const fragment of ['href="/feed"', 'href="/post"', 'mode=signup', 'mode=signin']) {
      expect(linkWith(fragment), fragment).toMatch(/min-h-\[4[0-9]px\]/);
    }
  });
});
