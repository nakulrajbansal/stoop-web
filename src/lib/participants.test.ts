import { describe, it, expect } from 'vitest';
import {
  resolveViewerRole,
  authorizeRoster,
  buildRoster,
  confirmedJoinerIds,
  buildRequesterPreview,
  priorPlanLabel,
  firstNameOf,
  ROSTER_VISIBILITY_NOTE
} from './participants';

const HOST = 'user-host';
const CONFIRMED = 'user-confirmed';
const PENDING = 'user-pending';
const DECLINED = 'user-declined';
const WITHDRAWN = 'user-withdrawn';
const STRANGER = 'user-stranger';

const PLAN = { id: 'plan-1', user_id: HOST, status: 'open' };

const CONVERSATIONS = [
  { joiner_id: CONFIRMED, status: 'confirmed' },
  { joiner_id: PENDING, status: 'pending' },
  { joiner_id: DECLINED, status: 'declined' },
  { joiner_id: WITHDRAWN, status: 'withdrawn' }
];

function roleFor(viewerId: string | null) {
  return resolveViewerRole({ viewerId, plan: PLAN, conversations: CONVERSATIONS });
}

function authFor(viewerId: string | null, blockedIds: string[] = []) {
  return authorizeRoster({ viewerId, plan: PLAN, conversations: CONVERSATIONS, blockedIds });
}

describe('who the viewer is', () => {
  it('recognises every relationship to the plan', () => {
    expect(roleFor(null)).toBe('anonymous');
    expect(roleFor(HOST)).toBe('host');
    expect(roleFor(CONFIRMED)).toBe('confirmed');
    expect(roleFor(PENDING)).toBe('pending');
    expect(roleFor(DECLINED)).toBe('declined');
    expect(roleFor(WITHDRAWN)).toBe('withdrawn');
    expect(roleFor(STRANGER)).toBe('unrelated');
  });
});

describe('the roster authorization matrix', () => {
  it('lets the host read the roster for their own plan', () => {
    expect(authFor(HOST)).toEqual({ ok: true, role: 'host' });
  });

  it('lets a confirmed participant read it', () => {
    expect(authFor(CONFIRMED)).toEqual({ ok: true, role: 'confirmed' });
  });

  it('turns an anonymous viewer away with 401 and no roster', () => {
    const result = authFor(null);
    expect(result).toEqual({ ok: false, status: 401, role: 'anonymous' });
  });

  it('turns pending, declined, withdrawn and unrelated viewers away with 403', () => {
    for (const viewer of [PENDING, DECLINED, WITHDRAWN, STRANGER]) {
      const result = authFor(viewer);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);
    }
  });

  it('hides the plan entirely from someone in a block relationship with the host', () => {
    const result = authFor(CONFIRMED, [HOST]);
    expect(result).toEqual({ ok: false, status: 404, role: 'confirmed' });
  });

  it('hides a removed plan from everyone, including its host', () => {
    const result = authorizeRoster({
      viewerId: HOST,
      plan: { ...PLAN, status: 'removed' },
      conversations: CONVERSATIONS,
      blockedIds: []
    });
    expect(result).toEqual({ ok: false, status: 404, role: 'host' });
  });

  it('still authorizes the host and confirmed joiners once the plan is full or expired', () => {
    for (const status of ['full', 'expired']) {
      expect(
        authorizeRoster({ viewerId: CONFIRMED, plan: { ...PLAN, status }, conversations: CONVERSATIONS, blockedIds: [] }).ok
      ).toBe(true);
    }
  });
});

