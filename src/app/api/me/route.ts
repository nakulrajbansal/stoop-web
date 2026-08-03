import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * The signed-in person's own profile, plus whether they still have an account
 * in good standing. The native app calls this on launch so a suspended user
 * fails closed (signed out) instead of finding out one action at a time.
 *
 * Reads through the admin client because blocked_at is not granted to the API
 * roles (migration 0003). Only safe fields are returned; phone_e164 and
 * notify_email never leave the server.
 */
export async function GET(req: NextRequest) {
  const { user } = await getRouteAuth(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select(`
      id, name, about, initials, avatar_bg, avatar_fg, is_founding_member,
      city_id, neighborhood_id, blocked_at, created_at
    `)
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    // Verified phone but no profile row yet: the app sends them to the
    // profile-completion step.
    return NextResponse.json({ profile: null, needsProfile: true });
  }

  if ((profile as any).blocked_at) {
    return NextResponse.json({ error: 'Account suspended', code: 'account_suspended' }, { status: 403 });
  }

  const [{ data: city }, { data: neighborhood }] = await Promise.all([
    supabaseAdmin.from('cities').select('id, slug, name').eq('id', (profile as any).city_id).maybeSingle(),
    (profile as any).neighborhood_id
      ? supabaseAdmin.from('neighborhoods').select('id, slug, name').eq('id', (profile as any).neighborhood_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const p = profile as any;
  return NextResponse.json({
    needsProfile: false,
    profile: {
      id: p.id,
      name: p.name,
      about: p.about,
      initials: p.initials,
      avatar_bg: p.avatar_bg,
      avatar_fg: p.avatar_fg,
      is_founding_member: p.is_founding_member,
      city_id: p.city_id,
      neighborhood_id: p.neighborhood_id,
      created_at: p.created_at,
      city: city ?? null,
      neighborhood: neighborhood ?? null
    }
  });
}
