import { describe, expect, it } from 'vitest';
import {
  applyOpsAction,
  isEntryStatusForKind,
  isLegalDirectStatusChange,
  parseOpsItemCreate,
  parseOpsItemPatch,
  sortOpsItems,
} from './ops';

const NOW = '2026-07-28T12:00:00.000Z';

describe('parseOpsItemCreate', () => {
  it('normalizes a valid task, trimming text and defaulting optional fields', () => {
    expect(
      parseOpsItemCreate({
        kind: 'task',
        title: '  Get Stoop’s first activated McCarren users  ',
        summary: '  Outreach is not activation.  ',
        status: 'in_progress',
        owner: 'curio',
        priority: 'urgent',
        nextAction: '  Convert one interested host  ',
      }),
    ).toEqual({
      ok: true,
      value: {
        kind: 'task',
        title: 'Get Stoop’s first activated McCarren users',
        summary: 'Outreach is not activation.',
        status: 'in_progress',
        owner: 'curio',
        priority: 'urgent',
        next_action: 'Convert one interested host',
        approval_question: null,
        decision_notes: null,
        source_url: null,
        due_at: null,
      },
    });
  });

  it('rejects values outside the kind, status, owner, and priority allowlists', () => {
    const base = { kind: 'task', title: 'Ship it', status: 'in_progress', owner: 'user', priority: 'high' };

    expect(parseOpsItemCreate({ ...base, kind: 'epic' })).toEqual({ ok: false, error: 'kind must be one of: task, approval' });
    expect(parseOpsItemCreate({ ...base, status: 'doing' })).toEqual({
      ok: false,
      error: 'status must be one of: backlog, in_progress, blocked, pending_approval, approved, rejected, completed',
    });
    expect(parseOpsItemCreate({ ...base, owner: 'someone-else' })).toEqual({ ok: false, error: 'owner must be one of: user, curio, shared' });
    expect(parseOpsItemCreate({ ...base, priority: 'critical' })).toEqual({ ok: false, error: 'priority must be one of: low, medium, high, urgent' });
  });

  it('rejects a status that does not belong to the item kind', () => {
    expect(
      parseOpsItemCreate({ kind: 'task', title: 'Ship it', status: 'pending_approval', owner: 'user', priority: 'high' }),
    ).toEqual({ ok: false, error: 'status pending_approval is not valid for a task' });

    expect(
      parseOpsItemCreate({ kind: 'approval', title: 'Approve the budget', status: 'in_progress', owner: 'user', priority: 'high' }),
    ).toEqual({ ok: false, error: 'status in_progress is not valid for an approval' });
  });

  it('rejects oversized text and non-http source urls', () => {
    const base = { kind: 'task', title: 'Ship it', status: 'in_progress', owner: 'user', priority: 'high' };

    expect(parseOpsItemCreate({ ...base, title: 'x'.repeat(121) })).toEqual({
      ok: false,
      error: 'title must be 120 characters or fewer',
    });
    expect(parseOpsItemCreate({ ...base, summary: 'x'.repeat(601) })).toEqual({
      ok: false,
      error: 'summary must be 600 characters or fewer',
    });
    expect(parseOpsItemCreate({ ...base, title: '   ' })).toEqual({ ok: false, error: 'title is required' });
    expect(parseOpsItemCreate({ ...base, sourceUrl: 'javascript:alert(1)' })).toEqual({
      ok: false,
      error: 'source_url must be an http or https link',
    });

    const parsed = parseOpsItemCreate({ ...base, sourceUrl: ' https://stoop.house/admin/ops ' });
    expect(parsed.ok && parsed.value.source_url).toBe('https://stoop.house/admin/ops');
  });

  it('accepts a due date as a timestamp and rejects an unparseable one', () => {
    const parsed = parseOpsItemCreate({
      kind: 'task',
      title: 'Prepare for the C3 offer negotiation call',
      status: 'in_progress',
      owner: 'user',
      priority: 'high',
      dueAt: '2026-07-28T19:00:00.000Z',
    });
    expect(parsed.ok && parsed.value.due_at).toBe('2026-07-28T19:00:00.000Z');

    expect(
      parseOpsItemCreate({ kind: 'task', title: 'Ship it', status: 'in_progress', owner: 'user', priority: 'high', dueAt: 'tomorrow-ish' }),
    ).toEqual({ ok: false, error: 'due_at must be a valid date' });
  });
});

