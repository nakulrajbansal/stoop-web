/**
 * The product contract, in one place.
 *
 * The feedback that started this: "I have to sign up, but it is not clear what
 * I can expect." So the sequence is stated in the product itself, not only in
 * the FAQ or the terms, and every surface says it with the same words. A string
 * that lives here cannot drift between the homepage, the feed, the plan page
 * and the auth screen.
 *
 * House style: no em dashes, and no promise that strangers become friends.
 */

export const BROWSE_CONTRACT =
  'Browse plans and hosts without an account. Sign up only when you want to post or message. Messaging starts a private conversation; the host chooses who joins.';

/**
 * The four steps.
 *
 * `body` is the full statement of the step and is what the contract is judged
 * against. `short` is the same step said in one line, for a surface that draws
 * the sequence rather than explains it; every fact `short` leaves out is stated
 * elsewhere on that page, in BROWSE_CONTRACT or in CONTRACT_QUESTIONS. Never
 * use `short` as the only place a step appears.
 */
export const CONTRACT_STEPS: { n: string; title: string; short: string; body: string }[] = [
  {
    n: '01',
    title: 'Browse',
    short: 'Read plans and hosts without an account.',
    body: 'Read plans and host cards without an account. Nothing is hidden behind signup.'
  },
  {
    n: '02',
    title: 'Message',
    short: 'Sign up only to message. That opens a private conversation.',
    body: 'Found one that fits? Make an account and message the host. That starts a private conversation.'
  },
  {
    n: '03',
    title: 'The host chooses',
    short: 'They read your request, then accept or decline.',
    body: 'The host decides, not an algorithm. They see your first name, photo, neighborhood, one line about you, and your message, then accept or decline.'
  },
  {
    n: '04',
    title: 'You meet',
    short: 'Confirmed people see each other. Four at most, counting the host.',
    body: 'Once you are confirmed, you can see who else is coming. Up to four people, counting the host.'
  }
];

export const MESSAGING_NOT_A_RESERVATION =
  'Messaging starts a private conversation. The host confirms the spot.';

export const HOST_REVIEWS_REQUESTS = 'The host reviews each requester before confirming.';

/**
 * Why signup exists, and what it costs.
 *
 * This used to say we ask for a phone number, full stop, because a phone number
 * was the only way in. There are three now, so the old line would contradict
 * the two buttons directly above it, on the one screen where somebody is
 * deciding whether to trust us. It also cannot say "neither is ever shown" any
 * more: an account may have a phone, an email, or both, and the promise has to
 * cover whichever it is.
 */
export const SIGNUP_REASON =
  'You only need an account to post or message. Continue with Google or Apple, or verify a phone number if you would rather not use either. We always need an email so you find out when someone replies. Your email and your phone number are never shown on the site.';

/** The six questions from the product contract, answered in the product. */
export const CONTRACT_QUESTIONS: { q: string; a: string }[] = [
  {
    q: 'What is this?',
    a: 'A real plan someone is already doing this week, with room for a few neighbors. Not an open ended post about making friends.'
  },
  {
    q: 'What will I see?',
    a: 'The activity, the day, the exact time, the public meeting point, what it costs, how many spots are open, and the host: first name, photo, neighborhood, and their hosting record when they have one.'
  },
  {
    q: 'What happens when I message?',
    a: 'A private conversation opens between you and the host. They see your first name, photo, neighborhood, your one line about yourself, and what you wrote.'
  },
  {
    q: 'Who decides?',
    a: 'The host. A message does not reserve a spot. They accept or decline each request.'
  },
  {
    q: 'Who can see the group?',
    a: 'Only the host and the people they confirmed. Pending and declined requests stay private, and there is no public attendee list.'
  },
  {
    q: 'Can I change my mind?',
    a: 'Yes. You can withdraw while you are waiting, and you can leave a confirmed plan before it happens. The spot goes back to the host.'
  }
];

export const CONTRACT_FAQ: { q: string; a: string }[] = [
  {
    q: 'Can I browse before signing up?',
    a: 'Yes. Plans, host cards, and neighborhood pages are all public. You only need an account to post a plan or message a host.'
  },
  {
    q: 'Can I see who I would meet?',
    a: 'You can see the host before you sign up: first name, photo, neighborhood, a line about them, and how many plans they have hosted. Once the host confirms you, you can see the other confirmed people. There is no public list of who is going.'
  },
  {
    q: 'Does messaging reserve a spot?',
    a: 'No. Messaging starts a private conversation. The host reads it and decides whether to confirm you, and only a confirmation reserves a spot.'
  }
];

/** The signed-out call to action on a plan page. */
export function planMessageCta(hostFirstName: string): string {
  const name = (hostFirstName ?? '').trim() || 'the host';
  return `Create an account to message ${name}. Messaging does not reserve a spot.`;
}

/** Zero real plans is a fact to state plainly, not a reason to ask for a phone number. */
export function emptyNeighborhoodCopy(neighborhoodName?: string): string {
  const where = (neighborhoodName ?? '').trim() || 'this neighborhood';
  return `Stoop is early in ${where}. There are no open plans this week. You can browse without an account or post a real plan you are already doing.`;
}

/**
 * When the plans list cannot be loaded.
 *
 * Kept well away from the zero-supply copy on purpose. An outage that renders
 * as "there are no open plans this week" tells a visitor something false about
 * the neighborhood, using our own honesty rule against them. It also must not
 * repeat whatever the server said: an error body is for the logs, not for
 * somebody deciding whether to sign up.
 */
export const FEED_ERROR_HEADLINE = 'Plans are not loading right now.';

export const FEED_ERROR_BODY =
  'Something on our side is not answering, so this page cannot show what is on the board. That is a problem with Stoop, and it is not a sign that the neighborhood is empty. Try again in a moment.';

export const FEED_ERROR_RETRY = 'Try again';

/**
 * Real counts only. Samples are labelled Sample and are never counted here.
 *
 * When a category filter is on, the number is a category number, so the copy
 * says which category rather than presenting it as a city total.
 */
export function openPlanCount(count: number, category?: string | null): string {
  const kind = category ? `${category} plan` : 'plan';
  if (count <= 0) return `No open ${kind}s`;
  return `${count} open ${kind}${count === 1 ? '' : 's'}`;
}

/** Everything above, flattened, so the house style test can check all of it. */
export const PRODUCT_COPY_STRINGS: readonly string[] = Object.freeze([
  BROWSE_CONTRACT,
  MESSAGING_NOT_A_RESERVATION,
  HOST_REVIEWS_REQUESTS,
  SIGNUP_REASON,
  FEED_ERROR_HEADLINE,
  FEED_ERROR_BODY,
  FEED_ERROR_RETRY,
  ...CONTRACT_STEPS.flatMap(step => [step.title, step.short, step.body]),
  ...CONTRACT_QUESTIONS.flatMap(item => [item.q, item.a]),
  ...CONTRACT_FAQ.flatMap(item => [item.q, item.a]),
  planMessageCta('Maya'),
  emptyNeighborhoodCopy(),
  emptyNeighborhoodCopy('Williamsburg')
]);
