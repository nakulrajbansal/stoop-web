import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const VALID_REASONS = new Set([
  'harassment',
  'inappropriate_messages',
  'unsafe_behavior',
  'fake_profile',
  'other'
]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId, reportedUserId, reason, details } = await req.json();
  if (!reason || !VALID_REASONS.has(reason)) {
    return NextResponse.json({ error: 'Pick a reason' }, { status: 400 });
  }

  // Figure out who is being reported. If a conversation is given, derive the
  // other participant from it (don't trust the browser), and verify the
  // reporter is actually in that conversation.
  let reportedId: string | null = null;
  let convId: string | null = null;

  if (conversationId) {
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('id, poster_id, joiner_id')
      .eq('id', conversationId)
      .single();
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    if (conv.poster_id !== user.id && conv.joiner_id !== user.id) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }
    convId = conv.id;
    reportedId = conv.poster_id === user.id ? conv.joiner_id : conv.poster_id;
  } else if (reportedUserId && reportedUserId !== user.id) {
    reportedId = reportedUserId;
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
  return NextResponse.json({ ok: true });
}
