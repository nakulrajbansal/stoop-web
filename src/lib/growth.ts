export const ATTRIBUTION_KEYS = [
  'src',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];
export type Attribution = Partial<Record<AttributionKey, string>>;

const MAX_ATTRIBUTION_VALUE_LENGTH = 100;

function cleanAttributionValue(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim().slice(0, MAX_ATTRIBUTION_VALUE_LENGTH);
  return cleaned || null;
}

export function sanitizeAttribution(searchParams: URLSearchParams): Attribution | null {
  const attribution: Attribution = {};

  for (const key of ATTRIBUTION_KEYS) {
    const value = cleanAttributionValue(searchParams.get(key));
    if (value) attribution[key] = value;
  }

  return Object.keys(attribution).length > 0 ? attribution : null;
}

export function serializeAttributionCookie(attribution: Attribution): string {
  return encodeURIComponent(JSON.stringify(attribution));
}

export function readCookieValue(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key === name) return valueParts.join('=') || null;
  }
  return null;
}

export function parseAttributionCookie(value: string | null | undefined): Attribution | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const params = new URLSearchParams();
    for (const key of ATTRIBUTION_KEYS) {
      if (typeof parsed[key] === 'string') params.set(key, parsed[key]);
    }
    return sanitizeAttribution(params);
  } catch {
    return null;
  }
}

export function resolveRequestedNeighborhood(
  profileNeighborhoodId: string | null,
  requestedSlug: string | null | undefined,
  requestedNeighborhoodId: string | null,
): string {
  if (requestedSlug) {
    if (!requestedNeighborhoodId) throw new Error('Invalid neighborhood for your city');
    return requestedNeighborhoodId;
  }

  if (!profileNeighborhoodId) throw new Error('Neighborhood required');
  return profileNeighborhoodId;
}

export function normalizeInterestEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 254) return null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  return email;
}

const SUPPORTED_LAUNCH_AREAS = new Set(['mccarren-park', 'williamsburg', 'greenpoint']);

type InterestSubmission =
  | { kind: 'valid'; email: string; launchArea: string }
  | { kind: 'invalid' }
  | { kind: 'bot' };

export function parseInterestSubmission(body: unknown): InterestSubmission {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { kind: 'invalid' };
  const value = body as Record<string, unknown>;
  if (typeof value.website === 'string' && value.website.trim()) return { kind: 'bot' };

  const email = normalizeInterestEmail(value.email);
  const launchArea = typeof value.launchArea === 'string' ? value.launchArea.trim().toLowerCase() : '';
  if (!email || !SUPPORTED_LAUNCH_AREAS.has(launchArea)) return { kind: 'invalid' };

  return { kind: 'valid', email, launchArea };
}

export function buildTrackedShareUrl(rawUrl: string, source = 'host_share'): string {
  const url = new URL(rawUrl);
  url.searchParams.set('src', source);
  return url.toString();
}
