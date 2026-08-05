import { describe, expect, it } from 'vitest';
import {
  REFERRER_SAFE_FLAG,
  REFERRER_SHIM_SOURCE,
  isSafeReferrerValue,
  sanitizeReferrer
} from './referrer-shim';

/**
 * These tests cover the sanitization rule and the fail-closed contract as pure
 * logic, and they execute the real inlined shim source against a stub document
 * so the shipped string cannot drift from the TypeScript reference.
 *
 * What they deliberately do NOT prove: that the shim wins the race against the
 * analytics script in a real browser. That is a question of document order and
 * of when the SDK injects its tag, and no unit test in Node can answer it. What
 * makes the ordering safe is structural, not tested here: the shim is inlined in
 * <head> by the server, and @vercel/analytics only creates its script element
 * from inside a useEffect, which cannot run until hydration.
 */

/** Run the real shim string with a stubbed window and document. */
function runShim(doc: Record<string, unknown>, win: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function('window', 'document', REFERRER_SHIM_SOURCE);
  fn(win, doc);
  return { doc, win };
}

const PRIVATE_PATH = '/plan/going-to-the-farmers-market-saturday-morning-ab12';

describe('isSafeReferrerValue', () => {
  it('accepts empty and bare origins only', () => {
    expect(isSafeReferrerValue('')).toBe(true);
    expect(isSafeReferrerValue('https://example.com')).toBe(true);
    expect(isSafeReferrerValue('http://example.com')).toBe(true);
    expect(isSafeReferrerValue('https://example.com:8443')).toBe(true);
    expect(isSafeReferrerValue('https://news.ycombinator.com')).toBe(true);
  });

  it('rejects anything carrying a path, query, fragment or credentials', () => {
    expect(isSafeReferrerValue('https://example.com/')).toBe(false);
    expect(isSafeReferrerValue(`https://example.com${PRIVATE_PATH}`)).toBe(false);
    expect(isSafeReferrerValue('https://example.com?q=1')).toBe(false);
    expect(isSafeReferrerValue('https://example.com#frag')).toBe(false);
    expect(isSafeReferrerValue('https://user:pass@example.com')).toBe(false);
    expect(isSafeReferrerValue('https://example.com\\evil')).toBe(false);
    expect(isSafeReferrerValue('https://example.com evil')).toBe(false);
  });

  it('rejects non-HTTP schemes and non-strings', () => {
    expect(isSafeReferrerValue('android-app://com.reddit.frontpage')).toBe(false);
    expect(isSafeReferrerValue('javascript:alert(1)')).toBe(false);
    expect(isSafeReferrerValue('data:text/html,x')).toBe(false);
    expect(isSafeReferrerValue('file:///Users/someone/notes.txt')).toBe(false);
    expect(isSafeReferrerValue(null)).toBe(false);
    expect(isSafeReferrerValue(undefined)).toBe(false);
    expect(isSafeReferrerValue(123)).toBe(false);
  });
});

describe('sanitizeReferrer', () => {
  it('keeps the bare origin and drops everything after the host', () => {
    expect(sanitizeReferrer(`https://example.com${PRIVATE_PATH}?utm=x#top`)).toEqual({
      value: 'https://example.com',
      ok: true
    });
    expect(sanitizeReferrer('https://www.google.com/search?q=stoop+house')).toEqual({
      value: 'https://www.google.com',
      ok: true
    });
    expect(sanitizeReferrer('http://localhost:3000/inbox/8f14e45f')).toEqual({
      value: 'http://localhost:3000',
      ok: true
    });
  });

  it('never lets the referrer path reach the output', () => {
    const out = sanitizeReferrer(`https://old.reddit.com/r/nyc/comments/abc${PRIVATE_PATH}`);
    expect(out.value).toBe('https://old.reddit.com');
    expect(out.value).not.toContain('farmers');
    expect(out.value).not.toContain('/r/nyc');
  });

  it('empties a referrer with credentials rather than forwarding them', () => {
    expect(sanitizeReferrer('https://user:pass@example.com/x')).toEqual({ value: '', ok: true });
    expect(sanitizeReferrer('https://user@example.com/x')).toEqual({ value: '', ok: true });
  });

  it('empties a non-HTTP scheme', () => {
    expect(sanitizeReferrer('android-app://com.reddit.frontpage')).toEqual({ value: '', ok: true });
    expect(sanitizeReferrer('file:///Users/someone/notes.txt')).toEqual({ value: '', ok: true });
    expect(sanitizeReferrer('data:text/html,<b>x</b>')).toEqual({ value: '', ok: true });
  });

  it('treats an absent referrer as safe, which is the common case', () => {
    expect(sanitizeReferrer('')).toEqual({ value: '', ok: true });
    expect(sanitizeReferrer(null)).toEqual({ value: '', ok: true });
    expect(sanitizeReferrer(undefined)).toEqual({ value: '', ok: true });
  });

  it('fails closed on something it cannot parse', () => {
    expect(sanitizeReferrer('not a url at all')).toEqual({ value: '', ok: false });
    expect(sanitizeReferrer('://missing-scheme')).toEqual({ value: '', ok: false });
  });

  it('only ever returns a value the client gate would accept', () => {
    const inputs = [
      '',
      'https://example.com/a/b/c?d=e#f',
      'https://user:pass@example.com/x',
      'android-app://com.reddit.frontpage',
      'not a url at all',
      'https://xn--80ak6aa92e.com/path',
      `https://example.com${PRIVATE_PATH}`,
      'http://192.168.1.9:8080/admin',
      'https://[2001:db8::1]:443/secret'
    ];
    for (const input of inputs) {
      const { value } = sanitizeReferrer(input);
      expect(isSafeReferrerValue(value), `${input} produced ${value}`).toBe(true);
    }
  });
});

