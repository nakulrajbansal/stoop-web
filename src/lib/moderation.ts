import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * True if the user has been suspended by an admin (profiles.blocked_at set).
 * Suspended users can't sign in (checked in check-otp); this is the
 * defense-in-depth check for anyone already holding a session.
 */
export async function isSuspended(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('blocked_at')
    .eq('id', userId)
    .single();
  return Boolean((data as { blocked_at: string | null } | null)?.blocked_at);
}
