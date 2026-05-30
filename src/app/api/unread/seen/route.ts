import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await req.json();
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

  const { error } = await supabase
    .from('conversation_reads')
    .upsert(
      { user_id: user.id, conversation_id: conversationId, last_seen_at: new Date().toISOString() },
      { onConflict: 'user_id,conversation_id' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}