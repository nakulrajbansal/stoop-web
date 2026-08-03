import { describe, expect, it } from 'vitest';
import { WELCOME_WINDOW_MS, welcomeDecision } from './welcome';

/**
 * /api/welcome used to take the recipient address and the display name from the
 * request body. Any signed-in account could post an arbitrary address, as often
 * as it liked, and Stoop would deliver mail on its behalf. The recipient now
 * comes from the caller's own profile, and this is the rule that stops the
 * route being a repeat-send button.
 */

const NOW = Date.parse('2026-08-02T12:00:00.000Z');
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe('welcomeDecision', () => {
  it('sends for a brand-new account with an email', () => {
    expect(welcomeDecision({ notify_email: 'a@example.com', created_at: iso(0) }, NOW)).toEqual({ send: true });
  });

  it('still sends inside the window, so a retry after a dropped response works', () => {
    const almost = iso(-(WELCOME_WINDOW_MS - 1000));
    expect(welcomeDecision({ notify_email: 'a@example.com', created_at: almost }, NOW)).toEqual({ send: true });
  });

  it('refuses once the window has passed, so a replayed call sends nothing', () => {
    const stale = iso(-(WELCOME_WINDOW_MS + 1000));
    expect(welcomeDecision({ notify_email: 'a@example.com', created_at: stale }, NOW))
      .toEqual({ send: false, reason: 'too_old' });
  });

  it('refuses when there is no address to send to', () => {
    expect(welcomeDecision({ notify_email: null, created_at: iso(0) }, NOW))
      .toEqual({ send: false, reason: 'no_email' });
  });

  it('refuses on an unparseable created_at rather than treating it as brand new', () => {
    expect(welcomeDecision({ notify_email: 'a@example.com', created_at: 'not a date' }, NOW))
      .toEqual({ send: false, reason: 'bad_timestamp' });
  });

  it('caps an old account at zero sends no matter how many times it is called', () => {
    const profile = { notify_email: 'a@example.com', created_at: iso(-24 * 60 * 60 * 1000) };
    const results = Array.from({ length: 50 }, () => welcomeDecision(profile, NOW));
    expect(results.filter(r => r.send)).toHaveLength(0);
  });
});
