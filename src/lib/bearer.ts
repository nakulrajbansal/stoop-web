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
 * Three outcomes, not two. The distinction matters:
 *
 *   absent    - no Authorization header at all. A browser request; cookie auth
 *               is correct and expected.
 *   malformed - an Authorization header was supplied and is not a usable
 *               bearer JWT. Falling back to cookies here would let a request
 *               that presented a bad credential succeed on an ambient one,
 *               which is how CSRF-ish confusion gets in. It fails 401.
 *   token     - a well-formed bearer JWT, still to be verified upstream.
 */
export type BearerParse =
  | { kind: 'absent' }
  | { kind: 'malformed' }
  | { kind: 'token'; token: string };

export function parseAuthorizationHeader(header: string | null | undefined): BearerParse {
  if (header === null || header === undefined) return { kind: 'absent' };

  const trimmed = header.trim();
  // An empty header value is indistinguishable from not sending one.
  if (trimmed === '') return { kind: 'absent' };

  const match = /^Bearer[ \t]+(\S+)$/i.exec(trimmed);
  if (!match) return { kind: 'malformed' };

  const token = match[1];
  if (!JWT_SHAPE.test(token)) return { kind: 'malformed' };

  return { kind: 'token', token };
}

/**
 * The token, or null when there is no usable one. Callers that need to tell
 * "absent" from "malformed" use `parseAuthorizationHeader` directly.
 */
export function parseBearerToken(header: string | null | undefined): string | null {
  const parsed = parseAuthorizationHeader(header);
  return parsed.kind === 'token' ? parsed.token : null;
}

/** Convenience wrapper for a fetch Request / NextRequest. */
export function bearerFromRequest(req: { headers: Headers } | Request): BearerParse {
  return parseAuthorizationHeader(req.headers.get('authorization'));
}

export function bearerTokenFromRequest(req: { headers: Headers } | Request): string | null {
  return parseBearerToken(req.headers.get('authorization'));
}
