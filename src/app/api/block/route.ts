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

  // One transaction: the block, every open conversation between the two, and
  // the seat that a confirmed participant gives back. Splitting these was how a
  // blocked participant could vanish from the roster while the plan stayed full.
  const { data, error } = await (supabaseAdmin as any).rpc('block_and_close', {
    p_blocker_id: user.id,
    p_blocked_id: blockedId
  });

  if (error) {
    console.error('block_and_close failed:', error);
    return NextResponse.json({ error: 'Could not block right now. Try again.' }, { status: 503 });
  }
  if (!data?.ok) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, closed: data.closed ?? 0, seatsReturned: data.seats_returned ?? 0 });
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