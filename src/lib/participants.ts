/**
 * Who is allowed to see who.
 *
 * Stoop has no member directory and no public attendee list. Identity shows up
 * only inside one specific plan, at the moment it is needed to make a decision:
 *
 *  - the host card is public, because you cannot judge a plan without it;
 *  - a requester's card is private to the host, before accepting;
 *  - the confirmed roster is private to the host and the confirmed joiners.
 *
 * Pending, declined and withdrawn people never appear in a roster, and nothing
 * here ever returns a phone number, an email, or a full name.
 *
 * These are pure functions on purpose. The route does the authentication and
 * the reads; this module decides, and is exhaustively tested against the whole
 * viewer matrix rather than against whichever case happened to be wired up.
 */

export type RosterViewerRole =
  | 'anonymous'
  | 'host'
  | 'confirmed'
  | 'pending'
  | 'declined'
  | 'withdrawn'
  | 'unrelated';

export type RosterPlan = { id: string; user_id: string; status: string };
export type RosterConversation = { joiner_id: string; status: string };

export const ROSTER_VISIBILITY_NOTE =
  'Only the host and confirmed participants can see this. Pending requests stay private.';

export function resolveViewerRole(args: {
  viewerId: string | null | undefined;
  plan: RosterPlan;
  conversations: readonly RosterConversation[];
}): RosterViewerRole {
  const { viewerId, plan, conversations } = args;
  if (!viewerId) return 'anonymous';
  if (viewerId === plan.user_id) return 'host';

  const own = conversations.find(c => c.joiner_id === viewerId);
  if (!own) return 'unrelated';
  if (own.status === 'confirmed') return 'confirmed';
  if (own.status === 'declined') return 'declined';
  if (own.status === 'withdrawn') return 'withdrawn';
  return 'pending';
}

export type RosterAuthorization =
  | { ok: true; role: 'host' | 'confirmed' }
  | { ok: false; status: 401 | 403 | 404; role: RosterViewerRole };

/**
 * Fails closed. Only two roles ever get an ok, and a block or a removed plan
 * beats both of them.
 */
export function authorizeRoster(args: {
  viewerId: string | null | undefined;
  plan: RosterPlan;
  conversations: readonly RosterConversation[];
  blockedIds: readonly string[];
}): RosterAuthorization {
  const role = resolveViewerRole(args);
  if (role === 'anonymous') return { ok: false, status: 401, role };

  // A removed plan is gone for everyone, its host included.
  if (args.plan.status === 'removed') return { ok: false, status: 404, role };

  // A block in either direction makes the plan invisible, so the roster cannot
  // be the one surface that still confirms the host exists.
  if (args.blockedIds.includes(args.plan.user_id)) return { ok: false, status: 404, role };

  if (role === 'host' || role === 'confirmed') return { ok: true, role };
  return { ok: false, status: 403, role };
}

export type RosterProfile = {
  id: string;
  name: string | null;
  about: string | null;
  neighborhood: string | null;
};

export type RosterEntry = {
  userId: string;
  firstName: string;
  neighborhood: string | null;
  about: string | null;
  role: 'host' | 'joiner';
  isYou: boolean;
};

export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first || 'A neighbor';
}

function toEntry(profile: RosterProfile, role: 'host' | 'joiner', viewerId: string): RosterEntry {
  return {
    userId: profile.id,
    firstName: firstNameOf(profile.name),
    neighborhood: profile.neighborhood ?? null,
    about: profile.about ?? null,
    role,
    isYou: profile.id === viewerId
  };
}

/**
 * The host, then the confirmed joiners. The avatar is drawn from the user id
 * by the existing Avatar component, so no photo field travels with this.
 */
export function buildRoster(args: {
  viewerId: string;
  host: RosterProfile;
  confirmed: readonly RosterProfile[];
  blockedIds: readonly string[];
}): RosterEntry[] {
  const { viewerId, host, confirmed, blockedIds } = args;
  const entries: RosterEntry[] = [];
  if (!blockedIds.includes(host.id)) entries.push(toEntry(host, 'host', viewerId));
  for (const profile of confirmed) {
    if (blockedIds.includes(profile.id)) continue;
    if (profile.id === host.id) continue;
    entries.push(toEntry(profile, 'joiner', viewerId));
  }
  return entries;
}

export function confirmedJoinerIds(conversations: readonly RosterConversation[]): string[] {
  return conversations.filter(c => c.status === 'confirmed').map(c => c.joiner_id);
}

/** An honest hosting signal, shown only once there is a record worth showing. */
export function priorPlanLabel(count: number | null | undefined): string | null {
  if (typeof count !== 'number' || count < 2) return null;
  return `has posted ${count} plans`;
}

export type RequesterPreview = {
  userId: string;
  firstName: string;
  neighborhood: string | null;
  about: string | null;
  priorPlans: string | null;
  opener: string | null;
  status: string;
};

/** What the host sees about one requester, and only inside that conversation. */
export function buildRequesterPreview(args: {
  profile: RosterProfile;
  priorPlanCount: number | null;
  opener: string | null;
  status: string;
}): RequesterPreview {
  return {
    userId: args.profile.id,
    firstName: firstNameOf(args.profile.name),
    neighborhood: args.profile.neighborhood ?? null,
    about: args.profile.about ?? null,
    priorPlans: priorPlanLabel(args.priorPlanCount),
    opener: args.opener ?? null,
    status: args.status
  };
}
