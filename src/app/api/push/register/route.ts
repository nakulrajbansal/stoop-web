import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth, requireUser } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { suspensionGate } from '@/lib/moderation';
import { parsePushRegistration, parsePushRevocation } from '@/lib/push-registration';

/**
 * Register / revoke this device's Expo push token.
 *
 * Used only by the native app (bearer auth). push_tokens is service-role only,
 * so every read and write here goes through the admin client AFTER the caller
 * has been verified, the same pattern the rest of the API uses.
 *
 * Registration goes through `register_push_token` (migration 0008) rather than
 * a client-steerable upsert. Both keys the client supplies - the installation
 * id and the token - used to be treated as authority: any caller could revoke
 * every row sharing a guessed installation id, or point a known token at their
 * own account so that person's phone started receiving the caller's
 * notifications. The function scopes the revoke to the caller's own rows and
 * refuses to rebind a token that is live under someone else.
 */

export async function POST(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const user = auth.user!;

  const suspended = await suspensionGate(user.id);
  if (suspended) return suspended;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const parsed = parsePushRegistration(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const registration = parsed.value;

  const { data: outcome, error } = await supabaseAdmin.rpc('register_push_token', {
    p_user_id: user.id,
    p_token: registration.expo_push_token,
    p_platform: registration.platform,
    p_installation_id: registration.installation_id,
    p_app_version: registration.app_version
  });

  if (error) {
    console.error('push token register failed:', error);
    return NextResponse.json({ error: 'Could not register for notifications' }, { status: 500 });
  }

  if (outcome === 'conflict') {
    // This token is live under another account. Refusing is the safe answer:
    // rebinding it would send this caller's notifications to that person's
    // phone. The app treats it as "notifications unavailable on this device".
    return NextResponse.json(
      {
        error: 'This device is still registered to another Stoop account. Sign out of that account first.',
        code: 'token_owned_elsewhere'
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * Revoke. The token arrives in the JSON body, never the query string: a URL is
 * written to access logs, proxy logs and error trackers, and a push token is a
 * device credential.
 *
 * Deliberately reachable while suspended - a suspended member must still be
 * able to sign out and stop the notifications.
 *
 * Two rules, and the difference between them is the whole point:
 *
 *   * Token AND installation id together are proof of device possession. Both
 *     live in this phone's keychain and neither is guessable, so a caller that
 *     can present the exact pair is the device that registered it. That
 *     registration is revoked whoever it belongs to. This is what makes a
 *     shared phone work: sign out with no signal, hand it to a housemate, they
 *     sign in — and the first person's still-live registration gets cleared on
 *     the next launch instead of being retried forever under an account that
 *     never owned it, silently matching nothing and then being forgotten.
 *   * An installation id on its own is a hint, not authority. It stays scoped
 *     to the caller's own rows, exactly as before, so guessing one cannot
 *     switch off a stranger's notifications.
 *
 * A lone token is also owner-scoped: possession of one half proves nothing.
 */
export async function DELETE(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const user = auth.user!;

  let body: unknown = null;
  try {
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const parsed = parsePushRevocation(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { token, installationId } = parsed.value;

  // Deleted, not flagged. Migration 0007 set revoked_at and kept the row "for
  // an audit trail", but the privacy policy tells members their notification
  // token is removed when they sign out or turn notifications off — and a
  // retained device identifier is exactly the kind of thing that promise is
  // about. There is no operational need for the row: a device that registers
  // again simply inserts a fresh one.
  let revoked = 0;

  if (token && installationId) {
    const { data, error } = await supabaseAdmin
      .from('push_tokens')
      .delete()
      .eq('expo_push_token', token)
      .eq('installation_id', installationId)
      .select('id');

    if (error) {
      console.error('push token revoke failed:', error);
      return NextResponse.json({ error: 'Could not turn off notifications' }, { status: 500 });
    }
    revoked += data?.length ?? 0;
  }

  // This account's own registration for whatever keys were supplied. Runs even
  // after the pair delete above: the caller may hold a row under a different
  // installation id for the same account.
  let owned = supabaseAdmin.from('push_tokens').delete().eq('user_id', user.id);
  if (token) owned = owned.eq('expo_push_token', token);
  if (installationId) owned = owned.eq('installation_id', installationId);

  const { data: ownedRows, error: ownedError } = await owned.select('id');
  if (ownedError) {
    console.error('push token revoke failed:', ownedError);
    return NextResponse.json({ error: 'Could not turn off notifications' }, { status: 500 });
  }
  revoked += ownedRows?.length ?? 0;

  // Whether the caller may stop worrying about this token. Answered by looking,
  // not by inferring: the pair delete matches nothing when the stored row has a
  // different installation id, and claiming otherwise would tell a phone to
  // forget a registration that is still live.
  let tokenCleared = false;
  if (token) {
    const { data: remaining, error: checkError } = await supabaseAdmin
      .from('push_tokens')
      .select('id')
      .eq('expo_push_token', token)
      .limit(1);

    if (checkError) {
      console.error('push token revoke check failed:', checkError);
      return NextResponse.json({ error: 'Could not turn off notifications' }, { status: 500 });
    }
    tokenCleared = (remaining?.length ?? 0) === 0;
  }

  return NextResponse.json({ ok: true, revoked, tokenCleared });
}
