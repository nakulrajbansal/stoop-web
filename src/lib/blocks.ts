import type { SupabaseClient } from '@supabase/supabase-js';

/** Returns the set of user IDs in a block relationship (either direction) with the given user. */
export async function getBlockedIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('blocked_user_ids', { for_user: userId });
  if (error || !data) return [];
  return (data as { other_id: string }[]).map(r => r.other_id);
}