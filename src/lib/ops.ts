// Domain rules for the private operations dashboard (/admin/ops).
// Pure functions only: no Supabase, no env, no request objects, so every rule
// here is testable without credentials.

export const OPS_KINDS = ['task', 'approval'] as const;
export const OPS_STATUSES = [
  'backlog',
  'in_progress',
  'blocked',
  'pending_approval',
  'approved',
  'rejected',
  'completed',
] as const;
export const OPS_OWNERS = ['user', 'curio', 'shared'] as const;
export const OPS_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export type OpsKind = (typeof OPS_KINDS)[number];
export type OpsStatus = (typeof OPS_STATUSES)[number];
export type OpsOwner = (typeof OPS_OWNERS)[number];
export type OpsPriority = (typeof OPS_PRIORITIES)[number];

export const MAX_LENGTHS = {
  title: 120,
  summary: 600,
  next_action: 240,
  approval_question: 400,
  decision_notes: 600,
  source_url: 500,
} as const;

export type OpsItemFields = {
  kind: OpsKind;
  title: string;
  summary: string | null;
  status: OpsStatus;
  owner: OpsOwner;
  priority: OpsPriority;
  next_action: string | null;
  approval_question: string | null;
  decision_notes: string | null;
  source_url: string | null;
  due_at: string | null;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function asRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function optionalText(value: unknown, field: keyof typeof MAX_LENGTHS): ParseResult<string | null> {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: `${field} must be text` };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > MAX_LENGTHS[field]) {
    return { ok: false, error: `${field} must be ${MAX_LENGTHS[field]} characters or fewer` };
  }
  return { ok: true, value: trimmed };
}

// Which statuses each kind of item is allowed to sit in. Tasks move through
// work states; approvals wait on a decision.
export const STATUSES_BY_KIND: Record<OpsKind, readonly OpsStatus[]> = {
  task: ['backlog', 'in_progress', 'blocked', 'completed'],
  approval: ['pending_approval', 'blocked', 'approved', 'rejected'],
};

export function isStatusAllowedForKind(kind: OpsKind, status: OpsStatus): boolean {
  return STATUSES_BY_KIND[kind].includes(status);
}

// Statuses a brand new item may be created in. A finished item cannot be born
// finished: completed, approved, and rejected are reached through an action.
export const ENTRY_STATUSES_BY_KIND: Record<OpsKind, readonly OpsStatus[]> = {
  task: ['backlog', 'in_progress', 'blocked'],
  approval: ['pending_approval', 'blocked'],
};

export function isEntryStatusForKind(kind: OpsKind, status: OpsStatus): boolean {
  return ENTRY_STATUSES_BY_KIND[kind].includes(status);
}

// The status changes a plain edit (the status dropdown) is allowed to make.
// Terminal statuses are deliberately absent in both directions: reaching one is
// the job of complete/approve/reject, and leaving one is the job of reopen.
export const DIRECT_STATUS_TRANSITIONS: Record<OpsKind, Partial<Record<OpsStatus, readonly OpsStatus[]>>> = {
  task: {
    backlog: ['in_progress', 'blocked'],
    in_progress: ['blocked'],
    blocked: ['backlog', 'in_progress'],
    completed: [],
  },
  approval: {
    pending_approval: ['blocked'],
    blocked: ['pending_approval'],
    approved: [],
    rejected: [],
  },
};

// Pure: is this a status change the edit form may make on its own? Restating
// the current status is always fine, so saving an untouched dropdown works.
export function isLegalDirectStatusChange(kind: OpsKind, from: OpsStatus, to: OpsStatus): boolean {
  if (!isStatusAllowedForKind(kind, from) || !isStatusAllowedForKind(kind, to)) return false;
  if (from === to) return true;
  return (DIRECT_STATUS_TRANSITIONS[kind][from] ?? []).includes(to);
}

// A finished item: reached only by an action, left only by reopen.
export const OPS_TERMINAL_STATUSES = ['completed', 'approved', 'rejected'] as const;

export function isTerminalOpsStatus(status: OpsStatus): boolean {
  return (OPS_TERMINAL_STATUSES as readonly OpsStatus[]).includes(status);
}

// Terminal statuses and the action that owns entering each one.
const ACTION_OWNING_STATUS: Partial<Record<OpsStatus, string>> = {
  completed: 'complete',
  approved: 'approve',
  rejected: 'reject',
};

