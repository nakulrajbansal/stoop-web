import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// No sign-in required: digest recipients may not have a session on this
// device. The uid is an unguessable UUID from their own email, and the only
// thing this can ever do is turn OFF an email, so the risk is a wash.
export async function POST(req: NextRequest) {
  let uid = '';
  try {
    uid = (await req.json())?.uid ?? '';
  } catch {}
  if (!UUID_RE.test(uid)) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 400 });
  }

  // Cast needed: digest_opt_out_at arrives with migration 0004 and is not in
  // the generated types (which are weak anyway; see ARCHITECTURE.md gotcha 3).
  const { error } = await (supabaseAdmin.from('profiles') as any)
    .update({ digest_opt_out_at: new Date().toISOString() })
    .eq('id', uid);

  if (error) {
    console.error('digest unsubscribe failed:', error);
    return NextResponse.json({ error: 'Could not unsubscribe' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
