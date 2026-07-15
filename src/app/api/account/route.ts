import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Their profile photo lives in storage, outside the FK cascade,
  // so remove it explicitly. Non-fatal if there was none.
  try {
    await supabaseAdmin.storage.from('avatars').remove([`${user.id}.jpg`]);
  } catch (e) {
    console.error('avatar cleanup on delete failed (non-fatal):', e);
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