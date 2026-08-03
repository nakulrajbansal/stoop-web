import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth, requireUser } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';

const VALID_REASONS = new Set([
  'harassment',
  'inappropriate_messages',
  'unsafe_behavior',
  'fake_profile',
  'other'
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * File a report, and optionally block the same person in the same call.
 *
 * Who is being reported is always derived server side. A conversation id or a
 * plan slug identifies the other party; a bare `reportedUserId` is accepted
 * only for a member who actually exists, and never for yourself.
 *
 * `alsoBlock` used to be two separate calls from the client, with the block
 * failure swallowed — so the confirmation screen could say "they are blocked"
 * when nothing had been blocked. Doing both here means the response can state
 * what actually happened, and the client has nothing left to guess.
 *
 * Deliberately available to a suspended account: reporting is protective.
 */
export async function POST(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const user = auth.user!;

  const { conversationId, planSlug, reportedUserId, reason, details, alsoBlock } = await req.json();
  if (!reason || !VALID_REASONS.has(reason)) {
    return NextResponse.json({ error: 'Pick a reason' }, { status: 400 });
  }

  let reportedId: string | null = null;
  let convId: string | null = null;

  if (conversationId) {
    if (typeof conversationId !== 'string' || !UUID.test(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 });
    }
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('id, poster_id, joiner_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    if (conv.poster_id !== user.id && conv.joiner_id !== user.id) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }
    convId = conv.id;
    reportedId = conv.poster_id === user.id ? conv.joiner_id : conv.poster_id;
  } else if (planSlug) {
    // Reporting a plan you have only looked at. The host comes from the plan,
    // never from the request body.
    if (typeof planSlug !== 'string') {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }
    const { data: plan } = await supabaseAdmin
      .from('plans')
      .select('user_id')
      .eq('slug', planSlug)
      .maybeSingle();
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    if (plan.user_id === user.id) {
      return NextResponse.json({ error: 'That is your own plan' }, { status: 400 });
    }
    reportedId = plan.user_id;
  } else if (typeof reportedUserId === 'string' && UUID.test(reportedUserId) && reportedUserId !== user.id) {
    const { data: target } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', reportedUserId)
      .maybeSingle();
    if (!target) return NextResponse.json({ error: 'No such member' }, { status: 404 });
    reportedId = target.id;
  }

  if (!reportedId) {
    return NextResponse.json({ error: 'Nothing to report' }, { status: 400 });
  }

  const cleanDetails = typeof details === 'string' ? details.trim().slice(0, 1000) : null;

  // Admin client: auth.uid() is null in API routes, so RLS-checked inserts fail.
  // We verified the reporter above, so write with the admin client.
  const { error } = await supabaseAdmin.from('reports').insert({
    reporter_id: user.id,
    reported_user_id: reportedId,
    conversation_id: convId,
    reason,
    details: cleanDetails || null
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (alsoBlock !== true) return NextResponse.json({ ok: true, blocked: false });

  const { error: blockErr } = await supabaseAdmin
    .from('blocks')
    .upsert({ blocker_id: user.id, blocked_id: reportedId }, { onConflict: 'blocker_id,blocked_id' });

  if (blockErr) {
    console.error('report: block leg failed:', blockErr);
    // The report is filed and must not be re-sent. Say plainly that the block
    // is the part that did not happen, so the client can offer to retry only
    // that half instead of claiming a block that does not exist.
    return NextResponse.json({ ok: true, blocked: false, blockFailed: true, reportedUserId: reportedId });
  }

  const { error: convErr } = await supabaseAdmin
    .from('conversations')
    .update({ status: 'declined' })
    .or(`and(poster_id.eq.${user.id},joiner_id.eq.${reportedId}),and(poster_id.eq.${reportedId},joiner_id.eq.${user.id})`)
    .in('status', ['pending', 'confirmed']);
  if (convErr) console.error('report: closing conversations failed (non-fatal):', convErr);

  return NextResponse.json({ ok: true, blocked: true, reportedUserId: reportedId });
}
