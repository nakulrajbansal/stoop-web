import { describe, expect, it } from 'vitest';
import { locationLookupFailed } from './location-lookup';

/**
 * /api/me read `data` from the city and neighborhood queries and ignored
 * `error`, so a database failure came back as a 200 with `city: null` — a
 * signed-up member shown as having no neighborhood. That is the same mistake
 * the route already fixed one level up for the profile read itself.
 */
describe('locationLookupFailed', () => {
  it('is null when every query ran', () => {
    expect(locationLookupFailed(
      { data: { id: 'c1' }, error: null },
      { data: null, error: null }
    )).toBeNull();
  });

  it('is null for a row that is genuinely absent', () => {
    // A member with no neighborhood is a real, supported state.
    expect(locationLookupFailed({ data: null, error: null })).toBeNull();
  });

  it('reports the first failure so the route can answer 503', () => {
    expect(locationLookupFailed(
      { data: null, error: null },
      { data: null, error: { message: 'connection reset' } }
    )).toBe('connection reset');
  });

  it('reports a failure even when it carries no message', () => {
    expect(locationLookupFailed({ data: null, error: {} })).toBe('lookup failed');
  });

  it('does not let a later success mask an earlier failure', () => {
    expect(locationLookupFailed(
      { data: null, error: { message: 'timeout' } },
      { data: { id: 'n1' }, error: null }
    )).toBe('timeout');
  });
});
