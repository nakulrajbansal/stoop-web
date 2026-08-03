import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth, requireUser } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { removeAvatarObject } from '@/lib/avatar-storage';

/**
 * Delete the caller's account.
 *
 * Order matters and it used to be wrong. The profile photo lives in a public
 * storage bucket, outside the foreign-key cascade, and its removal was wrapped
 * in a try/catch described as non-fatal. `remove()` reports failure by
 * resolving with `{ error }` rather than throwing, so that catch never fired:
 * a storage outage looked exactly like a clean delete, the auth user was
 * destroyed anyway, and the member's face stayed on a public URL with no
 * account left to retry from.
 *
 * The photo now goes first and the result is checked. If it cannot be removed
 * for an operational reason, nothing irreversible happens and the caller gets a
 * retryable 503. An object that was never there is success.
 */
export async function DELETE(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const user = auth.user!;

  const removal = await removeAvatarObject(supabaseAdmin.storage, user.id);
  if (!removal.ok) {
    console.error('account delete halted: avatar removal failed:', removal.reason);
    return NextResponse.json(
      {
        error: 'Stoop could not remove your photo just now, so your account was not deleted. Try again in a moment.',
        code: 'avatar_delete_failed'
      },
      { status: 503 }
    );
  }

  // Delete the auth user. Cascading FK deletes wipe profiles, plans,
  // conversations, messages, reports automatically (via ON DELETE CASCADE).
  const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('deleteUser failed:', error);
    return NextResponse.json({ error: 'Could not delete account' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
