/**
 * What the auth screen says when a provider round trip fails.
 *
 * A provider or GoTrue error is written for somebody reading a log: it names
 * the redirect URI, the project, sometimes the client id, and it is often just
 * "invalid request". None of that helps a person standing on a signup screen,
 * and some of it should not be on the page at all. So the callback route never
 * forwards what it was told. It maps the failure to one of these four codes,
 * and the code is the only thing that reaches the URL.
 *
 * Four, not more. Every extra code is a distinction a visitor is being asked to
 * care about, and the useful advice is the same in all of them: try again, or
 * come in another way. That advice is only true because there are three doors.
 */

export const AUTH_ERROR_CODES = ['denied', 'missing', 'exchange', 'server'] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

const COPY: Record<AuthErrorCode, string> = {
  /** They pressed Cancel, or the provider refused to hand anything over. */
  denied:
    'That sign in was cancelled before it finished, so no account was created. You can try again, or use your phone number instead.',
  /** Somebody reached the callback directly, or the round trip lost its way. */
  missing:
    'That link did not carry what we needed to sign you in. Start again from this screen and it will work.',
  /** The code was there and would not exchange: stale, reused, or expired. */
  exchange:
    'We could not finish signing you in. That link may have already been used, or it may have expired. Please try again.',
  /** Everything else, including our own side being down. */
  server:
    'Something on our side went wrong while signing you in. No account was created. Please try again in a moment.'
};

const KNOWN = new Set<string>(AUTH_ERROR_CODES);

/**
 * The line to show. Anything unrecognised, including whatever somebody pastes
 * into the query string, gets the general one: the parameter is never echoed.
 */
export function authErrorCopy(code: unknown): string {
  return typeof code === 'string' && KNOWN.has(code) ? COPY[code as AuthErrorCode] : COPY.server;
}