describe('applyOpsAction', () => {
  it('resolves a pending approval and stamps the decision time', () => {
    expect(applyOpsAction({ kind: 'approval', status: 'pending_approval' }, 'approve', NOW)).toEqual({
      ok: true,
      value: { status: 'approved', completed_at: NOW },
    });
    expect(applyOpsAction({ kind: 'approval', status: 'pending_approval' }, 'reject', NOW)).toEqual({
      ok: true,
      value: { status: 'rejected', completed_at: NOW },
    });
  });

  it('completes a task and reopens it back into active work', () => {
    expect(applyOpsAction({ kind: 'task', status: 'blocked' }, 'complete', NOW)).toEqual({
      ok: true,
      value: { status: 'completed', completed_at: NOW },
    });
    expect(applyOpsAction({ kind: 'task', status: 'completed' }, 'reopen', NOW)).toEqual({
      ok: true,
      value: { status: 'in_progress', completed_at: null },
    });
    expect(applyOpsAction({ kind: 'approval', status: 'approved' }, 'reopen', NOW)).toEqual({
      ok: true,
      value: { status: 'pending_approval', completed_at: null },
    });
  });

  it('refuses transitions that do not apply to the item kind or its current status', () => {
    expect(applyOpsAction({ kind: 'task', status: 'in_progress' }, 'approve', NOW)).toEqual({
      ok: false,
      error: 'approve applies to approvals only',
    });
    expect(applyOpsAction({ kind: 'approval', status: 'pending_approval' }, 'complete', NOW)).toEqual({
      ok: false,
      error: 'complete applies to tasks only',
    });
    expect(applyOpsAction({ kind: 'approval', status: 'approved' }, 'approve', NOW)).toEqual({
      ok: false,
      error: 'approve is not allowed from status approved',
    });
    expect(applyOpsAction({ kind: 'task', status: 'in_progress' }, 'reopen', NOW)).toEqual({
      ok: false,
      error: 'reopen is not allowed from status in_progress',
    });
    expect(applyOpsAction({ kind: 'task', status: 'in_progress' }, 'archive' as never, NOW)).toEqual({
      ok: false,
      error: 'action must be one of: approve, reject, complete, reopen',
    });
  });
});

