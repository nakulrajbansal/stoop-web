/**
 * The lifecycle of one request to join a plan.
 *
 * Four states, named the same way in the plan page, the inbox, the thread and
 * the emails, so nobody has to work out whether "pending" means they are going.
 *
 * These are the rules the database enforces in migration
 * 20260805211500_conversation_withdrawal.sql. The functions here let the routes
 * and the UI reason about the same rules without a round trip, but the atomic
 * decision (and the capacity arithmetic that goes with it) belongs to Postgres.
 */

export const CONVERSATION_STATUSES = ['pending', 'confirmed', 'declined', 'withdrawn'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export type LifecycleActor = 'host' | 'requester';

export const STATE_COPY: Record<ConversationStatus, { label: string; line: string }> = {
  pending: { label: 'Pending', line: 'Conversation started. No spot is reserved.' },
  confirmed: { label: 'Confirmed', line: 'The host accepted. Your spot is reserved.' },
  declined: { label: 'Declined', line: 'The host declined. No spot is reserved.' },
  withdrawn: {
    label: 'Withdrawn',
    line: 'The requester left the plan. Any reserved spot has been restored.'
  }
};

export function isConversationStatus(value: unknown): value is ConversationStatus {
  return typeof value === 'string' && (CONVERSATION_STATUSES as readonly string[]).includes(value);
}

/** Never render a blank badge: an unknown status reads as the state it started in. */
export function stateCopy(value: unknown): { label: string; line: string } {
  return STATE_COPY[isConversationStatus(value) ? value : 'pending'];
}

export type TransitionRequest = {
  from: ConversationStatus;
  to: ConversationStatus;
  actor: LifecycleActor;
  /** The plan's day has passed. A confirmed spot can no longer be handed back. */
  planExpired?: boolean;
};

export type TransitionResult =
  | { ok: true; takesSpot: boolean; releasesSpot: boolean; alreadyThere: boolean }
  | { ok: false; reason: string };

function allowed(takesSpot: boolean, releasesSpot: boolean, alreadyThere = false): TransitionResult {
  return { ok: true, takesSpot, releasesSpot, alreadyThere };
}

/**
 * Is this state change legal, and what does it do to the plan's capacity?
 *
 * Withdrawing something already withdrawn is legal and does nothing, which is
 * what makes a double tap or a retried request safe.
 */
export function evaluateTransition(request: TransitionRequest): TransitionResult {
  const { from, to, actor, planExpired = false } = request;

  if (to === 'withdrawn') {
    if (actor !== 'requester') {
      return { ok: false, reason: 'Only the requester can withdraw. Hosts use Decline instead.' };
    }
    if (from === 'withdrawn') return allowed(false, false, true);
    if (from === 'declined') {
      return { ok: false, reason: 'This request was already declined, so there is nothing to withdraw.' };
    }
    if (from === 'confirmed') {
      if (planExpired) {
        return { ok: false, reason: 'This plan has already happened, so the spot cannot be handed back.' };
      }
      return allowed(false, true);
    }
    return allowed(false, false);
  }

  if (to === 'confirmed' || to === 'declined') {
    if (actor !== 'host') {
      return { ok: false, reason: 'Only the host decides who joins.' };
    }
    if (from === 'withdrawn') {
      return { ok: false, reason: 'This person left the plan. They would need to send a new request.' };
    }
    if (from !== 'pending') {
      return { ok: false, reason: `This request is already ${STATE_COPY[from].label.toLowerCase()}.` };
    }
    return allowed(to === 'confirmed', false);
  }

  return { ok: false, reason: 'A request cannot go back to pending.' };
}

export type PlanCapacity = { spots_left: number; spots_total: number };

/** One spot back, never more than the plan ever offered. */
export function spotsAfterWithdrawal(plan: PlanCapacity): number {
  return Math.min(plan.spots_total, plan.spots_left + 1);
}

/** A full plan reopens. An expired or removed plan stays where it is. */
export function planStatusAfterWithdrawal(plan: PlanCapacity & { status: string }): string {
  return plan.status === 'full' ? 'open' : plan.status;
}

/** The check that stops two simultaneous confirmations from overbooking. */
export function canConfirmWithCapacity(plan: { status: string; spots_left: number }): boolean {
  return plan.status === 'open' && plan.spots_left >= 1;
}
