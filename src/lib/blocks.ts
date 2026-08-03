import { supabaseAdmin } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

/**
 * Every user id in a block relationship (either direction) with the given user.
 *
 * Since migration 0008 the same rule is also a Row Level Security predicate, so
 * a blocked member cannot read around the API by talking to PostgREST or
 * Realtime directly. This helper stays because the routes still need the list
 * for things RLS cannot express as cheaply — filtering a feed query, and
 * answering 403 with a sentence instead of an empty result.
 *
 * Two things changed here, and both are about failing closed.
 *
 * The RPC used to be granted to `authenticated` and takes an arbitrary user id,
 * so any signed-in member could ask for anyone's block relationships — in both
 * directions, which includes who has blocked *them*, the one thing the product
 * promises is never visible. 0008 restricts EXECUTE to the service role, so the
 * lookup goes through the admin client. Every caller was already a server route
 * or a server component, so nothing loses a capability; the caller's own client
 * is no longer passed in because it can no longer run this.
 *
 * And a failed lookup used to return `[]`, which reads as "nobody is blocked".
 * A Supabase blip therefore un-blocked everyone for its duration: the feed
 * showed blocked members' plans and the join route let a blocked pair start a
 * conversation. It now throws, and the routes turn that into a retryable 503.
 */
export class BlockLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockLookupError';
  }
}

export async function getBlockedIds(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.rpc('blocked_user_ids', { for_user: userId });
  if (error) {
    console.error('block lookup failed:', error);
    throw new BlockLookupError(error.message);
  }
  return (data ?? []).map(row => row.other_id);
}

/**
 * The response a route sends when the block list could not be read. 503 rather
 * than 500: the request is worth retrying and nothing about it was wrong.
 */
export function blockLookupUnavailable(): NextResponse {
  return NextResponse.json(
    {
      error: 'Stoop could not check this just now. Try again in a moment.',
      code: 'block_lookup_unavailable'
    },
    { status: 503 }
  );
}
