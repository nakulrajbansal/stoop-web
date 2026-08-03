import { describe, expect, it } from 'vitest';
import { bearerFromRequest, bearerTokenFromRequest, parseAuthorizationHeader, parseBearerToken } from './bearer';

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLWhlcmU';

describe('parseBearerToken', () => {
  it('extracts a well-formed bearer JWT', () => {
    expect(parseBearerToken(`Bearer ${JWT}`)).toBe(JWT);
  });

  it('accepts any capitalization of the scheme and surrounding whitespace', () => {
    expect(parseBearerToken(`  bearer   ${JWT}  `)).toBe(JWT);
    expect(parseBearerToken(`BEARER\t${JWT}`)).toBe(JWT);
  });

  it('returns null when the header is missing or empty', () => {
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken('')).toBeNull();
    expect(parseBearerToken('   ')).toBeNull();
  });

  it('rejects other auth schemes', () => {
    expect(parseBearerToken(`Basic ${JWT}`)).toBeNull();
    expect(parseBearerToken(JWT)).toBeNull();
    expect(parseBearerToken(`Bearer2 ${JWT}`)).toBeNull();
  });

  it('rejects anything that is not shaped like a JWT', () => {
    expect(parseBearerToken('Bearer not-a-jwt')).toBeNull();
    expect(parseBearerToken('Bearer a.b')).toBeNull();
    expect(parseBearerToken('Bearer a.b.c.d')).toBeNull();
    expect(parseBearerToken('Bearer <script>alert(1)</script>')).toBeNull();
  });

  it('rejects a token with a header-injection attempt in it', () => {
    expect(parseBearerToken(`Bearer ${JWT}\r\nX-Evil: 1`)).toBeNull();
  });

  it('rejects a service-role-looking header that carries extra parameters', () => {
    expect(parseBearerToken(`Bearer ${JWT} extra`)).toBeNull();
  });
});

describe('bearerTokenFromRequest', () => {
  it('reads the header case-insensitively', () => {
    const req = new Request('https://stoop.house/api/plans', {
      headers: { Authorization: `Bearer ${JWT}` },
    });
    expect(bearerTokenFromRequest(req)).toBe(JWT);
  });

  it('returns null for a browser request with only cookies', () => {
    const req = new Request('https://stoop.house/api/plans', {
      headers: { cookie: 'sb-access-token=whatever' },
    });
    expect(bearerTokenFromRequest(req)).toBeNull();
  });
});

/**
 * The distinction the routes act on. "No header" and "a header I cannot use"
 * used to collapse into the same null, so a request that presented a broken
 * credential fell through to whatever cookies it happened to carry.
 */
describe('parseAuthorizationHeader', () => {
  it('reports a well-formed bearer JWT as a token', () => {
    expect(parseAuthorizationHeader(`Bearer ${JWT}`)).toEqual({ kind: 'token', token: JWT });
  });

  it('reports a missing or blank header as absent, so cookie auth stays available to the web', () => {
    expect(parseAuthorizationHeader(null)).toEqual({ kind: 'absent' });
    expect(parseAuthorizationHeader(undefined)).toEqual({ kind: 'absent' });
    expect(parseAuthorizationHeader('')).toEqual({ kind: 'absent' });
    expect(parseAuthorizationHeader('    ')).toEqual({ kind: 'absent' });
  });

  it('reports every unusable header as malformed rather than absent', () => {
    for (const header of [
      'Bearer',
      'Bearer ',
      'Bearer not-a-jwt',
      'Bearer a.b',
      'Bearer a.b.c.d',
      `Bearer ${JWT} extra`,
      `Bearer ${JWT}\r\nX-Evil: 1`,
      `Basic ${JWT}`,
      `Bearer2 ${JWT}`,
      JWT,
      'Bearer null',
      'Bearer undefined',
      'Bearer <script>alert(1)</script>',
    ]) {
      expect(parseAuthorizationHeader(header), header).toEqual({ kind: 'malformed' });
    }
  });

  it('treats an expired-but-well-formed token as a token; expiry is Supabase\'s call, not the parser\'s', () => {
    // Shape is all this layer can judge. getUser() rejects it upstream.
    const expired = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.c2ln';
    expect(parseAuthorizationHeader(`Bearer ${expired}`)).toEqual({ kind: 'token', token: expired });
  });
});

describe('bearerFromRequest', () => {
  it('flags a malformed header on a request that also carries cookies', () => {
    const req = new Request('https://stoop.house/api/plans', {
      headers: { authorization: 'Bearer garbage', cookie: 'sb-access-token=whatever' },
    });
    expect(bearerFromRequest(req)).toEqual({ kind: 'malformed' });
  });

  it('reports absent for a cookie-only browser request', () => {
    const req = new Request('https://stoop.house/api/plans', {
      headers: { cookie: 'sb-access-token=whatever' },
    });
    expect(bearerFromRequest(req)).toEqual({ kind: 'absent' });
  });
});
