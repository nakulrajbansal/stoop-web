import { describe, expect, it } from 'vitest';
import {
  buildTrackedShareUrl,
  normalizeInterestEmail,
  parseAttributionCookie,
  parseInterestSubmission,
  readCookieValue,
  resolveRequestedNeighborhood,
  sanitizeAttribution,
  serializeAttributionCookie,
} from './growth';

describe('sanitizeAttribution', () => {
  it('keeps only supported campaign fields and trims their values', () => {
    const params = new URLSearchParams({
      src: ' instagram ',
      utm_source: 'instagram',
      utm_medium: 'organic_social',
      utm_campaign: 'mccarren_launch',
      utm_content: 'profile',
      secret: 'must-not-survive',
    });

    expect(sanitizeAttribution(params)).toEqual({
      src: 'instagram',
      utm_source: 'instagram',
      utm_medium: 'organic_social',
      utm_campaign: 'mccarren_launch',
      utm_content: 'profile',
    });
  });

  it('returns null when no supported campaign field is present', () => {
    expect(sanitizeAttribution(new URLSearchParams('unrelated=value'))).toBeNull();
  });
});

describe('attribution cookie', () => {
  it('reads a named cookie without confusing it with neighboring cookies', () => {
    expect(readCookieValue('session=abc; stoop_attribution=%7B%22src%22%3A%22instagram%22%7D; theme=light', 'stoop_attribution')).toBe(
      '%7B%22src%22%3A%22instagram%22%7D',
    );
    expect(readCookieValue('session=abc; theme=light', 'stoop_attribution')).toBeNull();
  });

  it('round-trips a sanitized attribution object', () => {
    const attribution = { src: 'instagram', utm_campaign: 'mccarren_launch' };
    expect(parseAttributionCookie(serializeAttributionCookie(attribution))).toEqual(attribution);
  });

  it('treats malformed cookie data as absent', () => {
    expect(parseAttributionCookie('%not-json')).toBeNull();
  });
});

describe('resolveRequestedNeighborhood', () => {
  it('uses the explicitly requested neighborhood when it belongs to the profile city', () => {
    expect(resolveRequestedNeighborhood('profile-hood', 'williamsburg', 'requested-hood')).toBe('requested-hood');
  });

  it('uses the profile neighborhood only when no explicit neighborhood was requested', () => {
    expect(resolveRequestedNeighborhood('profile-hood', '', null)).toBe('profile-hood');
  });

  it('rejects an explicit neighborhood that does not belong to the profile city', () => {
    expect(() => resolveRequestedNeighborhood('profile-hood', 'east-austin', null)).toThrow('Invalid neighborhood for your city');
  });
});

describe('normalizeInterestEmail', () => {
  it('normalizes a valid email for deduplication', () => {
    expect(normalizeInterestEmail(' Person+Launch@Example.COM ')).toBe('person+launch@example.com');
  });

  it('rejects malformed or oversized email values', () => {
    expect(normalizeInterestEmail('not-an-email')).toBeNull();
    expect(normalizeInterestEmail(`${'a'.repeat(250)}@example.com`)).toBeNull();
  });
});

describe('interest submission', () => {
  it('accepts a normalized email for a supported launch area', () => {
    expect(parseInterestSubmission({ email: ' Person@Example.com ', launchArea: 'mccarren-park', website: '' })).toEqual({
      kind: 'valid',
      email: 'person@example.com',
      launchArea: 'mccarren-park',
    });
  });

  it('rejects malformed emails and unsupported launch areas', () => {
    expect(parseInterestSubmission({ email: 'bad', launchArea: 'mccarren-park' })).toEqual({ kind: 'invalid' });
    expect(parseInterestSubmission({ email: 'person@example.com', launchArea: 'all-nyc' })).toEqual({ kind: 'invalid' });
  });

  it('identifies a filled honeypot without retaining the submitted email', () => {
    expect(parseInterestSubmission({ email: 'person@example.com', launchArea: 'williamsburg', website: 'bot.example' })).toEqual({ kind: 'bot' });
  });
});

describe('buildTrackedShareUrl', () => {
  it('adds host-share attribution without dropping an existing query string', () => {
    expect(buildTrackedShareUrl('https://www.stoop.house/plan/coffee?posted=1')).toBe(
      'https://www.stoop.house/plan/coffee?posted=1&src=host_share',
    );
  });
});
