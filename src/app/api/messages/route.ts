import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendReplyAlert } from '@/lib/resend';

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

  // Notify the OTHER person by email, but only if they seem to have stepped away
  // (haven't sent a message in this conversation in the last 15 minutes).
  try {
    const { data: conv } = await supabase
      .from('conversations')
      .select(`
        poster_id, joiner_id,
        plan:plans(text),
        poster:profiles!conversations_poster_id_fkey(name, notify_email),
        joiner:profiles!conversations_joiner_id_fkey(name, notify_email)
      `)
      .eq('id', conversationId)
      .single();

    if (conv) {
      const recipientIsPoster = conv.joiner_id === user.id;
      const recipientId = recipientIsPoster ? conv.poster_id : conv.joiner_id;
      const recipient: any = recipientIsPoster ? conv.poster : conv.joiner;
      const sender: any = recipientIsPoster ? conv.joiner : conv.poster;

      // Has the recipient sent anything recently? If so, they're active — skip email.
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count: recentByRecipient } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
        .eq('from_user_id', recipientId)
        .gte('created_at', fifteenMinAgo);

      const planText = (conv.plan as any)?.text ?? 'your plan';
      if ((recentByRecipient ?? 0) === 0 && recipient?.notify_email) {
        await sendReplyAlert(recipient.notify_email, sender?.name ?? 'Someone', planText, conversationId, text);
      }
    }
  } catch (e) {
    console.error('reply-email failed (non-fatal):', e);
  }

  return NextResponse.json({ message: msg });
}