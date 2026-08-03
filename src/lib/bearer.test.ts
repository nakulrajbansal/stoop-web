import { describe, expect, it } from 'vitest';
import { bearerTokenFromRequest, parseBearerToken } from './bearer';

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
