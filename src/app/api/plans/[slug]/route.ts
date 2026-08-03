import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth } from '@/lib/supabase/route';
import { getBlockedIds } from '@/lib/blocks';

/**
 * One plan by slug, for the native app.
 *
 * The web reads this in a server component (`/plan/[slug]`); this route is the
 * same query and the SAME block enforcement, exposed over HTTP. A plan whose
 * host is blocked in either direction returns 404, exactly like the web page,
 * so the app cannot render a plan the web would hide. Removed plans are
 * already invisible via the RLS policy on plans.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { supabase, user } = await getRouteAuth(req);

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

  if (user) {
    const blockedIds = await getBlockedIds(supabase, user.id);
    if (blockedIds.includes((plan as any).user_id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if ((plan as any).user_id !== user.id) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('plan_id', (plan as any).id)
        .eq('joiner_id', user.id)
        .maybeSingle();
      // Narrow cast: the generated Supabase types infer `never` for embedded
      // selects (known repo issue, see docs/ARCHITECTURE.md gotcha 3).
      existingConversationId = (conv as any)?.id ?? null;
    }
  }

  // Honest trust signal, same rule as the web page: removed plans don't count.
  const { count: hostPlanCount } = await supabase
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', (plan as any).user_id)
    .neq('status', 'removed');

  return NextResponse.json({
    plan,
    hostPlanCount: hostPlanCount ?? 0,
    existingConversationId
  });
}
