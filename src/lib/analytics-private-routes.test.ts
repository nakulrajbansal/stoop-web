/**
 * Regression guard for the routes this release adds.
 *
 * The analytics policy already denies by default, so these pass the moment the
 * routes exist. The point is that they keep passing: if anyone ever widens the
 * allowlist, the private roster endpoint and the conversation preview are the
 * two things that must not slip through with it.
 */
import { describe, it, expect } from 'vitest';
import { classifyRoute, sanitizeAnalyticsUrl, ALLOWED_ROUTE_TOKENS } from './analytics-policy';

const PRIVATE_PATHS = [
  '/api/plans/6f1c2a90-0000-4000-8000-000000000001/participants',
  '/api/plans/6f1c2a90-0000-4000-8000-000000000001/participants/',
  '/api/conversations',
  '/api/conversations?conversationId=6f1c2a90-0000-4000-8000-000000000001',
  '/inbox/6f1c2a90-0000-4000-8000-000000000001',
  '/plan/coffee-at-partners-saturday-ab12/edit',
  '/admin/metrics'
];

describe('the new private surfaces are invisible to analytics', () => {
  it('classifies none of them as a reportable route', () => {
    for (const path of PRIVATE_PATHS) {
      expect(classifyRoute(path.split('?')[0])).toBeNull();
    }
  });

  it('drops the event entirely rather than trimming the URL', () => {
    for (const path of PRIVATE_PATHS) {
      expect(sanitizeAnalyticsUrl(`https://www.stoop.house${path}`)).toBeNull();
    }
  });

  it('has not added a participants or conversation token to the allowlist', () => {
    for (const token of ALLOWED_ROUTE_TOKENS) {
      expect(token).not.toMatch(/participants|conversation|inbox|admin|api/i);
    }
  });

  it('still reports the public plan page as the literal token', () => {
    expect(classifyRoute('/plan/coffee-at-partners-saturday-ab12')).toBe('/plan/[slug]');
  });
});
