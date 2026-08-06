import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendMessageAlert, sendConfirmed, sendWithdrawn, sendRequestedAgain } from '@/lib/resend';
import { getBlockedIds, getBlockedIdsResult } from '@/lib/blocks';
import { isSuspended } from '@/lib/moderation';
import { STATE_COPY, stateCopy } from '@/lib/conversation-lifecycle';
import { buildRequesterPreview } from '@/lib/participants';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (await isSuspended(user.id)) {
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
  }

  const { planId, firstMessage, requestAgain } = await req.json();
  if (!planId || !firstMessage || typeof firstMessage !== 'string') {
    return NextResponse.json({ error: 'Plan ID and message required' }, { status: 400 });
  }
  if (firstMessage.length < 5 || firstMessage.length > 2000) {
    return NextResponse.json({ error: 'Message must be 5-2000 characters' }, { status: 400 });
  }

  // One call. The conversation (or the reopen) and the opening message commit
  // together inside Postgres, or neither of them does. Doing it in two steps is
  // how a pending request ends up with no message explaining it, and a
  // re-request ends up having spent its one allowed reopen for nothing.
  //
  // Authorization, blocks, plan state, capacity, the decline rule, the
  // withdrawn rule and the reopen cap all live in that function, so there is no
  // window between checking them and writing.
  const { data, error } = await (supabaseAdmin as any).rpc('start_or_reopen_conversation', {
    p_plan_id: planId,
    p_actor_id: user.id,
    p_message: firstMessage,
    p_request_again: requestAgain === true
  });

  if (isMissingFunction(error)) {
    return NextResponse.json({ error: 'Messaging is not switched on yet.' }, { status: 503 });
  }
  if (error) {
    // Includes the case this exists to fix: the opener failed to insert, so the
    // whole transaction rolled back and nothing durable changed.
    console.error('start_or_reopen_conversation failed:', error);
    return NextResponse.json({ error: 'Could not send that. Try again.' }, { status: 500 });
  }

  if (!data?.ok) {
    const status = REFUSAL_STATUS[data?.code as string] ?? 400;
    return NextResponse.json(
      {
        error: data?.error ?? 'Could not send',
        conversationId: data?.conversation_id ?? null,
        status: REFUSAL_STATE[data?.code as string] ?? null,
        canRequestAgain: data?.code === 'withdrawn',
        note: REFUSAL_STATE[data?.code as string]
          ? stateCopy(REFUSAL_STATE[data?.code as string]).line
          : undefined
      },
      { status }
    );
  }

  const convId: string = data.conversation_id;
  const status: string = data.status;

  // After the commit, never before, and only for a request the host has not
  // already been told about.
  if (data.notify_host) {
    try {
      // notify_email is a private column; only the admin client may read it
      // (migration 0003 revokes it from the API roles).
      const { data: poster } = await supabaseAdmin
        .from('profiles').select('notify_email').eq('id', data.host_id).single();
      // Same cast the other client pages use: the generated types resolve a
      // narrowed select to never here.
      const { data: joinerRow } = await supabase
        .from('profiles').select('name:display_name').eq('id', user.id).single();
      const { data: planRow } = await supabase
        .from('plans').select('text').eq('id', planId).single();
      const joiner = joinerRow as { name: string } | null;
      const planFull = planRow as { text: string } | null;

      if (poster?.notify_email && joiner && planFull) {
        if (data.reopened) {
          await sendRequestedAgain(poster.notify_email, joiner.name, planFull.text, convId, firstMessage);
        } else {
          await sendMessageAlert(poster.notify_email, joiner.name, planFull.text, convId, firstMessage);
        }
      }
    } catch (e) {
      console.error('join-email failed (non-fatal):', e);
    }
  }

  // Say plainly what just happened: a conversation, not a reservation.
  // messageWritten is false when the thread was already active, which is the
  // case where this route deliberately writes nothing: ordinary messages belong
  // to /api/messages, where the daily limit is.
  return NextResponse.json({
    ok: true,
    conversationId: convId,
    status,
    messageWritten: data.message_written !== false,
    note: stateCopy(status).line
  });
}

