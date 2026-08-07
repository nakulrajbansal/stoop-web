/**
 * Where auth is allowed to send somebody.
 *
 * Until this release the destination was parsed inline in the auth page, once,
 * and nothing else needed it. Now there are two places that decide it: the
 * page, and the server callback route that OAuth returns to. A server route
 * that redirects to whatever arrived in a query string is an open redirect, and
 * an open redirect on the sign-in screen is a credible phishing hop: the link
 * really does start at stoop.house, and the visitor really is mid-signup.
 *
 * So the rule lives in one module and both callers use it. These tests are
 * mostly a list of the things a redirect parameter has been in the wild.
 */
import { describe, it, expect } from 'vitest';
import { safeDestination, carriedNext, safeMode, DEFAULT_DESTINATION } from './safe-redirect';

describe('safeDestination', () => {
  it('sends a finished signup to the feed when nothing was asked for', () => {
    expect(DEFAULT_DESTINATION).toBe('/feed');
    for (const raw of ['', null, undefined, '   ']) {
      expect(safeDestination(raw)).toBe('/feed');
    }
  });

  it('keeps the two destinations the product actually uses', () => {
    // A parked draft, and the plan somebody wanted to message about.
    expect(safeDestination('post')).toBe('/post');
    expect(safeDestination('/plan/coffee-at-partners-saturday-ab12')).toBe(
      '/plan/coffee-at-partners-saturday-ab12'
    );
  });

  it('refuses anything that leaves stoop.house', () => {
    const offsite = [
      'https://evil.example/steal',
      'http://evil.example',
      '//evil.example',
      '///evil.example',
      '\\\\evil.example',
      '/\\evil.example',
      '/\tevil.example',
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'https:/evil.example',
      '/plan/../../admin/metrics',
      '%2f%2fevil.example',
      'https://stoop.house.evil.example/feed'
    ];
    for (const raw of offsite) {
      expect(safeDestination(raw), `${raw} must not be honored`).toBe('/feed');
    }
  });

  it('refuses an internal path that is not one of the two, including private ones', () => {
    for (const raw of ['/admin/metrics', '/inbox/abc', '/profile', '/api/profile', '/feed?x=1']) {
      expect(safeDestination(raw)).toBe('/feed');
    }
  });

  it('refuses a plan slug that is not a plan slug', () => {
    for (const raw of [
      '/plan/',
      '/plan/a b',
      '/plan/abc/edit',
      '/plan/abc?x=1',
      '/plan/abc#frag',
      `/plan/${'a'.repeat(200)}`
    ]) {
      expect(safeDestination(raw)).toBe('/feed');
    }
  });

  it('is idempotent, so a destination can be fed back through it safely', () => {
    for (const raw of ['post', '/post', '/plan/coffee-ab12', '/feed', 'nonsense']) {
      expect(safeDestination(safeDestination(raw))).toBe(safeDestination(raw));
    }
  });
});

describe('carriedNext', () => {
  it('gives back the token to put in a URL, never a raw one', () => {
    expect(carriedNext('post')).toBe('post');
    expect(carriedNext('/post')).toBe('post');
    expect(carriedNext('/plan/coffee-ab12')).toBe('/plan/coffee-ab12');
  });

  it('carries nothing at all when the destination is the default', () => {
    for (const raw of ['', 'https://evil.example', '/admin/metrics', '/feed']) {
      expect(carriedNext(raw)).toBe('');
    }
  });
});

describe('safeMode', () => {
  it('is one of two words and defaults to signup', () => {
    expect(safeMode('signin')).toBe('signin');
    expect(safeMode('signup')).toBe('signup');
    for (const raw of ['', null, undefined, 'SIGNIN', 'signout', '../signin', 42]) {
      expect(safeMode(raw)).toBe('signup');
    }
  });
});