describe('what the roster contains', () => {
  const profiles = {
    [HOST]: { id: HOST, name: 'Maya Rodriguez', about: 'lives by the park', neighborhood: 'Williamsburg' },
    [CONFIRMED]: { id: CONFIRMED, name: 'Theo', about: null, neighborhood: 'Greenpoint' },
    'user-second': { id: 'user-second', name: 'Ada Chen', about: 'new here', neighborhood: 'Bushwick' }
  };

  it('lists only confirmed people, host first, with first names only', () => {
    const roster = buildRoster({
      viewerId: CONFIRMED,
      host: profiles[HOST],
      confirmed: [profiles[CONFIRMED], profiles['user-second']],
      blockedIds: []
    });
    expect(roster.map(r => r.firstName)).toEqual(['Maya', 'Theo', 'Ada']);
    expect(roster.map(r => r.role)).toEqual(['host', 'joiner', 'joiner']);
    expect(roster.find(r => r.userId === CONFIRMED)?.isYou).toBe(true);
    expect(roster.find(r => r.userId === HOST)?.isYou).toBe(false);
  });

  it('returns only the four permitted fields plus the viewer marker', () => {
    const roster = buildRoster({
      viewerId: HOST,
      host: profiles[HOST],
      confirmed: [profiles[CONFIRMED]],
      blockedIds: []
    });
    for (const entry of roster) {
      expect(Object.keys(entry).sort()).toEqual(
        ['about', 'firstName', 'isYou', 'neighborhood', 'role', 'userId'].sort()
      );
    }
  });

  it('drops anyone the viewer is in a block relationship with', () => {
    const roster = buildRoster({
      viewerId: HOST,
      host: profiles[HOST],
      confirmed: [profiles[CONFIRMED], profiles['user-second']],
      blockedIds: [CONFIRMED]
    });
    expect(roster.map(r => r.userId)).toEqual([HOST, 'user-second']);
  });

  it('is just the host when nobody has been confirmed yet', () => {
    const roster = buildRoster({ viewerId: HOST, host: profiles[HOST], confirmed: [], blockedIds: [] });
    expect(roster).toHaveLength(1);
    expect(roster[0].role).toBe('host');
  });

  it('says who can see it, and it is not the public', () => {
    expect(ROSTER_VISIBILITY_NOTE).toMatch(/only the host and confirmed/i);
    expect(ROSTER_VISIBILITY_NOTE).not.toMatch(/\u2014/);
  });
});

describe('confirmed joiner ids', () => {
  it('ignores pending, declined and withdrawn requests', () => {
    expect(confirmedJoinerIds(CONVERSATIONS)).toEqual([CONFIRMED]);
  });
});

describe('the private requester preview the host sees before accepting', () => {
  it('carries enough to decide, and nothing private', () => {
    const preview = buildRequesterPreview({
      profile: { id: PENDING, name: 'Sam Okafor', about: 'runs slow, talks a lot', neighborhood: 'Astoria' },
      priorPlanCount: 3,
      opener: 'I am around that morning and have been meaning to try it.',
      status: 'pending'
    });
    expect(preview).toEqual({
      userId: PENDING,
      firstName: 'Sam',
      neighborhood: 'Astoria',
      about: 'runs slow, talks a lot',
      priorPlans: 'has posted 3 plans',
      opener: 'I am around that morning and have been meaning to try it.',
      status: 'pending'
    });
  });

  it('hides a thin hosting record instead of implying one', () => {
    expect(priorPlanLabel(0)).toBeNull();
    expect(priorPlanLabel(1)).toBeNull();
    expect(priorPlanLabel(2)).toBe('has posted 2 plans');
    expect(priorPlanLabel(null)).toBeNull();
  });

  it('handles a one word name and a missing opener', () => {
    const preview = buildRequesterPreview({
      profile: { id: PENDING, name: 'Theo', about: null, neighborhood: null },
      priorPlanCount: 1,
      opener: null,
      status: 'pending'
    });
    expect(preview.firstName).toBe('Theo');
    expect(preview.priorPlans).toBeNull();
    expect(preview.opener).toBeNull();
  });
});

describe('first names', () => {
  it('takes the first word and never the surname', () => {
    expect(firstNameOf('Maya Rodriguez')).toBe('Maya');
    expect(firstNameOf('  Theo  ')).toBe('Theo');
    expect(firstNameOf('')).toBe('A neighbor');
    expect(firstNameOf(null)).toBe('A neighbor');
  });
});
