import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATINGS = ['great', 'fine', 'noshow'] as const;

// Records a one-tap answer from the follow-up email. No session required
// (people tap from email without being signed in), so the conversation id and
// user id from the email link act as the token; the server verifies that the
// user really is a participant of that confirmed conversation.
export async function POST(req: NextRequest) {
  const { conversationId, userId, rating } = await req.json().catch(() => ({}));

  if (!UUID.test(conversationId ?? '') || !UUID.test(userId ?? '') || !RATINGS.includes(rating)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, plan_id, poster_id, joiner_id, status')
    .eq('id', conversationId)
    .single();
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const conv = data as any;

  if (conv.status !== 'confirmed' || (conv.poster_id !== userId && conv.joiner_id !== userId)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const { error: upsertErr } = await (supabaseAdmin.from('plan_feedback' as any) as any)
    .upsert(
      {
        conversation_id: conv.id,
        plan_id: conv.plan_id,
        responder_id: userId,
        rating
      },
      { onConflict: 'conversation_id,responder_id' }
    );
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
