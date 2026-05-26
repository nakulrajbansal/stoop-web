import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId, text } = await req.json();
  if (!conversationId || !text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  if (text.length < 1 || text.length > 2000) {
    return NextResponse.json({ error: 'Message length out of range' }, { status: 400 });
  }

  // Rate limit: 50 messages per user per day
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('from_user_id', user.id)
    .gte('created_at', oneDayAgo);

  if ((count ?? 0) >= 50) {
    return NextResponse.json({ error: 'Message limit reached. Try again tomorrow.' }, { status: 429 });
  }

  const { data: msg, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, from_user_id: user.id, text })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: msg });
}
