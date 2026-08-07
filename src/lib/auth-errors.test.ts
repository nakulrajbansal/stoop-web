/**
 * What the auth screen is allowed to say when a provider round trip fails.
 *
 * A provider error message is written for a developer reading a log, not for
 * somebody standing on a signup screen: it names the project, the redirect URI,
 * sometimes the client id. None of that helps, and some of it should not be on
 * the page at all. So the callback route never forwards what it was told. It
 * maps the failure to one of a fixed set of codes, and the code is the only
 * thing that reaches the URL.
 */
import { describe, it, expect } from 'vitest';
import { AUTH_ERROR_CODES, authErrorCopy } from './auth-errors';

describe('the fixed set', () => {
  it('covers denial, a missing code, a failed exchange and everything else', () => {
    expect([...AUTH_ERROR_CODES].sort()).toEqual(['denied', 'exchange', 'missing', 'server'].sort());
  });

  it('says something plain and useful for every code', () => {
    for (const code of AUTH_ERROR_CODES) {
      const copy = authErrorCopy(code);
      expect(copy.length).toBeGreaterThan(20);
      expect(copy).not.toMatch(/\u2014/);
    }
  });

  it('never names a provider internal, a URI, a token or a project', () => {
    for (const code of AUTH_ERROR_CODES) {
      const copy = authErrorCopy(code);
      expect(copy).not.toMatch(/redirect_uri|client_id|supabase|oauth|pkce|token|jwt|http|\.co/i);
    }
  });

  it('tells somebody whose provider round trip failed what to do instead', () => {
    // The whole point of three doors: one failing is not the end of signup.
    expect(authErrorCopy('denied')).toMatch(/phone|again/i);
    expect(authErrorCopy('exchange')).toMatch(/again/i);
  });

  it('answers an unknown code with the general one rather than throwing or echoing it', () => {
    const injected = '<img src=x onerror=alert(1)>';
    expect(authErrorCopy(injected)).toBe(authErrorCopy('server'));
    expect(authErrorCopy(injected)).not.toMatch(/img|onerror/);
    expect(authErrorCopy(null)).toBe(authErrorCopy('server'));
    expect(authErrorCopy(undefined)).toBe(authErrorCopy('server'));
  });
});
