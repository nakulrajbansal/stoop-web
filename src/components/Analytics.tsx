'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import { analyticsBeforeSend, classifyRoute } from '@/lib/analytics-policy';
import { REFERRER_SAFE_FLAG, isSafeReferrerValue } from '@/lib/referrer-shim';

/**
 * Vercel Web Analytics, wired so it can only ever be handed a constant, and
 * only mounted once the inbound referrer has been provably clamped.
 *
 * ---- What reaches the script, and how it is bounded ----
 *
 * The stock @vercel/analytics/next component computes the route itself and
 * sends the real pathname alongside it, which on Stoop means shipping plan
 * slugs (the plan text), conversation ids and admin paths to a third party.
 * This uses the plain React component instead and supplies both values, so the
 * only strings that reach the script come from the allowlist in
 * lib/analytics-policy.
 *
 * Two details of the SDK matter here:
 *
 *  - Passing a defined `route` makes it set disableAutoTrack, so the script
 *    stops deriving paths from pushState navigations on its own. We always pass
 *    a defined value to keep that switch on.
 *  - It only emits a pageview when `route` and `path` are both truthy. On a
 *    private page we pass the empty string: still defined, so auto-tracking
 *    stays off, but falsy, so nothing is sent at all.
 *
 * `beforeSend` is the backstop for anything the script decides to report by
 * itself; it rewrites or cancels the event.
 *
 * ---- The referrer gate ----
 *
 * The URL is not the whole story. The remote script reads `document.referrer`
 * on its own and forwards it as `r` on a cross-host first pageview, before any
 * hook of ours runs, so `beforeSend` cannot cancel it and our own
 * Referrer-Policy header cannot shorten it (that header governs referrers we
 * send, not ones we receive). lib/referrer-shim is server-rendered inline into
 * <head> and clamps the value to '' or a bare origin before anything hydrates.
 *
 * This component will not render the SDK until it has confirmed, on the client,
 * that the shim ran and that what is readable now satisfies the same contract.
 * The check is deliberately duplicated rather than trusted: the flag says the
 * shim believed it succeeded, and the second read says it is still true at
 * mount time.
 *
 * Because @vercel/analytics only creates its <script> element from inside a
 * useEffect, returning null here means no tag is appended, no request is made,
 * and the remote script never runs. Every failure path (property definition,
 * parsing, read-back, hydration, ordering) lands on that same null, which is
 * the point: analytics is the thing that gives way.
 */
export default function Analytics() {
  const pathname = usePathname();
  const [referrerSafe, setReferrerSafe] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    // The flag is set by the inline shim only after it read the property back.
    if ((window as unknown as Record<string, unknown>)[REFERRER_SAFE_FLAG] !== true) return;
    // And it still has to hold right now, at the moment we would mount.
    if (!isSafeReferrerValue(document.referrer)) return;
    setReferrerSafe(true);
  }, []);

  if (!referrerSafe) return null;

  const route = classifyRoute(pathname) ?? '';

  return <VercelAnalytics route={route} path={route} beforeSend={analyticsBeforeSend} />;
}
