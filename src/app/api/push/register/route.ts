import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSuspended } from '@/lib/moderation';
import { parsePushRegistration } from '@/lib/push-registration';

/**
 * Register / revoke this device's Expo push token.
 *
 * Used only by the native app (bearer auth). push_tokens is service-role only,
 * so every read and write here goes through the admin client AFTER the caller
 * has been verified, the same pattern the rest of the API uses.
 */

export async function POST(req: NextRequest) {
  const { user } = await getRouteAuth(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await isSuspended(user.id)) {
    return NextResponse.json({ error: 'Account suspended', code: 'account_suspended' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const parsed = parsePushRegistration(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const now = new Date().toISOString();
  const registration = parsed.value;

  // This install is re-registering: retire any earlier token it had, whoever
  // it belonged to. Stops a shared or reinstalled phone from receiving the
  // previous account's notifications.
  const { error: revokeErr } = await (supabaseAdmin as any)
    .from('push_tokens')
    .update({ revoked_at: now, updated_at: now })
    .eq('installation_id', registration.installation_id)
    .neq('expo_push_token', registration.expo_push_token)
    .is('revoked_at', null);
  if (revokeErr) console.error('push token cleanup failed (non-fatal):', revokeErr);

  const { error } = await (supabaseAdmin as any)
    .from('push_tokens')
    .upsert(
      {
        user_id: user.id,
        expo_push_token: registration.expo_push_token,
        platform: registration.platform,
        installation_id: registration.installation_id,
        app_version: registration.app_version,
        updated_at: now,
        last_used_at: now,
        revoked_at: null
      },
      { onConflict: 'expo_push_token' }
    );

  if (error) {
    console.error('push token register failed:', error);
    return NextResponse.json({ error: 'Could not register for notifications' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { user } = await getRouteAuth(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const installationId = searchParams.get('installationId');
  if (!token && !installationId) {
    return NextResponse.json({ error: 'token or installationId required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  // Scoped to this user's rows: a token you do not own cannot be revoked.
  let query = (supabaseAdmin as any)
    .from('push_tokens')
    .update({ revoked_at: now, updated_at: now })
    .eq('user_id', user.id);

  if (token) query = query.eq('expo_push_token', token);
  if (installationId) query = query.eq('installation_id', installationId);

  const { error } = await query;
  if (error) {
    console.error('push token revoke failed:', error);
    return NextResponse.json({ error: 'Could not turn off notifications' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