describe('REFERRER_SHIM_SOURCE', () => {
  it('cannot break out of the inline script element', () => {
    expect(REFERRER_SHIM_SOURCE.toLowerCase()).not.toContain('</script');
  });

  it('clamps a full inbound URL to its origin and flags success', () => {
    const { doc, win } = runShim({ referrer: `https://example.com${PRIVATE_PATH}?utm=x#top` });
    expect(doc.referrer).toBe('https://example.com');
    expect(win[REFERRER_SAFE_FLAG]).toBe(true);
  });

  it('leaves an absent referrer empty and flags success', () => {
    const { doc, win } = runShim({ referrer: '' });
    expect(doc.referrer).toBe('');
    expect(win[REFERRER_SAFE_FLAG]).toBe(true);
  });

  it('empties a non-HTTP scheme and still flags success', () => {
    const { doc, win } = runShim({ referrer: 'android-app://com.reddit.frontpage' });
    expect(doc.referrer).toBe('');
    expect(win[REFERRER_SAFE_FLAG]).toBe(true);
  });

  it('withholds the flag when the referrer will not parse, and still empties it', () => {
    const { doc, win } = runShim({ referrer: 'not a url at all' });
    expect(doc.referrer).toBe('');
    expect(win[REFERRER_SAFE_FLAG]).toBeUndefined();
  });

  it('withholds the flag when the property cannot be redefined', () => {
    const doc = {};
    Object.defineProperty(doc, 'referrer', {
      value: `https://example.com${PRIVATE_PATH}`,
      configurable: false,
      writable: false
    });
    const win: Record<string, unknown> = {};
    runShim(doc as Record<string, unknown>, win);
    expect(win[REFERRER_SAFE_FLAG]).toBeUndefined();
  });

  it('withholds the flag when the read-back disagrees with the clamp', () => {
    // A document that accepts the definition but keeps handing back the original.
    const win: Record<string, unknown> = {};
    const hostile = new Proxy(
      { referrer: `https://example.com${PRIVATE_PATH}` },
      {
        defineProperty() {
          return true;
        },
        get(target, prop) {
          if (prop === 'referrer') return `https://example.com${PRIVATE_PATH}`;
          return Reflect.get(target, prop);
        }
      }
    );
    runShim(hostile as unknown as Record<string, unknown>, win);
    expect(win[REFERRER_SAFE_FLAG]).toBeUndefined();
  });

  it('agrees with the TypeScript reference on every input', () => {
    const inputs = [
      '',
      'https://example.com',
      'https://example.com/',
      `https://example.com${PRIVATE_PATH}?utm=x#top`,
      'http://example.com:8080/a?b=c',
      'https://user:pass@example.com/x',
      'android-app://com.reddit.frontpage',
      'javascript:alert(1)',
      'file:///Users/someone/notes.txt',
      'not a url at all',
      '://missing-scheme',
      'https://www.google.com/search?q=stoop'
    ];
    for (const input of inputs) {
      const expected = sanitizeReferrer(input);
      const { doc, win } = runShim({ referrer: input });
      expect(doc.referrer, `value for ${input}`).toBe(expected.value);
      expect(win[REFERRER_SAFE_FLAG], `flag for ${input}`).toBe(expected.ok ? true : undefined);
    }
  });

  it('is idempotent, so a double injection cannot widen the value', () => {
    const doc: Record<string, unknown> = { referrer: 'https://example.com/deep/path?q=1' };
    const win: Record<string, unknown> = {};
    runShim(doc, win);
    runShim(doc, win);
    expect(doc.referrer).toBe('https://example.com');
    expect(win[REFERRER_SAFE_FLAG]).toBe(true);
  });
});
