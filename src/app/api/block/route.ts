import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { blockedId } = await req.json();
  if (!blockedId || blockedId === user.id) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Record the block (admin client; we verified ownership = user.id)
  const { error: blockErr } = await supabaseAdmin
    .from('blocks')
    .upsert({ blocker_id: user.id, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });
  if (blockErr) return NextResponse.json({ error: blockErr.message }, { status: 500 });

  // Close any open conversations between the two, both directions
  await supabaseAdmin
    .from('conversations')
    .update({ status: 'declined' })
    .or(`and(poster_id.eq.${user.id},joiner_id.eq.${blockedId}),and(poster_id.eq.${blockedId},joiner_id.eq.${user.id})`)
    .in('status', ['pending', 'confirmed']);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const blockedId = searchParams.get('blockedId');
  if (!blockedId) return NextResponse.json({ error: 'blockedId required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}