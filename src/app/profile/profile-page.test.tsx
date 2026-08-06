/**
 * @vitest-environment jsdom
 *
 * The profile editor is the one screen that legitimately shows you your own
 * private full name. It used to get it by selecting profiles.name from the
 * browser, which the postdeploy hardening migration denies. The row came back
 * null and the page read that as "no profile" and pushed the user to /auth: a
 * signed-in person, told to sign in, on every visit.
 *
 * It now asks the server, which holds the service role. What these tests hold is
 * the two halves of that: it never selects the private column from the browser,
 * and a failure that is not a missing session never turns into a redirect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import ProfilePage from './page';

const pushed: string[] = [];
const profileSelects: string[] = [];
let session: { id: string } | null = { id: 'user-me' };
/** What GET /api/profile answers for a signed-in member with a finished profile. */
const OK_PROFILE = {
  status: 200,
  body: {
    profile: {
      id: 'user-me',
      name: 'Ada Lovelace',
      displayName: 'Ada',
      about: 'runs slow',
      city_id: 'city-1',
      neighborhood_id: 'hood-1',
      initials: 'AL',
      avatar_bg: '#eee',
      avatar_fg: '#333',
      is_founding_member: false,
      city: { slug: 'nyc', name: 'New York City' },
      neighborhood: { slug: 'williamsburg', name: 'Williamsburg' }
    }
  }
};
let getProfile: { status: number; body: any } = OK_PROFILE;
const patched: any[] = [];
let patchResponse: { status: number; body: any } = {
  status: 200,
  body: { ok: true, profile: { name: 'Ada Lovelace', displayName: 'Ada', initials: 'AL' } }
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (to: string) => pushed.push(to) })
}));
vi.mock('@/components/Nav', () => ({ default: () => <nav /> }));
vi.mock('@/components/PageMain', () => ({ default: ({ children }: any) => <main>{children}</main> }));
vi.mock('@/lib/avatar-image', () => ({ toAvatarJpeg: async (f: any) => f }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: session } }),
      signOut: async () => {}
    },
    from: (table: string) => {
      const chain: any = {
        select: (arg: string) => {
          if (table === 'profiles') profileSelects.push(arg);
          return chain;
        },
        eq: () => chain,
        single: async () => ({ data: table === 'cities' ? { id: 'city-1' } : { id: 'hood-1' } }),
        then: (resolve: (v: any) => unknown) =>
          resolve({ data: [{ slug: 'williamsburg', name: 'Williamsburg' }] })
      };
      return chain;
    }
  })
}));

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/profile') && init?.method === 'PATCH') {
        patched.push(JSON.parse(String(init.body)));
        return {
          ok: patchResponse.status < 400,
          status: patchResponse.status,
          json: async () => patchResponse.body
        };
      }
      if (String(url).startsWith('/api/profile')) {
        return {
          ok: getProfile.status < 400,
          status: getProfile.status,
          json: async () => getProfile.body
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    })
  );
}

beforeEach(() => {
  pushed.length = 0;
  profileSelects.length = 0;
  patched.length = 0;
  session = { id: 'user-me' };
  // The whole object, not a spread of the last one: a test that answered 503
  // with an error body would otherwise leave that body behind at status 200,
  // and every test after it would be exercising a response no server sends.
  getProfile = OK_PROFILE;
  patchResponse = {
    status: 200,
    body: { ok: true, profile: { name: 'Ada Lovelace', displayName: 'Ada', initials: 'AL' } }
  };
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('loading the editor in the contract state', () => {
  it('shows the private full name without selecting it from the browser', async () => {
    render(<ProfilePage />);
    await screen.findByDisplayValue('Ada Lovelace');

    // Nothing asked PostgREST for profiles.name with the user's own session.
    for (const select of profileSelects) {
      expect(select.split(',').map(f => f.trim())).not.toContain('name');
    }
    expect(profileSelects).toEqual([]);
    expect(pushed).toEqual([]);
  });

  it('sends nobody to /auth because a column was denied', async () => {
    getProfile = { status: 503, body: { error: 'Could not load your profile right now. Try again in a moment.' } };
    render(<ProfilePage />);

    await screen.findByText(/could not load your profile/i);
    expect(pushed).toEqual([]);
  });

  it('does send you to /auth when the session really is gone', async () => {
    session = null;
    render(<ProfilePage />);
    await waitFor(() => expect(pushed).toEqual(['/auth']));
  });

  it('sends you to /auth when the server says the session is gone', async () => {
    getProfile = { status: 401, body: { error: 'Sign in to see your profile.' } };
    render(<ProfilePage />);
    await waitFor(() => expect(pushed).toEqual(['/auth']));
  });
});

describe('saving a new full name', () => {
  it('goes through the server, which owns the projection', async () => {
    render(<ProfilePage />);
    const input = await screen.findByDisplayValue('Ada Lovelace');

    fireEvent.change(input, { target: { value: '  Grace   Hopper ' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(patched).toHaveLength(1));
    expect(patched[0]).toMatchObject({ name: '  Grace   Hopper ', neighborhood: 'williamsburg' });
    // The client does not compute initials or a display name any more.
    expect(patched[0]).not.toHaveProperty('initials');
    expect(patched[0]).not.toHaveProperty('display_name');
  });

  it('shows the name the server stored, not the one that was typed', async () => {
    patchResponse = {
      status: 200,
      body: { ok: true, profile: { name: 'Grace Hopper', displayName: 'Grace', initials: 'GH' } }
    };
    render(<ProfilePage />);
    const input = await screen.findByDisplayValue('Ada Lovelace');

    fireEvent.change(input, { target: { value: '  Grace   Hopper ' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await screen.findByText('Profile saved');
    await screen.findByDisplayValue('Grace Hopper');
  });

  it('says so when the save fails, and changes nothing on screen', async () => {
    patchResponse = { status: 503, body: { error: 'Could not save your profile right now. Try again in a moment.' } };
    render(<ProfilePage />);
    const input = await screen.findByDisplayValue('Ada Lovelace');

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await screen.findByText(/could not save/i);
    expect(pushed).toEqual([]);
  });
});
