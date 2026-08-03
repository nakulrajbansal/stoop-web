import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient as createCookieClient } from './server';
import { bearerFromRequest } from '@/lib/bearer';
import type { Database } from '@/types/database';

export type RouteAuth = {
  /** A Supabase client scoped to whoever is calling (RLS still applies). */
  supabase: SupabaseClient<Database>;
  /** The verified caller, or null when the request is anonymous. */
  user: User | null;
  /** Which credential the caller used. Useful for logging, never for trust. */
  via: 'bearer' | 'cookie';
  /**
   * Set when the caller supplied an Authorization header that is not a usable
   * bearer JWT. The request must fail 401 rather than quietly succeeding on
   * whatever cookies happened to ride along.
   */
  rejected?: 'malformed_authorization';
};

function anonymousClient(): SupabaseClient<Database> {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
  );
}

/**
 * One auth entry point for every API route.
 *
 * Browsers keep sending session cookies and behave exactly as before. Native
 * clients send `Authorization: Bearer <access token>`; that token is verified
 * against Supabase Auth on every request (no local decoding, no trusting the
 * client) and then used for the data queries, so Row Level Security evaluates
 * with the real `auth.uid()`.
 *
 * Cookie auth is reached only when NO Authorization header was sent. A header
 * that is present but unusable is a rejection, never a downgrade.
 *
 * Service-role credentials are never involved here. Routes that need to bypass
 * RLS keep using `@/lib/supabase/admin` AFTER checking ownership, exactly as
 * they did before.
 */
export async function getRouteAuth(req?: Request): Promise<RouteAuth> {
  const parsed = req ? bearerFromRequest(req) : ({ kind: 'absent' } as const);

  if (parsed.kind === 'malformed') {
    return { supabase: anonymousClient(), user: null, via: 'bearer', rejected: 'malformed_authorization' };
  }

  if (parsed.kind === 'token') {
    const supabase = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${parsed.token}` } }
      }
    );
    // getUser(token) round-trips to Supabase Auth, so a forged or expired
    // token fails here rather than silently passing through.
    const { data, error } = await supabase.auth.getUser(parsed.token);
    return { supabase, user: error ? null : (data?.user ?? null), via: 'bearer' };
  }

  const supabase = (await createCookieClient()) as unknown as SupabaseClient<Database>;
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data?.user ?? null, via: 'cookie' };
}

/**
 * The 401 body every route sends. Shared so a malformed header and a missing
 * session are indistinguishable to the caller.
 */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * `null` when the caller is a verified user, otherwise the response to return.
 * Collapses "malformed Authorization" and "no session" into the same 401.
 */
export function requireUser(auth: RouteAuth): NextResponse | null {
  if (auth.rejected || !auth.user) return unauthorized();
  return null;
}
