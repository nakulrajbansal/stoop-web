/**
 * The rule for whether a welcome email may go out, kept out of the route so it
 * can be tested without a database or a mail provider.
 */

/**
 * How long after signup a welcome email may still be sent. Long enough to
 * survive a retry or a slow first launch, short enough that the route can never
 * be used as a repeat-send button.
 *
 * This is an age bound, not a send count. It was doing both jobs and could only
 * do one: any call inside the window sent mail, so fifty calls sent fifty
 * emails. `claim_welcome_email` (migration 0008) is what makes it one send; this
 * stays as the cheap first check that keeps an old account from even reaching
 * the claim.
 */
export const WELCOME_WINDOW_MS = 15 * 60 * 1000;

export type WelcomeCandidate = {
  notify_email: string | null;
  created_at: string;
};

export type WelcomeDecision = { send: false; reason: 'no_email' | 'too_old' | 'bad_timestamp' } | { send: true };

export function welcomeDecision(profile: WelcomeCandidate, now: number = Date.now()): WelcomeDecision {
  if (!profile.notify_email) return { send: false, reason: 'no_email' };

  const created = Date.parse(profile.created_at);
  // An unparseable timestamp must not become an open send window.
  if (Number.isNaN(created)) return { send: false, reason: 'bad_timestamp' };

  if (now - created > WELCOME_WINDOW_MS) return { send: false, reason: 'too_old' };
  return { send: true };
}

/**
 * The key handed to Resend so that even a retry which races the provider's own
 * recovery delivers one email. Derived from the account, never from anything
 * the caller sent.
 */
export function welcomeIdempotencyKey(userId: string): string {
  return `welcome:${userId}`;
}
