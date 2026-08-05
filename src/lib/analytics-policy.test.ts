import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ROUTE_TOKENS,
  ANALYTICS_ORIGIN,
  SENSITIVE_ROUTE_PREFIXES,
  analyticsBeforeSend,
  classifyRoute,
  sanitizeAnalyticsUrl
} from './analytics-policy';

// A plan slug is built from the plan text, so this is what a real one looks
// like: the user's own words, straight in the URL.
const PLAN_SLUG = 'going-to-the-farmers-market-saturday-morning-ab12';
const CONVERSATION_ID = '8f14e45f-ceea-467a-9f37-9c2d0b0e2f7a';

describe('classifyRoute', () => {
  it('reports the public pages as themselves', () => {
    expect(classifyRoute('/')).toBe('/');
    expect(classifyRoute('/feed')).toBe('/feed');
    expect(classifyRoute('/post')).toBe('/post');
    expect(classifyRoute('/terms')).toBe('/terms');
    expect(classifyRoute('/guides/how-to-make-friends-in-nyc')).toBe('/guides/how-to-make-friends-in-nyc');
    expect(classifyRoute('/guides/how-to-make-friends-in-austin')).toBe('/guides/how-to-make-friends-in-austin');
  });

  it('reports city and neighborhood pages, which come from a compile-time table', () => {
    expect(classifyRoute('/nyc')).toBe('/nyc');
    expect(classifyRoute('/austin')).toBe('/austin');
    expect(classifyRoute('/nyc/williamsburg')).toBe('/nyc/williamsburg');
    expect(classifyRoute('/austin/east-austin')).toBe('/austin/east-austin');
  });

  it('collapses a plan page to a constant, so the plan text never leaves the browser', () => {
    const token = classifyRoute(`/plan/${PLAN_SLUG}`);
    expect(token).toBe('/plan/[slug]');
    expect(token).not.toContain('farmers');
    expect(token).not.toContain(PLAN_SLUG);
  });

  it('drops every route that can identify a person, a draft, or a conversation', () => {
    const private_ = [
      '/auth',
      `/auth?next=/plan/${PLAN_SLUG}`,
      '/auth?next=post',
      '/inbox',
      `/inbox/${CONVERSATION_ID}`,
      '/my-plans',
      '/profile',
      '/report',
      `/report?plan=${PLAN_SLUG}`,
      '/followup',
      '/followup?token=6f1a2b3c4d5e',
      '/unsubscribe',
      '/unsubscribe?email=someone%40example.com',
      '/admin',
      '/admin/metrics',
      '/admin/ops',
      '/admin/reports',
      `/plan/${PLAN_SLUG}/edit`,
      '/api/plans',
      '/api/messages',
      '/api/avatar'
    ];
    for (const path of private_) {
      expect(classifyRoute(path), `${path} must not be reported`).toBeNull();
    }
  });

  it('denies anything it does not recognise rather than guessing', () => {
    expect(classifyRoute('/some-new-page')).toBeNull();
    expect(classifyRoute('/nyc/not-a-neighborhood')).toBeNull();
    expect(classifyRoute('/chicago')).toBeNull();
    expect(classifyRoute('/guides/how-to-make-friends-in-chicago')).toBeNull();
    expect(classifyRoute('/plan')).toBeNull();
    expect(classifyRoute('/plan/')).toBeNull();
    expect(classifyRoute('')).toBeNull();
    expect(classifyRoute(null)).toBeNull();
    expect(classifyRoute(undefined)).toBeNull();
    expect(classifyRoute('relative/path')).toBeNull();
  });

  it('refuses a path that still has a query or fragment attached', () => {
    // Callers must hand over a parsed pathname. Guessing where the private part
    // of a raw string starts is exactly the mistake this module exists to avoid.
    expect(classifyRoute('/feed?city=nyc')).toBeNull();
    expect(classifyRoute('/feed#top')).toBeNull();
  });

  it('treats a trailing slash as the same page', () => {
    expect(classifyRoute('/feed/')).toBe('/feed');
    expect(classifyRoute('/nyc/williamsburg/')).toBe('/nyc/williamsburg');
    expect(classifyRoute('/')).toBe('/');
  });

  it('never returns anything outside the allowlist', () => {
    const hostile = [
      '/',
      '/feed',
      `/plan/${PLAN_SLUG}`,
      `/inbox/${CONVERSATION_ID}`,
      '/admin/metrics',
      '/nyc/williamsburg',
      '/../etc/passwd',
      '/plan/%2E%2E%2Fadmin',
      '/PLAN/Shouty-Slug',
      '/feed/../admin/ops',
      '/plan/a/b/c',
      '/plan/' + 'x'.repeat(500)
    ];
    for (const path of hostile) {
      const token = classifyRoute(path);
      if (token !== null) {
        expect(ALLOWED_ROUTE_TOKENS, `${path} produced ${token}`).toContain(token);
      }
    }
  });

  it('keeps the allowlist and the sensitive list disjoint', () => {
    // If someone adds /profile to the allowlist one day, this fails.
    for (const token of ALLOWED_ROUTE_TOKENS) {
      for (const prefix of SENSITIVE_ROUTE_PREFIXES) {
        expect(token === prefix || token.startsWith(`${prefix}/`), `${token} overlaps ${prefix}`).toBe(false);
      }
    }
  });
});

