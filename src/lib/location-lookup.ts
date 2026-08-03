/**
 * A missing row and a failed query are different answers, and /api/me was
 * collapsing them.
 *
 * The route reads the caller's city and neighborhood with `maybeSingle()`,
 * which returns `{ data: null }` for "no such row" and `{ error }` for "the
 * query did not run". Only `data` was read, so a database failure became a 200
 * with `city: null` — and the app showed a fully signed-up member as having no
 * neighborhood, which is exactly the mistake the `needsProfile` handling above
 * it was already fixed for.
 *
 * Lives here rather than in the route because a Next.js route module may export
 * nothing but its handlers.
 */

export type LookupResult = { data?: unknown; error: { message?: string } | null };

/** The first error among the results, or null when every one of them ran. */
export function locationLookupFailed(...results: LookupResult[]): string | null {
  for (const result of results) {
    if (result?.error) return result.error.message ?? 'lookup failed';
  }
  return null;
}