function directStatusChangeError(from: OpsStatus, to: OpsStatus): string {
  const entering = ACTION_OWNING_STATUS[to];
  if (entering) return `status ${to} is only set by the ${entering} action`;
  if (ACTION_OWNING_STATUS[from]) return `status ${from} is only cleared by the reopen action`;
  return `status cannot change directly from ${from} to ${to}`;
}

function kindArticle(kind: OpsKind): string {
  return kind === 'approval' ? 'an approval' : 'a task';
}

// Board order, kept identical to the server query (sort_order asc, then newest
// first) so the client list stays in the same order after inserts and edits.
export function compareOpsItems(
  a: { sort_order: number; created_at: string },
  b: { sort_order: number; created_at: string },
): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return b.created_at.localeCompare(a.created_at);
}

export function sortOpsItems<T extends { sort_order: number; created_at: string }>(items: readonly T[]): T[] {
  return [...items].sort(compareOpsItems);
}

// How many rows the board loads in one read. Shared by the page, the API, and
// the client so the "showing the first N" notice can never drift.
export const OPS_LIST_LIMIT = 300;

function parseSourceUrl(value: unknown): ParseResult<string | null> {
  const text = optionalText(value, 'source_url');
  if (!text.ok || !text.value) return text;

  try {
    const url = new URL(text.value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, error: 'source_url must be an http or https link' };
    }
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, error: 'source_url must be an http or https link' };
  }
}

function parseDueAt(value: unknown): ParseResult<string | null> {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: 'due_at must be a valid date' };
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) return { ok: false, error: 'due_at must be a valid date' };
  return { ok: true, value: parsed.toISOString() };
}

export const OPS_ACTIONS = ['approve', 'reject', 'complete', 'reopen'] as const;
export type OpsAction = (typeof OPS_ACTIONS)[number];

type ActionRule = {
  kind: OpsKind;
  from: readonly OpsStatus[];
  to: OpsStatus;
  clearsCompletion: boolean;
};

const ACTION_RULES: Record<OpsAction, ActionRule[]> = {
  approve: [{ kind: 'approval', from: ['pending_approval', 'blocked'], to: 'approved', clearsCompletion: false }],
  reject: [{ kind: 'approval', from: ['pending_approval', 'blocked'], to: 'rejected', clearsCompletion: false }],
  complete: [{ kind: 'task', from: ['backlog', 'in_progress', 'blocked'], to: 'completed', clearsCompletion: false }],
  reopen: [
    { kind: 'task', from: ['completed'], to: 'in_progress', clearsCompletion: true },
    { kind: 'approval', from: ['approved', 'rejected'], to: 'pending_approval', clearsCompletion: true },
  ],
};

export type OpsTransition = { status: OpsStatus; completed_at: string | null };

// The one place that decides whether a status change is legal. The API routes
// call this before touching Supabase, so no invalid state can be written.
export function applyOpsAction(
  item: { kind: OpsKind; status: OpsStatus },
  action: OpsAction,
  nowIso: string,
): ParseResult<OpsTransition> {
  const rules = ACTION_RULES[action];
  if (!rules) return { ok: false, error: `action must be one of: ${OPS_ACTIONS.join(', ')}` };

  const rule = rules.find(r => r.kind === item.kind);
  if (!rule) {
    const kinds = rules.map(r => (r.kind === 'approval' ? 'approvals' : 'tasks')).join(' or ');
    return { ok: false, error: `${action} applies to ${kinds} only` };
  }

  if (!rule.from.includes(item.status)) {
    return { ok: false, error: `${action} is not allowed from status ${item.status}` };
  }

  return { ok: true, value: { status: rule.to, completed_at: rule.clearsCompletion ? null : nowIso } };
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): ParseResult<T> {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return { ok: true, value: value as T };
  }
  return { ok: false, error: `${field} must be one of: ${allowed.join(', ')}` };
}

