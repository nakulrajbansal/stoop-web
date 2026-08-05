import { CITY_NEIGHBORHOODS } from '@/lib/neighborhoods';

/**
 * What Vercel Web Analytics is allowed to receive.
 *
 * Why this exists: plan slugs are generated from the plan text itself (see
 * slugify in lib/utils), so a URL like /plan/going-to-the-farmers-market-abc1
 * IS the user's content. Inbox URLs carry conversation ids, /auth carries the
 * destination the visitor was heading to, and the admin pages are private.
 * Handing any of that to a third party is not something a noticeboard should do.
 *
 * The rule here is an allowlist, not a blocklist: a path is reported only when
 * it maps to a route token in ALLOWED_ROUTE_TOKENS below. Anything unrecognised
 * is dropped. A new private route is therefore invisible to analytics by
 * default, which is the failure direction we want.
 *
 * Every token is a compile-time constant. No value derived from user input,
 * from a query string, or from a database row can ever become one.
 */

/** Every reported URL is rebuilt against this origin, so the real host, query and hash are discarded. */
export const ANALYTICS_ORIGIN = 'https://www.stoop.house';

/** Public pages that are byte-identical for every visitor. */
const STATIC_ROUTES = [
  '/',
  '/feed',
  '/post',
  '/terms',
  '/guides/how-to-make-friends-in-nyc',
  '/guides/how-to-make-friends-in-austin'
] as const;

/**
 * Plan pages are public and worth counting, but the slug is the plan text.
 * They collapse to this one constant so the reach is countable and the content
 * never leaves the browser.
 */
const PLAN_ROUTE_TOKEN = '/plan/[slug]';

/**
 * City and neighborhood directory pages. Built from the compile-time
 * neighborhood table, so the set is closed: no plan, profile or message can
 * ever add a member.
 */
function buildPlaceRoutes(): string[] {
  const routes: string[] = [];
  for (const [city, hoods] of Object.entries(CITY_NEIGHBORHOODS)) {
    routes.push(`/${city}`);
    for (const hood of hoods) routes.push(`/${city}/${hood.slug}`);
  }
  return routes;
}

const PLACE_ROUTES = buildPlaceRoutes();

/**
 * The closed set of strings this module may ever emit. Tests assert that every
 * classifyRoute result is a member, which is the actual privacy guarantee:
 * whatever arrives, the output is one of these or nothing.
 */
export const ALLOWED_ROUTE_TOKENS: readonly string[] = Object.freeze([
  ...STATIC_ROUTES,
  ...PLACE_ROUTES,
  PLAN_ROUTE_TOKEN
]);

const ALLOWED_LOOKUP = new Set<string>([...STATIC_ROUTES, ...PLACE_ROUTES]);

/**
 * Route classes that must never be reported, kept as readable documentation and
 * as the subject of the regression tests. Classification does not consult this
 * list: it denies by default, so these are already excluded. Listing them means
 * a test fails loudly if the allowlist ever grows to cover one by accident.
 */
export const SENSITIVE_ROUTE_PREFIXES: readonly string[] = Object.freeze([
  '/admin',
  '/api',
  '/auth',
  '/followup',
  '/inbox',
  '/my-plans',
  '/profile',
  '/report',
  '/unsubscribe'
]);

/** Strip a single trailing slash so /feed/ and /feed are the same page. */
function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

/**
 * Map a pathname to the route token that may be reported, or null to report
 * nothing at all. Query strings and fragments are not accepted here; callers
 * pass a pathname, and sanitizeAnalyticsUrl discards the rest before calling.
 */
export function classifyRoute(pathname: string | null | undefined): string | null {
  if (!pathname || !pathname.startsWith('/')) return null;
  // A path containing ? or # has not been through URL parsing; refuse it rather
  // than guess where the private part starts.
  if (pathname.includes('?') || pathname.includes('#')) return null;

  const path = normalizePathname(pathname);

  if (ALLOWED_LOOKUP.has(path)) return path;

  // /plan/<slug> only. /plan/<slug>/edit is the owner's editor, and anything
  // deeper is not a real route: both fall through to null.
  const segments = path.split('/');
  if (segments.length === 3 && segments[1] === 'plan' && segments[2].length > 0) {
    return PLAN_ROUTE_TOKEN;
  }

  return null;
}

/**
 * Rebuild a URL as something safe to report, or null to drop the event.
 *
 * The output is always ANALYTICS_ORIGIN plus a constant token. The incoming
 * host, port, query and fragment are read and thrown away, so /auth?next=/plan/
 * my-real-plan-text cannot survive even in part.
 */
export function sanitizeAnalyticsUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;

  let pathname: string;
  try {
    pathname = new URL(rawUrl, ANALYTICS_ORIGIN).pathname;
  } catch {
    return null;
  }

  const route = classifyRoute(pathname);
  if (!route) return null;

  return route === '/' ? `${ANALYTICS_ORIGIN}/` : `${ANALYTICS_ORIGIN}${route}`;
}

type AnalyticsEvent = { type: 'pageview' | 'event'; url: string };

/**
 * Last line of defence, handed to the Vercel script as its beforeSend hook.
 *
 * The integration already feeds the script nothing but constants, so in normal
 * operation this only ever sees a token it will pass straight through. It
 * matters if the script ever falls back to reading location.href itself: that
 * event gets rewritten to a token, or dropped.
 */
export function analyticsBeforeSend<T extends AnalyticsEvent>(event: T): T | null {
  const url = sanitizeAnalyticsUrl(event?.url);
  if (!url) return null;
  return { ...event, url };
}
