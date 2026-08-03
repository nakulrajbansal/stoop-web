import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth, requireUser } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { suspensionGate } from '@/lib/moderation';
import { welcomeDecision } from '@/lib/welcome';
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
 * Now the recipient is the caller's own notify_email, read server side, and a
 * second send is a no-op. Nothing about who receives it is caller-controlled.
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
  if (!profile) return NextResponse.json({ ok: true, sent: false });

  const decision = welcomeDecision(profile);
  if (!decision.send) return NextResponse.json({ ok: true, sent: false });

  try {
    await sendWelcome(profile.notify_email!, profile.name);
  } catch (e) {
    console.error('welcome send failed:', e);
    return NextResponse.json({ error: 'Could not send right now.' }, { status: 503 });
  }

  return NextResponse.json({ ok: true, sent: true });
}
