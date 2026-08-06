import { describe, it, expect } from 'vitest';
import {
  CONVERSATION_STATUSES,
  STATE_COPY,
  stateCopy,
  isConversationStatus,
  evaluateTransition,
  spotsAfterWithdrawal,
  planStatusAfterWithdrawal,
  canConfirmWithCapacity
} from './conversation-lifecycle';

describe('the four states, named the same way everywhere', () => {
  it('is exactly pending, confirmed, declined, withdrawn', () => {
    expect([...CONVERSATION_STATUSES]).toEqual(['pending', 'confirmed', 'declined', 'withdrawn']);
  });

  it('says what each state means for the spot, with no em dashes', () => {
    expect(STATE_COPY.pending.line).toBe('Conversation started. No spot is reserved.');
    expect(STATE_COPY.confirmed.line).toBe('The host accepted. Your spot is reserved.');
    expect(STATE_COPY.declined.line).toBe('The host declined. No spot is reserved.');
    expect(STATE_COPY.withdrawn.line).toBe('The requester left the plan. Any reserved spot has been restored.');
    for (const status of CONVERSATION_STATUSES) {
      expect(STATE_COPY[status].label).toBe(status[0].toUpperCase() + status.slice(1));
      expect(STATE_COPY[status].line).not.toMatch(/\u2014/);
    }
  });

  it('falls back to Pending for an unknown status rather than rendering nothing', () => {
    expect(stateCopy('confirmed').label).toBe('Confirmed');
    expect(stateCopy('nonsense').label).toBe('Pending');
    expect(isConversationStatus('withdrawn')).toBe(true);
    expect(isConversationStatus('cancelled')).toBe(false);
  });
});

describe('transitions the host owns', () => {
  it('confirms a pending request and takes a spot', () => {
    const result = evaluateTransition({ from: 'pending', to: 'confirmed', actor: 'host' });
    expect(result).toMatchObject({ ok: true, takesSpot: true, releasesSpot: false });
  });

  it('declines a pending request without touching capacity', () => {
    expect(evaluateTransition({ from: 'pending', to: 'declined', actor: 'host' })).toMatchObject({
      ok: true,
      takesSpot: false,
      releasesSpot: false
    });
  });

  it('cannot withdraw somebody else, and is told to use Decline', () => {
    const result = evaluateTransition({ from: 'pending', to: 'withdrawn', actor: 'host' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/decline/i);
  });

  it('cannot confirm a declined or withdrawn request', () => {
    expect(evaluateTransition({ from: 'declined', to: 'confirmed', actor: 'host' }).ok).toBe(false);
    const fromWithdrawn = evaluateTransition({ from: 'withdrawn', to: 'confirmed', actor: 'host' });
    expect(fromWithdrawn.ok).toBe(false);
    if (!fromWithdrawn.ok) expect(fromWithdrawn.reason).toMatch(/new request/i);
  });

  it('cannot confirm twice', () => {
    expect(evaluateTransition({ from: 'confirmed', to: 'confirmed', actor: 'host' }).ok).toBe(false);
  });
});

describe('transitions the requester owns', () => {
  it('withdraws while pending, with no spot to give back', () => {
    expect(evaluateTransition({ from: 'pending', to: 'withdrawn', actor: 'requester' })).toMatchObject({
      ok: true,
      releasesSpot: false
    });
  });

  it('withdraws after confirmation and gives the spot back exactly once', () => {
    expect(evaluateTransition({ from: 'confirmed', to: 'withdrawn', actor: 'requester' })).toMatchObject({
      ok: true,
      releasesSpot: true
    });
  });

  it('treats a second withdrawal as a no-op instead of a second refund', () => {
    const result = evaluateTransition({ from: 'withdrawn', to: 'withdrawn', actor: 'requester' });
    expect(result).toMatchObject({ ok: true, releasesSpot: false, alreadyThere: true });
  });

  it('cannot withdraw a request the host already declined', () => {
    expect(evaluateTransition({ from: 'declined', to: 'withdrawn', actor: 'requester' }).ok).toBe(false);
  });

  it('cannot withdraw a confirmed spot once the plan has passed', () => {
    const result = evaluateTransition({
      from: 'confirmed',
      to: 'withdrawn',
      actor: 'requester',
      planExpired: true
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/already happened|passed/i);
  });

  it('can still withdraw a pending request after the plan has passed', () => {
    expect(
      evaluateTransition({ from: 'pending', to: 'withdrawn', actor: 'requester', planExpired: true }).ok
    ).toBe(true);
  });

  it('cannot confirm or decline its own request', () => {
    expect(evaluateTransition({ from: 'pending', to: 'confirmed', actor: 'requester' }).ok).toBe(false);
    expect(evaluateTransition({ from: 'pending', to: 'declined', actor: 'requester' }).ok).toBe(false);
  });
});

describe('capacity arithmetic', () => {
  it('restores exactly one spot and never more than the plan ever had', () => {
    expect(spotsAfterWithdrawal({ spots_left: 0, spots_total: 2 })).toBe(1);
    expect(spotsAfterWithdrawal({ spots_left: 2, spots_total: 2 })).toBe(2);
  });

  it('reopens a full plan and leaves other statuses alone', () => {
    expect(planStatusAfterWithdrawal({ status: 'full', spots_left: 0, spots_total: 1 })).toBe('open');
    expect(planStatusAfterWithdrawal({ status: 'open', spots_left: 1, spots_total: 3 })).toBe('open');
    expect(planStatusAfterWithdrawal({ status: 'expired', spots_left: 0, spots_total: 1 })).toBe('expired');
    expect(planStatusAfterWithdrawal({ status: 'removed', spots_left: 0, spots_total: 1 })).toBe('removed');
  });

  it('refuses a confirmation that would overbook the plan', () => {
    expect(canConfirmWithCapacity({ status: 'open', spots_left: 1 })).toBe(true);
    expect(canConfirmWithCapacity({ status: 'open', spots_left: 0 })).toBe(false);
    expect(canConfirmWithCapacity({ status: 'full', spots_left: 0 })).toBe(false);
    expect(canConfirmWithCapacity({ status: 'removed', spots_left: 3 })).toBe(false);
  });
});
