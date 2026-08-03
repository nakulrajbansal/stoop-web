import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth, requireUser } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * The signed-in person's own profile, plus whether they still have an account
 * in good standing. The native app calls this on launch so a suspended user
 * fails closed (signed out) instead of finding out one action at a time.
 *
 * Reads through the admin client because blocked_at is not granted to the API
 * roles (migration 0003). Only safe fields are returned; phone_e164 and
 * notify_email never leave the server.
 *
 * A failed read is NOT an absent profile. Answering `needsProfile: true` when
 * the database is merely unreachable sent a fully signed-up member back into
 * the signup flow, so the two cases are now told apart and a read failure is a
 * 503 the client can retry.
 */
export async function GET(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const user = auth.user!;

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select(`
      id, name, about, initials, avatar_bg, avatar_fg, is_founding_member,
      city_id, neighborhood_id, blocked_at, created_at
    `)
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('me: profile read failed:', error);
    return NextResponse.json(
      { error: 'Stoop could not reach your profile just now.', code: 'profile_unavailable' },
      { status: 503 }
    );
  }

  if (!profile) {
    // Verified phone but no profile row yet: the app sends them to the
    // profile-completion step.
    return NextResponse.json({ profile: null, needsProfile: true });
  }

  if (profile.blocked_at) {
    return NextResponse.json({ error: 'Account suspended', code: 'account_suspended' }, { status: 403 });
  }

  const [cityResult, neighborhoodResult] = await Promise.all([
    supabaseAdmin.from('cities').select('id, slug, name').eq('id', profile.city_id).maybeSingle(),
    profile.neighborhood_id
      ? supabaseAdmin.from('neighborhoods').select('id, slug, name').eq('id', profile.neighborhood_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  return NextResponse.json({
    needsProfile: false,
    profile: {
      id: profile.id,
      name: profile.name,
      about: profile.about,
      initials: profile.initials,
      avatar_bg: profile.avatar_bg,
      avatar_fg: profile.avatar_fg,
      is_founding_member: profile.is_founding_member,
      city_id: profile.city_id,
      neighborhood_id: profile.neighborhood_id,
      created_at: profile.created_at,
      city: cityResult.data ?? null,
      neighborhood: neighborhoodResult.data ?? null
    }
  });
}
