/**
 * Native clients (the iOS app) cannot send the browser's Supabase session
 * cookies, so they authenticate API routes with an
 * `Authorization: Bearer <supabase access token>` header instead.
 *
 * This module only parses the header. Verification happens in
 * `@/lib/supabase/route`, which hands the token to Supabase Auth. Keeping the
 * parsing pure means it can be tested without a network or a database.
 */

// A Supabase access token is a JWT: three base64url segments separated by dots.
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Pull the token out of an Authorization header value.
 * Returns null for anything that is not a well-formed bearer JWT, so a
 * malformed header falls back to cookie auth rather than half-authenticating.
 */
export function parseBearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer[ \t]+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  if (!JWT_SHAPE.test(token)) return null;
  return token;
}

/** Convenience wrapper for a fetch Request / NextRequest. */
export function bearerTokenFromRequest(req: { headers: Headers } | Request): string | null {
  return parseBearerToken(req.headers.get('authorization'));
}
