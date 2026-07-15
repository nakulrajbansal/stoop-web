import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendReplyAlert } from '@/lib/resend';
import { getBlockedIds } from '@/lib/blocks';
import { isSuspended } from '@/lib/moderation';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (await isSuspended(user.id)) {
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
  }

  const { conversationId, text } = await req.json();
  if (!conversationId || !text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  if (text.length < 1 || text.length > 2000) {
    return NextResponse.json({ error: 'Message length out of range' }, { status: 400 });
  }

  // Load the conversation first — we need it for the block check AND the email logic
  const { data: conv } = await supabase
    .from('conversations')
    .select(`
      poster_id, joiner_id, status,
      plan:plans(text),
      poster:profiles!conversations_poster_id_fkey(name),
      joiner:profiles!conversations_joiner_id_fkey(name)
    `)
    .eq('id', conversationId)
    .single();

  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  // The sender must be part of this conversation
  if (conv.poster_id !== user.id && conv.joiner_id !== user.id) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  // Refuse if either party has blocked the other
  const otherId = conv.poster_id === user.id ? conv.joiner_id : conv.poster_id;
  const blockedIds = await getBlockedIds(supabase, user.id);
  if (blockedIds.includes(otherId)) {
    return NextResponse.json({ error: 'This conversation is no longer available.' }, { status: 403 });
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
    const recipientIsPoster = conv.joiner_id === user.id;
    const recipientId = recipientIsPoster ? conv.poster_id : conv.joiner_id;
    const sender: any = recipientIsPoster ? conv.joiner : conv.poster;

    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: recentByRecipient } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('from_user_id', recipientId)
      .gte('created_at', fifteenMinAgo);

    const planText = (conv.plan as any)?.text ?? 'your plan';
    if ((recentByRecipient ?? 0) === 0) {
      // notify_email is a private column; only the admin client may read it
      // (migration 0003 revokes it from the API roles).
      const { data: recipient } = await supabaseAdmin
        .from('profiles').select('notify_email').eq('id', recipientId).single();
      if (recipient?.notify_email) {
        await sendReplyAlert(recipient.notify_email, sender?.name ?? 'Someone', planText, conversationId, text);
      }
    }
  } catch (e) {
    console.error('reply-email failed (non-fatal):', e);
  }

  return NextResponse.json({ message: msg });
}