// What each refusal from the transaction means over HTTP, and which lifecycle
// state (if any) the caller is being told about.
const REFUSAL_STATUS: Record<string, number> = {
  not_found: 404,
  own_plan: 400,
  blocked: 403,
  plan_closed: 400,
  no_spots: 400,
  bad_message: 400,
  declined: 409,
  withdrawn: 409,
  reopen_limit: 409
};

const REFUSAL_STATE: Record<string, string> = {
  declined: 'declined',
  withdrawn: 'withdrawn',
  reopen_limit: 'withdrawn'
};

type LifecycleAction = 'confirm' | 'decline' | 'withdraw';

// PostgREST cannot find a function that has not been migrated yet.
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883') return true;
  return /could not find the function|does not exist|schema cache/i.test(error.message ?? '');
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId, action } = await req.json();
  if (!conversationId || !['confirm', 'decline', 'withdraw'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const lifecycleAction = action as LifecycleAction;

  // auth.uid() is not reliable here, so ownership is checked in this route and
  // the state change is then made by the service role inside one Postgres
  // transaction. The database, not this handler, owns the capacity arithmetic.
  const { data: convRow } = await supabaseAdmin
    .from('conversations')
    .select(`
      id, status, poster_id, joiner_id, plan_id,
      plan:plans(text),
      poster:profiles!conversations_poster_id_fkey(name:display_name),
      joiner:profiles!conversations_joiner_id_fkey(name:display_name)
    `)
    .eq('id', conversationId)
    .maybeSingle();
  const conv = convRow as any;

  if (!conv) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const isHost = conv.poster_id === user.id;
  const isRequester = conv.joiner_id === user.id;
  if (!isHost && !isRequester) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  if (lifecycleAction === 'withdraw' ? !isRequester : !isHost) {
    return NextResponse.json(
      {
        error: isHost
          ? 'Only the requester can withdraw. Use Decline instead.'
          : 'Only the host decides who joins.'
      },
      { status: 403 }
    );
  }

  const planText = (conv.plan as any)?.text ?? 'your plan';
  const posterName = (conv.poster as any)?.name ?? 'The host';
  const joinerName = (conv.joiner as any)?.name ?? 'Someone';

  if (lifecycleAction === 'withdraw') {
    const { data, error } = await (supabaseAdmin as any).rpc('withdraw_conversation', {
      p_conversation_id: conversationId,
      p_actor_id: user.id
    });

    if (isMissingFunction(error)) {
      // The withdrawal migration has not been run yet. Say so rather than
      // half-doing it in application code and getting capacity wrong.
      return NextResponse.json({ error: 'Leaving a plan is not switched on yet.' }, { status: 503 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.ok) return NextResponse.json({ error: data?.error ?? 'Could not withdraw' }, { status: 400 });

    // Tell the host, but only the first time. A repeated call is a no-op.
    if (!data.already) {
      try {
        const { data: poster } = await supabaseAdmin
          .from('profiles').select('notify_email').eq('id', conv.poster_id).single();
        if (poster?.notify_email) {
          await sendWithdrawn(poster.notify_email, joinerName, planText, conversationId);
        }
      } catch (e) {
        console.error('withdraw-email failed (non-fatal):', e);
      }
    }

    return NextResponse.json({
      ok: true,
      status: 'withdrawn',
      already: Boolean(data.already),
      spotsLeft: data.spots_left ?? null,
      planStatus: data.plan_status ?? null,
      note: STATE_COPY.withdrawn.line
    });
  }

  const { data, error } = await (supabaseAdmin as any).rpc('confirm_conversation', {
    p_conversation_id: conversationId,
    p_actor_id: user.id,
    p_action: lifecycleAction
  });

  // No fallback. Before the lifecycle migration is applied the only other way
  // to confirm is read-then-write from here, which is not atomic, and the
  // capacity trigger it would rely on is still the old clamping one. So this
  // fails closed: no status write, no email, nothing half done.
  if (isMissingFunction(error)) {
    return NextResponse.json(
      { error: 'Confirming and declining are not switched on yet.' },
      { status: 503 }
    );
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.ok) return NextResponse.json({ error: data?.error ?? 'Could not update' }, { status: 400 });

  const newStatus = data.status;

  if (newStatus === 'confirmed') {
    try {
      // Same as above: private column, admin client only.
      const { data: joiner } = await supabaseAdmin
        .from('profiles').select('notify_email').eq('id', conv.joiner_id).single();
      if (joiner?.notify_email) {
        await sendConfirmed(joiner.notify_email, planText, posterName, conversationId);
      }
    } catch (e) {
      console.error('confirm-email failed (non-fatal):', e);
    }
  }

  return NextResponse.json({
    ok: true,
    status: newStatus,
    spotsLeft: data?.spots_left ?? null,
    planStatus: data?.plan_status ?? null,
    note: newStatus === 'confirmed' ? STATE_COPY.confirmed.line : STATE_COPY.declined.line
  });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');

  // One thread, plus the private requester card the host needs before deciding.
  // This is an authenticated route keyed by conversation: none of it is ever
  // attached to a public plan response.
  if (conversationId) {
    const { data: convRow } = await supabaseAdmin
      .from('conversations')
      .select('id, status, poster_id, joiner_id, plan_id, created_at, reopened_at')
      .eq('id', conversationId)
      .maybeSingle();
    const conv = convRow as any;
    if (!conv || (conv.poster_id !== user.id && conv.joiner_id !== user.id)) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    // Strict lookup, before any profile or message read. An unanswerable block
    // query must not be read as "nobody is blocked" on the one route that hands
    // a host somebody's name, neighborhood and words.
    const blocks = await getBlockedIdsResult(supabase as any, user.id);
    if (!blocks.ok) {
      console.error('requester card block lookup failed, denying:', blocks.error);
      return NextResponse.json(
        { error: 'Could not check this conversation right now. Try again in a moment.' },
        { status: 503 }
      );
    }
    if (blocks.ids.includes(conv.poster_id === user.id ? conv.joiner_id : conv.poster_id)) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    }

    if (conv.poster_id !== user.id) {
      return NextResponse.json({ conversation: { id: conv.id, status: conv.status }, requester: null });
    }

    // The opener for THIS request. Somebody who withdrew and asked again wrote a
    // new one, and the host has to read that rather than the line that started a
    // conversation they already left.
    let openerQuery = supabaseAdmin.from('messages').select('text, from_user_id, created_at')
      .eq('conversation_id', conv.id).eq('from_user_id', conv.joiner_id);
    if (conv.reopened_at) openerQuery = openerQuery.gte('created_at', conv.reopened_at);

    const [{ data: profileRow }, { count }, { data: openerRows }] = await Promise.all([
      supabaseAdmin.from('profiles').select('id, name:display_name, about, neighborhood_id').eq('id', conv.joiner_id).maybeSingle(),
      supabaseAdmin.from('plans').select('id', { count: 'exact', head: true })
        .eq('user_id', conv.joiner_id).neq('status', 'removed'),
      openerQuery.order('created_at', { ascending: true }).limit(1)
    ]);

    const profile = profileRow as { id: string; name: string; about: string | null; neighborhood_id: string | null } | null;
    let neighborhood: string | null = null;
    if (profile?.neighborhood_id) {
      const { data: hood } = await supabaseAdmin
        .from('neighborhoods').select('name').eq('id', profile.neighborhood_id).maybeSingle();
      neighborhood = (hood as { name: string } | null)?.name ?? null;
    }

    const requester = buildRequesterPreview({
      profile: {
        id: conv.joiner_id,
        name: profile?.name ?? null,
        about: profile?.about ?? null,
        neighborhood
      },
      priorPlanCount: count ?? 0,
      opener: ((openerRows ?? []) as { text: string }[])[0]?.text ?? null,
      status: conv.status
    });

    return NextResponse.json(
      { conversation: { id: conv.id, status: conv.status }, requester },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  const { data: convs, error } = await supabase
    .from('conversations')
    .select(`
      *,
      plan:plans(id, text, when_day, when_time, status),
      poster:profiles!conversations_poster_id_fkey(id, name:display_name, initials, avatar_bg, avatar_fg),
      joiner:profiles!conversations_joiner_id_fkey(id, name:display_name, initials, avatar_bg, avatar_fg),
      messages(id, text, from_user_id, created_at)
    `)
    .or(`poster_id.eq.${user.id},joiner_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversations: convs ?? [] });
}
