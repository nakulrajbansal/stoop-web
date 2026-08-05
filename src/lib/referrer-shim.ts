/**
 * Inbound referrer containment.
 *
 * Why this exists: the route allowlist in lib/analytics-policy controls the URL
 * the Vercel script reports. It does not control the referrer. The script reads
 * `document.referrer` itself, on its own, and forwards it as the `r` field on a
 * cross-host first pageview. That read happens inside the remote script, before
 * anything we hand it, so `beforeSend` never sees it and cannot cancel it.
 *
 * `Referrer-Policy: strict-origin` on our own responses only governs referrers
 * we SEND. An inbound referrer is chosen by whoever linked to us: a site running
 * `unsafe-url` hands us its full URL, path and query included, and no response
 * header of ours can shorten it after the fact.
 *
 * So the value is clamped at the source instead. This module holds the inline
 * script that redefines `document.referrer` before any analytics code can run,
 * plus the validator the client gate uses. What a script can read afterwards is
 * one of exactly two things:
 *
 *   - the empty string, or
 *   - a bare HTTP(S) origin (scheme + host + optional port)
 *
 * never a path, query, fragment, embedded credentials, or a non-HTTP scheme.
 *
 * The design is fail closed. The shim sets REFERRER_SAFE_FLAG only after it has
 * read the property back and confirmed the clamp took. If defining the property
 * throws, if the referrer will not parse, if the read-back disagrees, or if the
 * flag simply is not there when the client looks, `components/Analytics` renders
 * nothing, no script tag is created, and no request to the analytics endpoint is
 * ever made. Losing analytics is the acceptable failure; leaking a referrer is
 * not.
 */

/** Set on `window` by the inline shim, and only after read-back verification. */
export const REFERRER_SAFE_FLAG = '__stoopReferrerSafe';

/**
 * A bare origin and nothing else: scheme, host, optional port. No path (so no
 * trailing slash either), no query, no fragment, no `user:pass@`, no backslash
 * or whitespace smuggling a second component past a naive parser.
 */
const BARE_ORIGIN = /^https?:\/\/[^/\\?#@\s]+$/;

/**
 * The contract the client gate enforces before it will mount analytics. Empty
 * is the safe default; anything else has to be a bare origin.
 */
export function isSafeReferrerValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  return BARE_ORIGIN.test(value);
}

export type ReferrerSanitizeResult = {
  /** What `document.referrer` should read as: '' or a bare origin. */
  value: string;
  /**
   * Whether the clamp is provably correct. False means something we could not
   * reason about, so the flag is withheld and analytics stays off for the page.
   */
  ok: boolean;
};

/**
 * The reference implementation of what the inline shim does, in TypeScript so
 * it can be tested directly. The shim below is a hand-inlined ES5 copy of this;
 * referrer-shim.test.ts executes the real shim source and asserts the two agree
 * on every input, so they cannot drift.
 *
 * An unparseable non-empty referrer is treated as a failure rather than quietly
 * coerced to '': if we cannot parse it we cannot claim to have understood it,
 * and the fail-closed direction is to withhold the flag.
 */
export function sanitizeReferrer(raw: unknown): ReferrerSanitizeResult {
  if (typeof raw !== 'string' || raw === '') return { value: '', ok: true };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { value: '', ok: false };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { value: '', ok: true };
  if (!url.host) return { value: '', ok: true };
  if (url.username || url.password) return { value: '', ok: true };

  const origin = `${url.protocol}//${url.host}`;
  if (!isSafeReferrerValue(origin)) return { value: '', ok: false };

  return { value: origin, ok: true };
}

/**
 * The script that is server-rendered inline, ahead of everything else, so it
 * runs while the document is still parsing and long before React hydrates or
 * the analytics SDK injects its script tag.
 *
 * String.raw keeps the backslashes in the regex literal intact through the
 * template. Two constraints on edits here: it must stay valid ES5 (it runs
 * before any transpiled bundle), and it must never contain the closing script
 * sequence, since it is inlined into the document.
 *
 * Running twice is harmless: the second pass reads the already-clamped bare
 * origin and produces the same bare origin.
 */
export const REFERRER_SHIM_SOURCE = String.raw`(function () {
  var value = '';
  var ok = false;
  try {
    var raw = '';
    try { raw = document.referrer || ''; } catch (e) { raw = ''; }

    if (!raw) {
      ok = true;
    } else {
      try {
        var url = new URL(raw);
        var scheme = url.protocol === 'https:' || url.protocol === 'http:';
        if (scheme && url.host && !url.username && !url.password) {
          value = url.protocol + '//' + url.host;
        }
        ok = true;
      } catch (e) {
        value = '';
        ok = false;
      }
    }

    if (value !== '' && !/^https?:\/\/[^/\\?#@\s]+$/.test(value)) {
      value = '';
      ok = false;
    }

    Object.defineProperty(document, 'referrer', {
      configurable: true,
      get: function () { return value; }
    });

    if (document.referrer !== value) return;
    if (!ok) return;
    window['__stoopReferrerSafe'] = true;
  } catch (e) {
    /* leave the flag unset: no flag means no analytics */
  }
})();`;
