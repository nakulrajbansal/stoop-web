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
import Nav from './Nav';

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
