import { createClient } from '@supabase/supabase-js';

// Anonymous, cookie-free client for PUBLIC data on cacheable pages
// (neighborhood pages, sitemap). Because it never touches cookies, Next.js can
// statically cache pages that use it. It sees only what RLS allows anon to see.
// Deliberately untyped: the generated Database types infer `never` rows (known
// repo issue) and this client only reads public tables.
export const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
