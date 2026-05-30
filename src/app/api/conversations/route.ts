import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendMessageAlert, sendConfirmed } from '@/lib/resend';
import { getBlockedIds } from '@/lib/blocks';
import { isSuspended } from '@/lib/moderation';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (await isSuspended(user.id)) {
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
  }

  const { planId, firstMessage } = await req.json();
  if (!planId || !firstMessage || typeof firstMessage !== 'string') {
    return NextResponse.json({ error: 'Plan ID and message required' }, { status: 400 });
  }
  if (firstMessage.length < 5 || firstMessage.length > 2000) {
    return NextResponse.json({ error: 'Message must be 5-2000 characters' }, { status: 400 });
  }

  // Look up plan
  const { data: plan } = await supabase
    .from('plans')
    .select('id, user_id, status, spots_left')
    .eq('id', planId)
    .single();

  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  if (plan.user_id === user.id) {
    return NextResponse.json({ error: "Can't message your own plan" }, { status: 400 });
  }
  if (plan.status !== 'open' || plan.spots_left < 1) {
    return NextResponse.json({ error: 'This plan is no longer open' }, { status: 400 });
  }

  // Refuse if either party has blocked the other
  const blockedIds = await getBlockedIds(supabase, user.id);
  if (blockedIds.includes(plan.user_id)) {
    return NextResponse.json({ error: 'This plan is unavailable.' }, { status: 403 });
  }

  // Check for existing conversation
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('plan_id', planId)
    .eq('joiner_id', user.id)
    .maybeSingle();

  let convId: string;
  if (existing) {
    convId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from('conversations')
      .insert({ plan_id: planId, poster_id: plan.user_id, joiner_id: user.id })
      .select('id')
      .single();
    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? 'Could not start conversation' }, { status: 500 });
    }
    convId = created.id;
  }

  // Insert first message
  const { error: msgErr } = await supabase
    .from('messages')
    .insert({ conversation_id: convId, from_user_id: user.id, text: firstMessage });

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  // Notify the poster by email (only on a brand-new conversation, not repeat messages)
  if (!existing) {
    try {
      const { data: poster } = await supabase
        .from('profiles').select('notify_email').eq('id', plan.user_id).single();
      const { data: joiner } = await supabase
        .from('profiles').select('name').eq('id', user.id).single();
      const { data: planFull } = await supabase
        .from('plans').select('text').eq('id', planId).single();

      if (poster?.notify_email && joiner && planFull) {
        await sendMessageAlert(poster.notify_email, joiner.name, planFull.text, convId, firstMessage);
      }
    } catch (e) {
      console.error('join-email failed (non-fatal):', e);
    }
  }
  return NextResponse.json({ ok: true, conversationId: convId });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId, action } = await req.json();
  if (!conversationId || !['confirm', 'decline'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Only the poster can confirm/decline
  const { data: conv } = await supabase
    .from('conversations')
    .select(`
      id, status, poster_id, joiner_id,
      plan:plans(text),
      poster:profiles!conversations_poster_id_fkey(name)
    `)
    .eq('id', conversationId)
    .single();

  if (!conv || conv.poster_id !== user.id) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  if (conv.status !== 'pending') {
    return NextResponse.json({ error: 'Already resolved' }, { status: 400 });
  }

  const newStatus = action === 'confirm' ? 'confirmed' : 'declined';
  const { error } = await supabase
    .from('conversations')
    .update({ status: newStatus })
    .eq('id', conversationId);
    if (newStatus === 'confirmed') {
      try {
        const { data: joiner } = await supabase
          .from('profiles').select('notify_email').eq('id', conv.joiner_id).single();
        const planText = (conv.plan as any)?.text ?? 'your plan';
        const posterName = (conv.poster as any)?.name ?? 'The host';
        if (joiner?.notify_email) {
          await sendConfirmed(joiner.notify_email, planText, posterName, conversationId);
        }
      } catch (e) {
        console.error('confirm-email failed (non-fatal):', e);
      }
    }


  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The DB trigger automatically decrements spots_left when confirmed.

  return NextResponse.json({ ok: true, status: newStatus });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: convs, error } = await supabase
    .from('conversations')
    .select(`
      *,
      plan:plans(id, text, when_day, when_time, status),
      poster:profiles!conversations_poster_id_fkey(id, name, initials, avatar_bg, avatar_fg),
      joiner:profiles!conversations_joiner_id_fkey(id, name, initials, avatar_bg, avatar_fg),
      messages(id, text, from_user_id, created_at)
    `)
    .or(`poster_id.eq.${user.id},joiner_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversations: convs ?? [] });
}
