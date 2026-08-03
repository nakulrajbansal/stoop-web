import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Account standing, and what every state-changing route does about it.
 *
 * `isSuspended` used to answer a plain boolean, and answered `false` when the
 * database read itself failed. A Supabase blip therefore let a suspended
 * account post, message and join for as long as the blip lasted. Standing is
 * now three-valued and an unknown standing fails closed.
 */

export type Standing = 'ok' | 'suspended' | 'unknown';

export async function accountStanding(userId: string): Promise<Standing> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('blocked_at')
    .eq('id', userId)
    .maybeSingle();

  // A read error is not "in good standing". It is "we do not know".
  if (error) {
    console.error('standing lookup failed:', error);
    return 'unknown';
  }
  // No profile row yet is a legitimate state: the member verified their phone
  // and has not finished signup. They are not suspended.
  if (!data) return 'ok';
  return data.blocked_at ? 'suspended' : 'ok';
}

/**
 * True only when the account is definitely suspended. Kept for the read-only
 * callers that want a boolean; anything that writes should use
 * `suspensionGate`, which also refuses on an unknown standing.
 */
export async function isSuspended(userId: string): Promise<boolean> {
  return (await accountStanding(userId)) === 'suspended';
}

/**
 * The gate every authenticated state-changing route runs. Returns a response to
 * send back, or null to carry on.
 *
 * Deliberately NOT applied to the protective, self-service routes: account
 * deletion, blocking, reporting, marking a conversation read, and revoking a
 * push token all stay available to a suspended account. Suspension exists to
 * stop someone reaching other members, not to trap them in the product.
 */
export async function suspensionGate(userId: string): Promise<NextResponse | null> {
  const standing = await accountStanding(userId);
  if (standing === 'suspended') {
    return NextResponse.json(
      { error: 'Account suspended', code: 'account_suspended' },
      { status: 403 }
    );
  }
  if (standing === 'unknown') {
    return NextResponse.json(
      { error: 'Stoop could not verify your account just now. Try again in a moment.', code: 'standing_unavailable' },
      { status: 503 }
    );
  }
  return null;
}
