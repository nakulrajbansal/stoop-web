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

  // Deleted, not flagged. Migration 0007 set revoked_at and kept the row "for
  // an audit trail", but the privacy policy tells members their notification
  // token is removed when they sign out or turn notifications off — and a
  // retained device identifier is exactly the kind of thing that promise is
  // about. There is no operational need for the row: a device that registers
  // again simply inserts a fresh one.
  //
  // Scoped to this user's rows: a token you do not own cannot be revoked.
  let query = supabaseAdmin
    .from('push_tokens')
    .delete()
    .eq('user_id', user.id);

  if (parsed.value.token) query = query.eq('expo_push_token', parsed.value.token);
  if (parsed.value.installationId) query = query.eq('installation_id', parsed.value.installationId);

  const { error } = await query;
  if (error) {
    console.error('push token revoke failed:', error);
    return NextResponse.json({ error: 'Could not turn off notifications' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
