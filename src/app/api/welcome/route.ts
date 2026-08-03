import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth, requireUser } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { suspensionGate } from '@/lib/moderation';
import { welcomeDecision, welcomeIdempotencyKey } from '@/lib/welcome';
import { sendWelcome } from '@/lib/resend';

/**
 * Send the signed-up member their welcome email. Called once by the client
 * right after a profile is created.
 *
 * This route used to take `email` and `name` from the request body and hand
 * them straight to Resend. Any signed-in account could therefore post an
 * arbitrary address and an arbitrary display name, as often as it liked, and
 * Stoop would deliver mail on its behalf: an open relay for one template, with
 * the sender reputation attached to stoop.house.
 *
 * The recipient has been the caller's own notify_email, read server side, since
 * then. What was still missing is the "once" part. The only guard was the age
 * of the account, and an age window is not an idempotency key: every call
 * inside the first fifteen minutes sent another email, so a retry loop or fifty
 * concurrent calls delivered fifty of them.
 *
 * `claim_welcome_email` (migration 0008) is the real bound. It inserts the
 * marker row and hands 'claimed' to exactly one caller; concurrent callers
 * serialise on the primary key and are told 'already_claimed'. The claim is
 * taken BEFORE the send, so a crash mid-send cannot turn into a second email —
 * it expires on its own after five minutes and the send carries a Resend
 * idempotency key, which is what makes that retry safe rather than a replay.
 */
export async function POST(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const user = auth.user!;

  const suspended = await suspensionGate(user.id);
  if (suspended) return suspended;

  // notify_email is admin-client only (migration 0003).
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('name, notify_email, created_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('welcome: profile read failed:', error);
    return NextResponse.json({ error: 'Could not send right now.' }, { status: 503 });
  }
  if (!profile) return NextResponse.json({ ok: true, sent: false, reason: 'no_profile' });

  const decision = welcomeDecision(profile);
  if (!decision.send) return NextResponse.json({ ok: true, sent: false, reason: decision.reason });

  const { data: claim, error: claimError } = await supabaseAdmin.rpc('claim_welcome_email', {
    p_user_id: user.id
  });

  if (claimError) {
    console.error('welcome: claim failed:', claimError);
    return NextResponse.json({ error: 'Could not send right now.' }, { status: 503 });
  }
  // Someone already holds the claim, or this account has already been welcomed,
  // or it has burned its attempts. All three are "no email, and that is fine".
  if (claim !== 'claimed') {
    return NextResponse.json({ ok: true, sent: false, reason: 'already_claimed' });
  }

  const delivered = await sendWelcome(
    profile.notify_email!,
    profile.name,
    welcomeIdempotencyKey(user.id)
  );

  if (!delivered) {
    // The claim stays held rather than being released. Releasing it here would
    // re-open the window this route exists to close, and we do not know whether
    // the provider dropped the message or merely dropped our connection. It
    // ages out in five minutes; a retry after that reuses the same idempotency
    // key, so at most one email is ever delivered either way.
    return NextResponse.json(
      { error: 'Could not send right now.', code: 'welcome_send_failed' },
      { status: 503 }
    );
  }

  const { error: markError } = await supabaseAdmin.rpc('mark_welcome_email_sent', {
    p_user_id: user.id
  });
  if (markError) {
    // The email went out. Failing to write that down only costs a retry that
    // the idempotency key will deduplicate, so the caller is told the truth.
    console.error('welcome: could not mark sent:', markError);
  }

  return NextResponse.json({ ok: true, sent: true });
}
