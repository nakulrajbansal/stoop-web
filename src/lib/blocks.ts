import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Block relationships, in both directions, for one user.
 *
 * Two entry points on purpose. A browsing surface that cannot resolve blocks
 * should still render the feed, because failing the whole page closed would be
 * a worse outcome than a momentarily unfiltered list of public plans. The
 * private roster is the opposite: it names people who agreed to meet, so if
 * the lookup cannot answer, it must not proceed as though nobody is blocked.
 */
export type BlockLookup = { ok: true; ids: string[] } | { ok: false; error: string };

/** The strict form. Callers that must fail closed use this one. */
export async function getBlockedIdsResult(supabase: SupabaseClient, userId: string): Promise<BlockLookup> {
  try {
    const { data, error } = await supabase.rpc('blocked_user_ids', { for_user: userId });
    if (error) return { ok: false, error: error.message ?? 'Block lookup failed' };
    if (!data) return { ok: false, error: 'Block lookup returned nothing' };
    return { ok: true, ids: (data as { other_id: string }[]).map(r => r.other_id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Block lookup failed' };
  }
}

/** Returns the set of user IDs in a block relationship (either direction) with the given user. */
export async function getBlockedIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const result = await getBlockedIdsResult(supabase, userId);
  return result.ok ? result.ids : [];
}