export function parseOpsItemCreate(body: unknown): ParseResult<OpsItemFields> {
  const input = asRecord(body);
  if (!input) return { ok: false, error: 'Invalid request body' };

  const kind = oneOf(input.kind, OPS_KINDS, 'kind');
  if (!kind.ok) return kind;
  const status = oneOf(input.status, OPS_STATUSES, 'status');
  if (!status.ok) return status;
  const owner = oneOf(input.owner, OPS_OWNERS, 'owner');
  if (!owner.ok) return owner;
  const priority = oneOf(input.priority, OPS_PRIORITIES, 'priority');
  if (!priority.ok) return priority;

  if (!isStatusAllowedForKind(kind.value, status.value)) {
    return { ok: false, error: `status ${status.value} is not valid for ${kindArticle(kind.value)}` };
  }
  if (!isEntryStatusForKind(kind.value, status.value)) {
    return { ok: false, error: `${kindArticle(kind.value)} cannot be created with status ${status.value}` };
  }

  const title = optionalText(input.title, 'title');
  if (!title.ok) return title;
  if (!title.value) return { ok: false, error: 'title is required' };

  const summary = optionalText(input.summary, 'summary');
  if (!summary.ok) return summary;
  const nextAction = optionalText(input.nextAction ?? input.next_action, 'next_action');
  if (!nextAction.ok) return nextAction;
  const approvalQuestion = optionalText(input.approvalQuestion ?? input.approval_question, 'approval_question');
  if (!approvalQuestion.ok) return approvalQuestion;
  const decisionNotes = optionalText(input.decisionNotes ?? input.decision_notes, 'decision_notes');
  if (!decisionNotes.ok) return decisionNotes;
  const sourceUrl = parseSourceUrl(input.sourceUrl ?? input.source_url);
  if (!sourceUrl.ok) return sourceUrl;
  const dueAt = parseDueAt(input.dueAt ?? input.due_at);
  if (!dueAt.ok) return dueAt;

  return {
    ok: true,
    value: {
      kind: kind.value,
      title: title.value,
      summary: summary.value,
      status: status.value,
      owner: owner.value,
      priority: priority.value,
      next_action: nextAction.value,
      approval_question: approvalQuestion.value,
      decision_notes: decisionNotes.value,
      source_url: sourceUrl.value,
      due_at: dueAt.value,
    },
  };
}

export type OpsItemPatch = Partial<Omit<OpsItemFields, 'kind'>>;

// Edits are partial by design: only the fields the owner actually touched are
// sent. Anything not on this list (id, timestamps, kind) can never be patched.
export function parseOpsItemPatch(
  current: { kind: OpsKind; status: OpsStatus },
  body: unknown,
): ParseResult<OpsItemPatch> {
  const input = asRecord(body);
  if (!input) return { ok: false, error: 'Invalid request body' };

  const patch: OpsItemPatch = {};

  if (input.status !== undefined) {
    const status = oneOf(input.status, OPS_STATUSES, 'status');
    if (!status.ok) return status;
    if (!isStatusAllowedForKind(current.kind, status.value)) {
      return { ok: false, error: `status ${status.value} is not valid for ${kindArticle(current.kind)}` };
    }
    // A hand-set status must obey the same transition map as the buttons, so
    // the edit dropdown can never be used to skip an action.
    if (!isLegalDirectStatusChange(current.kind, current.status, status.value)) {
      return { ok: false, error: directStatusChangeError(current.status, status.value) };
    }
    patch.status = status.value;
  }

  if (input.owner !== undefined) {
    const owner = oneOf(input.owner, OPS_OWNERS, 'owner');
    if (!owner.ok) return owner;
    patch.owner = owner.value;
  }

  if (input.priority !== undefined) {
    const priority = oneOf(input.priority, OPS_PRIORITIES, 'priority');
    if (!priority.ok) return priority;
    patch.priority = priority.value;
  }

  if (input.title !== undefined) {
    const title = optionalText(input.title, 'title');
    if (!title.ok) return title;
    if (!title.value) return { ok: false, error: 'title is required' };
    patch.title = title.value;
  }

  const optionalFields: [unknown, keyof typeof MAX_LENGTHS, keyof OpsItemPatch][] = [
    [input.summary, 'summary', 'summary'],
    [input.nextAction ?? input.next_action, 'next_action', 'next_action'],
    [input.approvalQuestion ?? input.approval_question, 'approval_question', 'approval_question'],
    [input.decisionNotes ?? input.decision_notes, 'decision_notes', 'decision_notes'],
  ];
  for (const [raw, field, key] of optionalFields) {
    if (raw === undefined) continue;
    const parsed = optionalText(raw, field);
    if (!parsed.ok) return parsed;
    (patch as Record<string, unknown>)[key] = parsed.value;
  }

  const rawSourceUrl = input.sourceUrl ?? input.source_url;
  if (rawSourceUrl !== undefined) {
    const sourceUrl = parseSourceUrl(rawSourceUrl);
    if (!sourceUrl.ok) return sourceUrl;
    patch.source_url = sourceUrl.value;
  }

  const rawDueAt = input.dueAt ?? input.due_at;
  if (rawDueAt !== undefined) {
    const dueAt = parseDueAt(rawDueAt);
    if (!dueAt.ok) return dueAt;
    patch.due_at = dueAt.value;
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: 'No supported fields to update' };
  return { ok: true, value: patch };
}
