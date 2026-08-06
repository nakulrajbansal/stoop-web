import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getBlockedIdsResult } from '@/lib/blocks';
import {
  authorizeRoster,
  buildRoster,
  confirmedJoinerIds,
  ROSTER_VISIBILITY_NOTE,
  type RosterProfile
} from '@/lib/participants';

/**
 * The private confirmed roster for one plan.
 *
 * Only the host and the people they confirmed get an answer. Everyone else,
 * including someone whose request is still pending, gets a status code and no
 * roster at all. Nothing here is ever server-rendered into the public plan
 * page: the plan page fetches it after sign in, so an unauthorized viewer's
 * HTML cannot contain a name they are not allowed to see.
 *
 * The plan is addressed by its internal id rather than its slug, and only
 * after authorization, so this route never doubles as a slug-to-id oracle.
 *
 * auth.uid() is not reliable in this app's server routes, so the user is
 * verified here and the reads are done with the admin client.
 */
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DENIED = {
  401: 'Sign in to see who is coming.',
  403: 'Only the host and confirmed participants can see who is coming.',
  404: 'Plan not found.',
  503: 'Could not check who is coming right now. Try again in a moment.'
} as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: DENIED[401] }, { status: 401 });

  if (!UUID.test(id)) return NextResponse.json({ error: DENIED[404] }, { status: 404 });

  const { data: planRow } = await supabaseAdmin
    .from('plans')
    .select('id, user_id, status')
    .eq('id', id)
    .maybeSingle();
  const plan = planRow as { id: string; user_id: string; status: string } | null;
  if (!plan) return NextResponse.json({ error: DENIED[404] }, { status: 404 });

  const { data: convRows } = await supabaseAdmin
    .from('conversations')
    .select('joiner_id, status')
    .eq('plan_id', plan.id);
  const conversations = (convRows ?? []) as { joiner_id: string; status: string }[];

  // Cast for the same reason the other routes do: @supabase/ssr's client type
  // and supabase-js's SupabaseClient do not line up in this version pair.
  //
  // Strict lookup: an unanswerable block query must not be read as "nobody is
  // blocked" on the one endpoint that hands out names.
  const blocks = await getBlockedIdsResult(supabase as any, user.id);
  if (!blocks.ok) {
    console.error('roster block lookup failed, denying:', blocks.error);
    return NextResponse.json({ error: DENIED[503] }, { status: 503 });
  }
  const blockedIds = blocks.ids;

  const decision = authorizeRoster({ viewerId: user.id, plan, conversations, blockedIds });
  if (!decision.ok) {
    return NextResponse.json({ error: DENIED[decision.status] }, { status: decision.status });
  }

  const wanted = [plan.user_id, ...confirmedJoinerIds(conversations)];
  const { data: profileRows } = await supabaseAdmin
    .from('profiles')
    .select('id, name, about, neighborhood_id')
    .in('id', wanted);
  const profiles = (profileRows ?? []) as {
    id: string; name: string; about: string | null; neighborhood_id: string | null;
  }[];

  const hoodIds = [...new Set(profiles.map(p => p.neighborhood_id).filter(Boolean))] as string[];
  const hoodNames = new Map<string, string>();
  if (hoodIds.length > 0) {
    const { data: hoodRows } = await supabaseAdmin
      .from('neighborhoods')
      .select('id, name')
      .in('id', hoodIds);
    for (const hood of (hoodRows ?? []) as { id: string; name: string }[]) {
      hoodNames.set(hood.id, hood.name);
    }
  }

  const toRosterProfile = (id: string): RosterProfile => {
    const profile = profiles.find(p => p.id === id);
    return {
      id,
      name: profile?.name ?? null,
      about: profile?.about ?? null,
      neighborhood: profile?.neighborhood_id ? hoodNames.get(profile.neighborhood_id) ?? null : null
    };
  };

  const roster = buildRoster({
    viewerId: user.id,
    host: toRosterProfile(plan.user_id),
    confirmed: confirmedJoinerIds(conversations).map(toRosterProfile),
    blockedIds
  });

  return NextResponse.json(
    { roster, note: ROSTER_VISIBILITY_NOTE, viewerRole: decision.role },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
