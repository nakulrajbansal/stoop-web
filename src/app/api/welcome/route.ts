import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendWelcome } from '@/lib/resend';

/**
 * The welcome email.
 *
 * This route used to take an address and a name out of the request body, which
 * meant anybody holding a session could send a Stoop-branded welcome to
 * anybody, under any name. It was called from the browser at the end of signup,
 * and that call is gone: POST /api/profile now sends the welcome itself, from
 * the address the database actually stored, exactly once.
 *
 * So nothing calls this any more. It is kept and narrowed rather than deleted,
 * because a route that still exists and still accepts a recipient is the hole;
 * a route that can only ever mail the caller their own welcome is not. There is
 * no request contract left to abuse: the body is not read at all.
 */
export const dynamic = 'force-dynamic';

const COPY = {
  unauthorized: 'Sign in first.',
  missing: 'No profile to send to.',
  failed: 'Could not send that right now. Try again in a moment.'
} as const;

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' };

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: COPY.unauthorized }, { status: 401, headers: PRIVATE_HEADERS });
  }

  // notify_email is readable by the service role only, and the recipient is the
  // caller's own stored address. Nothing from the request influences either.
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('name, notify_email')
    .eq('id', user.id)
    .maybeSingle();

  const profile = data as { name: string; notify_email: string | null } | null;

  if (error || !profile?.notify_email) {
    return NextResponse.json({ error: COPY.missing }, { status: 404, headers: PRIVATE_HEADERS });
  }

  try {
    await sendWelcome(profile.notify_email, profile.name);
  } catch {
    return NextResponse.json({ error: COPY.failed }, { status: 503, headers: PRIVATE_HEADERS });
  }

  return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
}
