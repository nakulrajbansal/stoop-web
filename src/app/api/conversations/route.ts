import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth, requireUser } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendMessageAlert, sendConfirmed } from '@/lib/resend';
import { getBlockedIds } from '@/lib/blocks';
import { suspensionGate } from '@/lib/moderation';
import { BLOCKED_LANGUAGE_MESSAGE, containsBlockedLanguage, isBlockedLanguageError } from '@/lib/text-moderation';
import { notifyUser } from '@/lib/push';

export async function POST(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const { supabase } = auth;
  const user = auth.user!;

  const suspended = await suspensionGate(user.id);
  if (suspended) return suspended;

  const { planId, firstMessage } = await req.json();
  if (!planId || !firstMessage || typeof firstMessage !== 'string') {
    return NextResponse.json({ error: 'Plan ID and message required' }, { status: 400 });
  }
  if (firstMessage.length < 5 || firstMessage.length > 2000) {
    return NextResponse.json({ error: 'Message must be 5-2000 characters' }, { status: 400 });
  }
  if (containsBlockedLanguage(firstMessage)) {
    return NextResponse.json({ error: BLOCKED_LANGUAGE_MESSAGE, code: 'blocked_language' }, { status: 400 });
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

  if (msgErr) {
    if (isBlockedLanguageError(msgErr)) {
      return NextResponse.json({ error: BLOCKED_LANGUAGE_MESSAGE, code: 'blocked_language' }, { status: 400 });
    }
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  // Notify the poster by email (only on a brand-new conversation, not repeat messages)
  if (!existing) {
    try {
      // notify_email is a private column; only the admin client may read it
      // (migration 0003 revokes it from the API roles).
      const { data: poster } = await supabaseAdmin
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

    // Same event, native channel. Generic copy only: the message itself is
    // fetched in-app, never put on a lock screen. Email is unaffected.
    await notifyUser(plan.user_id, 'join_request', { conversationId: convId });
  }
  return NextResponse.json({ ok: true, conversationId: convId });
}

/**
 * Confirm or decline a join request.
 *
 * The transition itself is the permission check and the concurrency check. It
 * used to be read-then-write: two taps (or a retried request) both read
 * `pending`, both wrote, and both sent a confirmation email and a push. The
 * `resolve_conversation` function in migration 0008 moves the status guard into
 * the UPDATE's WHERE clause, so exactly one caller can win, and only the winner
 * notifies anybody.
 */
export async function PATCH(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const { supabase } = auth;
  const user = auth.user!;

  const suspended = await suspensionGate(user.id);
  if (suspended) return suspended;

  const { conversationId, action } = await req.json();
  if (!conversationId || !['confirm', 'decline'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Only the poster can confirm/decline. Read through the caller's own client,
  // so RLS (including the block rules from 0008) applies to the read.
  const { data: conv } = await supabase
    .from('conversations')
    .select(`
      id, status, poster_id, joiner_id,
      plan:plans(text),
      poster:profiles!conversations_poster_id_fkey(name)
    `)
    .eq('id', conversationId)
    .maybeSingle();

  if (!conv || conv.poster_id !== user.id) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const newStatus = action === 'confirm' ? 'confirmed' : 'declined';

  const { data: outcome, error } = await supabaseAdmin.rpc('resolve_conversation', {
    p_conversation_id: conversationId,
    p_poster_id: user.id,
    p_status: newStatus
  });

  if (error) {
    console.error('resolve_conversation failed:', error);
    return NextResponse.json({ error: 'Could not update this request.' }, { status: 500 });
  }

  if (outcome === 'not_found') return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  if (outcome === 'already_resolved') {
    return NextResponse.json({ error: 'Already resolved' }, { status: 400 });
  }
  if (outcome !== 'updated') {
    return NextResponse.json({ error: 'Could not update this request.' }, { status: 500 });
  }

  // Past this point exactly one caller moved the row out of `pending`, so the
  // email and the push happen exactly once no matter how many taps raced.
  if (newStatus === 'confirmed') {
    try {
      // Same as above: private column, admin client only.
      const { data: joiner } = await supabaseAdmin
        .from('profiles').select('notify_email').eq('id', conv.joiner_id).single();
      const planText = conv.plan?.text ?? 'your plan';
      const posterName = conv.poster?.name ?? 'The host';
      if (joiner?.notify_email) {
        await sendConfirmed(joiner.notify_email, planText, posterName, conversationId);
      }
    } catch (e) {
      console.error('confirm-email failed (non-fatal):', e);
    }

    await notifyUser(conv.joiner_id, 'confirmed', { conversationId });
  }

  // The DB trigger automatically decrements spots_left when confirmed.

  return NextResponse.json({ ok: true, status: newStatus });
}

export async function GET(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const { supabase } = auth;
  const user = auth.user!;

  // `slug` is named explicitly: the native app's Conversation type declares it
  // and uses it to open the plan behind a conversation. It was missing from the
  // embedded select, so every plan link in the app's inbox was undefined.
  const { data: convs, error } = await supabase
    .from('conversations')
    .select(`
      *,
      plan:plans(id, slug, text, when_day, when_time, when_time_specific, spot, status),
      poster:profiles!conversations_poster_id_fkey(id, name, initials, avatar_bg, avatar_fg),
      joiner:profiles!conversations_joiner_id_fkey(id, name, initials, avatar_bg, avatar_fg),
      messages(id, text, from_user_id, created_at)
    `)
    .or(`poster_id.eq.${user.id},joiner_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversations: convs ?? [] });
}
