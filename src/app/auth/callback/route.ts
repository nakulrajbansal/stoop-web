import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { carriedNext, safeDestination, safeMode } from '@/lib/safe-redirect';

/**
 * Where Google and Apple come back to.
 *
 * This is the one route in the app that a stranger can aim a browser at, with
 * query parameters of their choosing, and expect a redirect out of the other
 * end. So it is treated like one: the only destinations it will ever emit are
 * built by src/lib/safe-redirect.ts, on the origin this request actually
 * arrived on.
 *
 * It does three things and stops. Exchange the code for a session, ask whether
 * this person already has a profile, and send them either where they were going
 * or back to /auth to finish making one. It creates nothing. Account creation
 * is POST /api/profile, which is the only caller of the service-role function,
 * and having a second writer here would mean two places to keep correct.
 *
 * Every failure lands on /auth with a fixed code from src/lib/auth-errors.ts.
 * Nothing the provider said is repeated back.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // The origin this deployment was actually reached on. Deliberately not
  // NEXT_PUBLIC_APP_URL: a preview tester bounced to production has
  // authenticated against the wrong database and will not find their account
  // when they come back.
  const origin = url.origin;

  // Sanitized once, here, and only these two values are ever put back into a
  // URL. A hostile `next` becomes an empty string and simply disappears rather
  // than riding along to the next screen.
  const next = carriedNext(url.searchParams.get('next'));
  const mode = safeMode(url.searchParams.get('mode'));

  const toAuth = (params: Record<string, string>) => {
    const to = new URL('/auth', origin);
    for (const [key, value] of Object.entries(params)) to.searchParams.set(key, value);
    if (mode === 'signin') to.searchParams.set('mode', mode);
    if (next) to.searchParams.set('next', next);
    return NextResponse.redirect(to, 303);
  };

  // The provider refused or the person pressed Cancel. Supabase forwards the
  // provider's own error text in the query string; none of it is read.
  if (url.searchParams.get('error') || url.searchParams.get('error_code')) {
    return toAuth({ err: 'denied' });
  }

  const code = url.searchParams.get('code');
  if (!code) return toAuth({ err: 'missing' });

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    // Stale, replayed, or a verifier that does not match the cookie.
    if (error || !data?.user) return toAuth({ err: 'exchange' });

    const { data: profile, error: readErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();

    // A failed read is not an absent profile. Guessing here would march an
    // established member back through signup and try to create a row they
    // already have.
    if (readErr) {
      console.error('auth callback: profile lookup failed');
      return toAuth({ err: 'server' });
    }

    if (profile) return NextResponse.redirect(new URL(safeDestination(next), origin), 303);

    // Signed in, no profile yet. The page is told which step to open on, so a
    // Google or Apple member never sees the phone field on the way past.
    return toAuth({ step: 'profile' });
  } catch {
    return toAuth({ err: 'server' });
  }
}