describe('sanitizeAnalyticsUrl', () => {
  it('rebuilds a public URL against the canonical origin', () => {
    expect(sanitizeAnalyticsUrl('https://www.stoop.house/feed')).toBe(`${ANALYTICS_ORIGIN}/feed`);
    expect(sanitizeAnalyticsUrl('/feed')).toBe(`${ANALYTICS_ORIGIN}/feed`);
    expect(sanitizeAnalyticsUrl('https://www.stoop.house/')).toBe(`${ANALYTICS_ORIGIN}/`);
  });

  it('discards the query string and fragment entirely', () => {
    expect(sanitizeAnalyticsUrl('https://www.stoop.house/feed?city=nyc&category=coffee')).toBe(`${ANALYTICS_ORIGIN}/feed`);
    expect(sanitizeAnalyticsUrl('https://www.stoop.house/post?draft=coffee%20on%20tuesday')).toBe(`${ANALYTICS_ORIGIN}/post`);
    expect(sanitizeAnalyticsUrl('https://www.stoop.house/feed#plan-3')).toBe(`${ANALYTICS_ORIGIN}/feed`);
  });

  it('strips a plan slug out of a real plan URL', () => {
    const url = sanitizeAnalyticsUrl(`https://www.stoop.house/plan/${PLAN_SLUG}?posted=1&founding=1`);
    expect(url).toBe(`${ANALYTICS_ORIGIN}/plan/[slug]`);
    expect(url).not.toContain(PLAN_SLUG);
    expect(url).not.toContain('posted');
    expect(url).not.toContain('founding');
  });

  it('drops private URLs even when they arrive fully qualified', () => {
    expect(sanitizeAnalyticsUrl(`https://www.stoop.house/inbox/${CONVERSATION_ID}`)).toBeNull();
    expect(sanitizeAnalyticsUrl(`https://www.stoop.house/auth?next=/plan/${PLAN_SLUG}`)).toBeNull();
    expect(sanitizeAnalyticsUrl('https://www.stoop.house/admin/reports')).toBeNull();
    expect(sanitizeAnalyticsUrl('https://www.stoop.house/profile')).toBeNull();
  });

  it('ignores the incoming host, so a preview or apex URL is reported the same way', () => {
    expect(sanitizeAnalyticsUrl('https://stoop.house/feed')).toBe(`${ANALYTICS_ORIGIN}/feed`);
    expect(sanitizeAnalyticsUrl('https://stoop-git-preview.vercel.app/feed')).toBe(`${ANALYTICS_ORIGIN}/feed`);
    expect(sanitizeAnalyticsUrl('http://localhost:3000/feed')).toBe(`${ANALYTICS_ORIGIN}/feed`);
  });

  it('handles junk without throwing', () => {
    expect(sanitizeAnalyticsUrl('')).toBeNull();
    expect(sanitizeAnalyticsUrl(null)).toBeNull();
    expect(sanitizeAnalyticsUrl(undefined)).toBeNull();
    expect(sanitizeAnalyticsUrl('not a url at all')).toBeNull();
    expect(sanitizeAnalyticsUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeAnalyticsUrl('mailto:someone@example.com')).toBeNull();
  });
});

describe('analyticsBeforeSend', () => {
  it('passes a public pageview through with a sanitized url', () => {
    expect(analyticsBeforeSend({ type: 'pageview', url: 'https://www.stoop.house/feed?city=nyc' })).toEqual({
      type: 'pageview',
      url: `${ANALYTICS_ORIGIN}/feed`
    });
  });

  it('cancels the event for anything private', () => {
    expect(analyticsBeforeSend({ type: 'pageview', url: `https://www.stoop.house/inbox/${CONVERSATION_ID}` })).toBeNull();
    expect(analyticsBeforeSend({ type: 'pageview', url: 'https://www.stoop.house/admin/ops' })).toBeNull();
    expect(analyticsBeforeSend({ type: 'event', url: 'https://www.stoop.house/auth?next=post' })).toBeNull();
  });

  it('preserves other fields the script may add', () => {
    const event = { type: 'pageview' as const, url: 'https://www.stoop.house/post', extra: 'kept' };
    expect(analyticsBeforeSend(event)).toEqual({ type: 'pageview', url: `${ANALYTICS_ORIGIN}/post`, extra: 'kept' });
  });

  it('survives a malformed event object', () => {
    expect(analyticsBeforeSend({ type: 'pageview', url: '' })).toBeNull();
    expect(analyticsBeforeSend(undefined as never)).toBeNull();
  });
});
