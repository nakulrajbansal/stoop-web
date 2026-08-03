import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /api/me is what the native app calls on launch, so every answer it gives is
 * load-bearing. A row that is genuinely absent and a query that failed are
 * different answers, and the route was collapsing the second pair of them: the
 * city and neighborhood lookups were read for `data` only, so a database
 * failure came back as a 200 with `city: null` and the app showed a signed-up
 * member as having no neighborhood.
 */

const profileMaybeSingle = vi.fn();
const cityMaybeSingle = vi.fn();
const neighborhoodMaybeSingle = vi.fn();
const getRouteAuth = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle:
            table === 'profiles' ? profileMaybeSingle
            : table === 'cities' ? cityMaybeSingle
            : neighborhoodMaybeSingle
        })
      })
    })
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

const PROFILE = {
  id: 'user-1',
  name: 'Maya',
  about: null,
  initials: 'M',
  avatar_bg: '#fff',
  avatar_fg: '#000',
  is_founding_member: false,
  city_id: 'city-1',
  neighborhood_id: 'hood-1',
  blocked_at: null,
  created_at: '2026-01-01T00:00:00Z'
};

async function get() {
  const { GET } = await import('./route');
  return GET(new Request('https://www.stoop.house/api/me') as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getRouteAuth.mockResolvedValue({ user: { id: 'user-1' }, supabase: {}, via: 'bearer' });
  profileMaybeSingle.mockResolvedValue({ data: PROFILE, error: null });
  cityMaybeSingle.mockResolvedValue({ data: { id: 'city-1', slug: 'nyc', name: 'New York' }, error: null });
  neighborhoodMaybeSingle.mockResolvedValue({ data: { id: 'hood-1', slug: 'bk', name: 'Brooklyn' }, error: null });
});

describe('GET /api/me', () => {
  it('returns the profile with its city and neighborhood', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.needsProfile).toBe(false);
    expect(body.profile.city).toMatchObject({ slug: 'nyc' });
    expect(body.profile.neighborhood).toMatchObject({ slug: 'bk' });
  });

  it('never returns the private columns', async () => {
    const body = await (await get()).json();
    expect(JSON.stringify(body)).not.toContain('phone_e164');
    expect(JSON.stringify(body)).not.toContain('notify_email');
    expect(body.profile).not.toHaveProperty('blocked_at');
  });

  it('answers 503 when the city lookup fails, not 200 with no location', async () => {
    cityMaybeSingle.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    const response = await get();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'profile_unavailable' });
  });

  it('answers 503 when the neighborhood lookup fails', async () => {
    neighborhoodMaybeSingle.mockResolvedValue({ data: null, error: { message: 'timeout' } });

    expect((await get()).status).toBe(503);
  });

  it('still answers 200 for a member who genuinely has no neighborhood', async () => {
    profileMaybeSingle.mockResolvedValue({ data: { ...PROFILE, neighborhood_id: null }, error: null });

    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ profile: { neighborhood: null } });
  });

  it('still tells apart an absent profile from a failed read', async () => {
    profileMaybeSingle.mockResolvedValue({ data: null, error: null });
    await expect((await get()).json()).resolves.toMatchObject({ needsProfile: true });

    profileMaybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect((await get()).status).toBe(503);
  });

  it('fails closed on a suspension before it looks anything else up', async () => {
    profileMaybeSingle.mockResolvedValue({ data: { ...PROFILE, blocked_at: '2026-01-02T00:00:00Z' }, error: null });

    const response = await get();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'account_suspended' });
    expect(cityMaybeSingle).not.toHaveBeenCalled();
  });
});
