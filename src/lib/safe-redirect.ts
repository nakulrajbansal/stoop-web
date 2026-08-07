/**
 * Where auth is allowed to send somebody, decided once.
 *
 * There used to be one caller and the rule lived inline in the auth page. There
 * are now two: the page, and the server route Google and Apple return to. A
 * server route that redirects to whatever arrived in a query string is an open
 * redirect, and an open redirect on a sign-in screen is a good phishing hop,
 * because the link really does start at stoop.house and the visitor really is
 * mid-signup.
 *
 * The rule is an allowlist of the two destinations the product actually uses.
 * Not "reject the bad ones": there are too many spellings of off-site, and
 * `//evil.example`, `/\evil.example` and `%2f%2fevil.example` are three of them.
 * Anything that is not recognised lands on the feed.
 */

/** Where a finished signup goes when nothing else was asked for. */
export const DEFAULT_DESTINATION = '/feed';

/**
 * A plan slug as the app generates it: lowercase words and a short suffix.
 * Bounded, because the only thing an unbounded one buys is a long URL in a log.
 */
const PLAN_PATH = /^\/plan\/[a-z0-9-]{1,120}$/i;

/**
 * The path to send somebody to. Always an internal path, always one of three.
 * Safe to feed its own output back in.
 */
export function safeDestination(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_DESTINATION;
  const value = raw.trim();
  if (!value) return DEFAULT_DESTINATION;
  // 'post' is the token the composer parks in the URL; '/post' is what this
  // function answers with, so both spellings have to be understood.
  if (value === 'post' || value === '/post') return '/post';
  if (PLAN_PATH.test(value)) return value;
  return DEFAULT_DESTINATION;
}

/**
 * The same decision, expressed as the token to put back into a URL. Empty
 * string means "carry nothing", which is how a hostile value disappears
 * instead of being escorted through the next screen.
 */
export function carriedNext(raw: unknown): string {
  const destination = safeDestination(raw);
  if (destination === '/post') return 'post';
  if (destination.startsWith('/plan/')) return destination;
  return '';
}

/**
 * Which door the screen calls itself. It labels the page and does nothing else,
 * but it is still read out of a URL, so it is still narrowed to two words.
 */
export function safeMode(raw: unknown): 'signin' | 'signup' {
  return raw === 'signin' ? 'signin' : 'signup';
}
