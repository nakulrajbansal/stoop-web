import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth, requireUser } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Block another member. Silent, symmetric, and enforced in RLS as well as in
 * the routes (migration 0008), so a blocked member holding a Supabase token
 * cannot read around the API.
 *
 * Deliberately still available to a suspended account: blocking is protective,
 * and taking it away from someone under review would only expose them.
 */
export async function POST(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const user = auth.user!;

  const { blockedId } = await req.json();
  if (typeof blockedId !== 'string' || !UUID.test(blockedId) || blockedId === user.id) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // The target has to be a real member. Without this the table happily
  // accumulated blocks against ids that never existed.
  const { data: target } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', blockedId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'No such member' }, { status: 404 });

  // Record the block (admin client; we verified ownership = user.id)
  const { error: blockErr } = await supabaseAdmin
    .from('blocks')
    .upsert({ blocker_id: user.id, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });
  if (blockErr) return NextResponse.json({ error: blockErr.message }, { status: 500 });

  // Close any open conversations between the two, both directions
  const { error: convErr } = await supabaseAdmin
    .from('conversations')
    .update({ status: 'declined' })
    .or(`and(poster_id.eq.${user.id},joiner_id.eq.${blockedId}),and(poster_id.eq.${blockedId},joiner_id.eq.${user.id})`)
    .in('status', ['pending', 'confirmed']);
  if (convErr) {
    // The block itself is recorded and RLS is already enforcing it, so this is
    // a tidy-up failure rather than a safety failure. Say so and carry on.
    console.error('block: closing conversations failed (non-fatal):', convErr);
  }

  return NextResponse.json({ ok: true, blocked: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const user = auth.user!;

  const { searchParams } = new URL(req.url);
  const blockedId = searchParams.get('blockedId');
  if (!blockedId || !UUID.test(blockedId)) {
    return NextResponse.json({ error: 'blockedId required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, blocked: false });
}