describe('parseOpsItemPatch', () => {
  it('keeps only allowlisted fields and clears optional text with an empty string', () => {
    expect(
      parseOpsItemPatch({ kind: 'task', status: 'in_progress' }, {
        status: 'blocked',
        priority: 'urgent',
        owner: 'shared',
        nextAction: '  Unblock the vendor call  ',
        decisionNotes: '',
        id: 'must-not-survive',
        completed_at: '2020-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      ok: true,
      value: { status: 'blocked', priority: 'urgent', owner: 'shared', next_action: 'Unblock the vendor call', decision_notes: null },
    });
  });

  it('rejects an empty patch and a status the item kind cannot hold', () => {
    expect(parseOpsItemPatch({ kind: 'task', status: 'in_progress' }, { id: 'abc' })).toEqual({
      ok: false,
      error: 'No supported fields to update',
    });
    expect(parseOpsItemPatch({ kind: 'task', status: 'in_progress' }, { status: 'approved' })).toEqual({
      ok: false,
      error: 'status approved is not valid for a task',
    });
  });

  it('refuses a direct status change that skips the action that owns it', () => {
    // A hand-set status must never reach or leave a terminal state: those
    // belong to complete / approve / reject / reopen.
    expect(parseOpsItemPatch({ kind: 'task', status: 'in_progress' }, { status: 'completed' })).toEqual({
      ok: false,
      error: 'status completed is only set by the complete action',
    });
    expect(parseOpsItemPatch({ kind: 'task', status: 'completed' }, { status: 'in_progress' })).toEqual({
      ok: false,
      error: 'status completed is only cleared by the reopen action',
    });
    expect(parseOpsItemPatch({ kind: 'approval', status: 'pending_approval' }, { status: 'approved' })).toEqual({
      ok: false,
      error: 'status approved is only set by the approve action',
    });
    expect(parseOpsItemPatch({ kind: 'approval', status: 'blocked' }, { status: 'rejected' })).toEqual({
      ok: false,
      error: 'status rejected is only set by the reject action',
    });
    expect(parseOpsItemPatch({ kind: 'approval', status: 'approved' }, { status: 'pending_approval' })).toEqual({
      ok: false,
      error: 'status approved is only cleared by the reopen action',
    });
    // Legal states, but not a legal move between them.
    expect(parseOpsItemPatch({ kind: 'task', status: 'in_progress' }, { status: 'backlog' })).toEqual({
      ok: false,
      error: 'status cannot change directly from in_progress to backlog',
    });
  });

  it('allows the legal direct status moves and a no-op restatement of the current status', () => {
    expect(parseOpsItemPatch({ kind: 'task', status: 'backlog' }, { status: 'in_progress' })).toEqual({
      ok: true,
      value: { status: 'in_progress' },
    });
    expect(parseOpsItemPatch({ kind: 'task', status: 'blocked' }, { status: 'backlog' })).toEqual({
      ok: true,
      value: { status: 'backlog' },
    });
    expect(parseOpsItemPatch({ kind: 'approval', status: 'pending_approval' }, { status: 'blocked' })).toEqual({
      ok: true,
      value: { status: 'blocked' },
    });
    // Saving the edit panel resends the unchanged status; that must not fail.
    expect(parseOpsItemPatch({ kind: 'task', status: 'completed' }, { status: 'completed', priority: 'low' })).toEqual({
      ok: true,
      value: { status: 'completed', priority: 'low' },
    });
  });
});

describe('isLegalDirectStatusChange', () => {
  it('permits exactly the declared task moves', () => {
    const legal: [from: string, to: string][] = [
      ['backlog', 'in_progress'],
      ['backlog', 'blocked'],
      ['in_progress', 'blocked'],
      ['blocked', 'backlog'],
      ['blocked', 'in_progress'],
    ];
    for (const [from, to] of legal) {
      expect(isLegalDirectStatusChange('task', from as never, to as never)).toBe(true);
    }

    const illegal: [from: string, to: string][] = [
      ['in_progress', 'backlog'],
      ['backlog', 'completed'],
      ['in_progress', 'completed'],
      ['blocked', 'completed'],
      ['completed', 'backlog'],
      ['completed', 'in_progress'],
      ['completed', 'blocked'],
      // Statuses that belong to the other kind are never reachable.
      ['in_progress', 'pending_approval'],
      ['in_progress', 'approved'],
    ];
    for (const [from, to] of illegal) {
      expect(isLegalDirectStatusChange('task', from as never, to as never)).toBe(false);
    }
  });

  it('permits exactly the declared approval moves', () => {
    expect(isLegalDirectStatusChange('approval', 'pending_approval', 'blocked')).toBe(true);
    expect(isLegalDirectStatusChange('approval', 'blocked', 'pending_approval')).toBe(true);

    const illegal: [from: string, to: string][] = [
      ['pending_approval', 'approved'],
      ['pending_approval', 'rejected'],
      ['blocked', 'approved'],
      ['blocked', 'rejected'],
      ['approved', 'pending_approval'],
      ['approved', 'rejected'],
      ['rejected', 'pending_approval'],
      ['rejected', 'approved'],
      ['pending_approval', 'in_progress'],
    ];
    for (const [from, to] of illegal) {
      expect(isLegalDirectStatusChange('approval', from as never, to as never)).toBe(false);
    }
  });

  it('treats a restatement of the same status as legal, including terminal ones', () => {
    for (const status of ['backlog', 'in_progress', 'blocked', 'completed'] as const) {
      expect(isLegalDirectStatusChange('task', status, status)).toBe(true);
    }
    for (const status of ['pending_approval', 'blocked', 'approved', 'rejected'] as const) {
      expect(isLegalDirectStatusChange('approval', status, status)).toBe(true);
    }
  });
});

describe('entry statuses on create', () => {
  it('allows only the nonterminal entry statuses for each kind', () => {
    expect(isEntryStatusForKind('task', 'backlog')).toBe(true);
    expect(isEntryStatusForKind('task', 'in_progress')).toBe(true);
    expect(isEntryStatusForKind('task', 'blocked')).toBe(true);
    expect(isEntryStatusForKind('task', 'completed')).toBe(false);

    expect(isEntryStatusForKind('approval', 'pending_approval')).toBe(true);
    expect(isEntryStatusForKind('approval', 'blocked')).toBe(true);
    expect(isEntryStatusForKind('approval', 'approved')).toBe(false);
    expect(isEntryStatusForKind('approval', 'rejected')).toBe(false);
  });

  it('refuses to create an item that is already finished', () => {
    expect(
      parseOpsItemCreate({ kind: 'task', title: 'Ship it', status: 'completed', owner: 'user', priority: 'high' }),
    ).toEqual({ ok: false, error: 'a task cannot be created with status completed' });

    expect(
      parseOpsItemCreate({ kind: 'approval', title: 'Approve the budget', status: 'approved', owner: 'user', priority: 'high' }),
    ).toEqual({ ok: false, error: 'an approval cannot be created with status approved' });

    expect(
      parseOpsItemCreate({ kind: 'approval', title: 'Approve the budget', status: 'rejected', owner: 'user', priority: 'high' }),
    ).toEqual({ ok: false, error: 'an approval cannot be created with status rejected' });
  });

  it('still accepts every nonterminal entry status', () => {
    for (const status of ['backlog', 'in_progress', 'blocked'] as const) {
      const parsed = parseOpsItemCreate({ kind: 'task', title: 'Ship it', status, owner: 'user', priority: 'high' });
      expect(parsed.ok).toBe(true);
    }
    for (const status of ['pending_approval', 'blocked'] as const) {
      const parsed = parseOpsItemCreate({ kind: 'approval', title: 'Decide', status, owner: 'user', priority: 'high' });
      expect(parsed.ok).toBe(true);
    }
  });
});

describe('sortOpsItems', () => {
  const row = (id: string, sort_order: number, created_at: string) => ({ id, sort_order, created_at });

  it('orders by sort_order ascending, then newest created first', () => {
    const sorted = sortOpsItems([
      row('c', 20, '2026-07-01T00:00:00.000Z'),
      row('a', 10, '2026-07-02T00:00:00.000Z'),
      row('b', 10, '2026-07-05T00:00:00.000Z'),
      row('d', 20, '2026-07-09T00:00:00.000Z'),
    ]);
    expect(sorted.map(i => i.id)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('returns a new array and leaves the input untouched', () => {
    const input = [row('a', 20, '2026-07-01T00:00:00.000Z'), row('b', 10, '2026-07-01T00:00:00.000Z')];
    const sorted = sortOpsItems(input);
    expect(sorted).not.toBe(input);
    expect(input.map(i => i.id)).toEqual(['a', 'b']);
    expect(sorted.map(i => i.id)).toEqual(['b', 'a']);
  });
});
