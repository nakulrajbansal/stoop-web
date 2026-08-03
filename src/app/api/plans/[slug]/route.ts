import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth, unauthorized } from '@/lib/supabase/route';
import { blockLookupUnavailable, BlockLookupError, getBlockedIds } from '@/lib/blocks';

/**
 * One plan by slug, for the native app.
 *
 * The web reads this in a server component (`/plan/[slug]`); this route is the
 * same query and the SAME block enforcement, exposed over HTTP. A plan whose
 * host is blocked in either direction returns 404, exactly like the web page,
 * so the app cannot render a plan the web would hide. Removed plans are
 * already invisible via the RLS policy on plans, and since migration 0008 the
 * block filter is in RLS too, so this check is defence in depth rather than
 * the only thing standing in the way.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const auth = await getRouteAuth(req);
  if (auth.rejected) return unauthorized();
  const { supabase, user } = auth;

  const { data: plan } = await supabase
    .from('plans')
    .select(`
      *,
      poster:profiles!plans_user_id_fkey(id, name, initials, avatar_bg, avatar_fg, about, is_founding_member),
      neighborhood:neighborhoods(id, slug, name),
      city:cities(slug, name)
    `)
    .eq('slug', slug)
    .maybeSingle();

  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let existingConversationId: string | null = null;
  let canReport = false;

  if (user) {
    let blockedIds: string[];
    try {
      blockedIds = await getBlockedIds(user.id);
    } catch (caught) {
      // Not 404: "we cannot tell whether you may see this" is a different
      // answer from "this is not here", and only one of them is worth retrying.
      if (caught instanceof BlockLookupError) return blockLookupUnavailable();
      throw caught;
    }
    if (blockedIds.includes(plan.user_id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Someone can report or block a host straight from the plan, before any
    // conversation exists. The server still derives the target from the plan,
    // so the app only needs to know whether to offer it.
    canReport = plan.user_id !== user.id;

    if (plan.user_id !== user.id) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('plan_id', plan.id)
        .eq('joiner_id', user.id)
        .maybeSingle();
      existingConversationId = conv?.id ?? null;
    }
  }

  // Honest trust signal, same rule as the web page: removed plans don't count.
  const { count: hostPlanCount } = await supabase
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', plan.user_id)
    .neq('status', 'removed');

  return NextResponse.json({
    plan,
    hostPlanCount: hostPlanCount ?? 0,
    existingConversationId,
    canReport
  });
}
