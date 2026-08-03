import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Every user id in a block relationship (either direction) with the given user.
 *
 * Since migration 0008 the same rule is also a Row Level Security predicate, so
 * a blocked member cannot read around the API by talking to PostgREST or
 * Realtime directly. This helper stays because the routes still need the list
 * for things RLS cannot express as cheaply — filtering a feed query, and
 * answering 403 with a sentence instead of an empty result.
 */
export async function getBlockedIds(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase.rpc('blocked_user_ids', { for_user: userId });
  if (error || !data) return [];
  return data.map(row => row.other_id);
}
