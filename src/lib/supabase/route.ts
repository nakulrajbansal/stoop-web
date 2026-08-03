import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createClient as createCookieClient } from './server';
import { bearerTokenFromRequest } from '@/lib/bearer';
import type { Database } from '@/types/database';

export type RouteAuth = {
  /** A Supabase client scoped to whoever is calling (RLS still applies). */
  supabase: SupabaseClient<Database>;
  /** The verified caller, or null when the request is anonymous. */
  user: User | null;
  /** Which credential the caller used. Useful for logging, never for trust. */
  via: 'bearer' | 'cookie';
};

/**
 * One auth entry point for every API route.
 *
 * Browsers keep sending session cookies and behave exactly as before. Native
 * clients send `Authorization: Bearer <access token>`; that token is verified
 * against Supabase Auth on every request (no local decoding, no trusting the
 * client) and then used for the data queries, so Row Level Security evaluates
 * with the real `auth.uid()`.
 *
 * Service-role credentials are never involved here. Routes that need to bypass
 * RLS keep using `@/lib/supabase/admin` AFTER checking ownership, exactly as
 * they did before.
 */
export async function getRouteAuth(req?: Request): Promise<RouteAuth> {
  const token = req ? bearerTokenFromRequest(req) : null;

  if (token) {
    const supabase = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${token}` } }
      }
    );
    // getUser(token) round-trips to Supabase Auth, so a forged or expired
    // token fails here rather than silently passing through.
    const { data, error } = await supabase.auth.getUser(token);
    return { supabase, user: error ? null : (data?.user ?? null), via: 'bearer' };
  }

  const supabase = (await createCookieClient()) as unknown as SupabaseClient<Database>;
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data?.user ?? null, via: 'cookie' };
}
