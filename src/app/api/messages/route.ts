import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendReplyAlert } from '@/lib/resend';
import { isSuspended } from '@/lib/moderation';

// The route holds no authority of its own: these map the transaction's answers
// onto fixed public copy, so no database detail reaches a client.
const DAILY_MESSAGE_LIMIT = 50;

const SEND_REFUSAL_STATUS: Record<string, number> = {
  bad_message: 400,
  not_found: 404,
  forbidden: 403,
  closed: 409,
  blocked: 403,
  rate_limited: 429
};

const SEND_REFUSAL_COPY: Record<string, string> = {
  bad_message: 'Message length out of range',
  not_found: 'Conversation not found',
  forbidden: 'Not allowed',
  closed: 'This conversation is closed.',
  blocked: 'This conversation is no longer available.',
  rate_limited: 'Message limit reached. Try again tomorrow.'
};

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

  // One call, one transaction. Participant, lifecycle state, blocks and the
  // daily limit are all decided under a lock on this sender and this
  // conversation, and the insert happens in the same transaction. The route
  // deliberately reads none of it first: anything it checked out here could
  // change before the write, which is exactly the gap this closes.
  const { data, error } = await (supabaseAdmin as any).rpc('send_conversation_message', {
    p_conversation_id: conversationId,
    p_sender_id: user.id,
    p_message: text,
    p_daily_limit: DAILY_MESSAGE_LIMIT
  });

  if (error) {
    // Includes the function not existing yet, before the migration is run.
    // Either way nothing was written and nobody is emailed.
    console.error('send_conversation_message failed:', error);
    return NextResponse.json({ error: 'Could not send that. Try again.' }, { status: 503 });
  }

  if (!data?.ok) {
    const status = SEND_REFUSAL_STATUS[data?.code as string] ?? 400;
    return NextResponse.json({ error: SEND_REFUSAL_COPY[data?.code as string] ?? 'Could not send' }, { status });
  }

  const message = {
    id: data.message_id,
    conversation_id: data.conversation_id,
    from_user_id: user.id,
    text,
    created_at: data.created_at
  };

  // Notify the OTHER person by email, but only if they seem to have stepped away
  // (haven't sent a message in this conversation in the last 15 minutes).
  // Everything here runs after the transaction committed, and a failure never
  // un-sends the message.
  try {
    const recipientId: string = data.recipient_id;

    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: recentByRecipient } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('from_user_id', recipientId)
      .gte('created_at', fifteenMinAgo);

    if ((recentByRecipient ?? 0) === 0) {
      // notify_email is a private column; only the admin client may read it
      // (migration 0003 revokes it from the API roles). display_name is the
      // first-name projection: the full name is not readable here either.
      const [{ data: recipientRow }, { data: senderRow }, { data: convRow }] = await Promise.all([
        supabaseAdmin.from('profiles').select('notify_email').eq('id', recipientId).maybeSingle(),
        supabaseAdmin.from('profiles').select('name:display_name').eq('id', user.id).maybeSingle(),
        supabaseAdmin.from('conversations').select('plan:plans(text)').eq('id', conversationId).maybeSingle()
      ]);
      const recipient = recipientRow as { notify_email: string | null } | null;
      const senderName = (senderRow as { name: string } | null)?.name ?? 'Someone';
      const planText = ((convRow as any)?.plan as { text?: string } | null)?.text ?? 'your plan';

      if (recipient?.notify_email) {
        await sendReplyAlert(recipient.notify_email, senderName, planText, conversationId, text);
      }
    }
  } catch (e) {
    console.error('reply-email failed (non-fatal):', e);
  }

  return NextResponse.json({ message });
}