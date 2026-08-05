'use client';

import { useMemo, useRef, useState } from 'react';
import {
  isLegalDirectStatusChange,
  isTerminalOpsStatus,
  OPS_LIST_LIMIT,
  OPS_OWNERS,
  OPS_PRIORITIES,
  sortOpsItems,
  STATUSES_BY_KIND,
  type OpsKind,
  type OpsOwner,
  type OpsPriority,
  type OpsStatus
} from '@/lib/ops';

export type OpsItem = {
  id: string;
  kind: OpsKind;
  title: string;
  summary: string | null;
  status: OpsStatus;
  owner: OpsOwner;
  priority: OpsPriority;
  due_at: string | null;
  next_action: string | null;
  approval_question: string | null;
  decision_notes: string | null;
  source_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const STATUS_LABELS: Record<OpsStatus, string> = {
  backlog: 'Backlog',
  in_progress: 'In progress',
  blocked: 'Blocked',
  pending_approval: 'Waiting on a decision',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Done'
};

const OWNER_LABELS: Record<OpsOwner, string> = { user: 'You', curio: 'Curio', shared: 'Shared' };
const PRIORITY_LABELS: Record<OpsPriority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };

// Priority colors reuse the palette: mustard for waiting, danger only for urgent.
const PRIORITY_STYLE: Record<OpsPriority, string> = {
  low: 'text-muted',
  medium: 'text-ink-2',
  high: 'text-gold-2',
  urgent: 'text-danger'
};

// How many finished items the board shows before it says how many it is hiding.
const DONE_VISIBLE = 8;

function formatDue(iso: string | null): string | null {
  if (!iso) return null;
  // Browser timezone, never recomputed on the server (see CLAUDE.md gotcha 4).
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

export default function OpsBoard({ initialItems }: { initialItems: OpsItem[] }) {
  const [items, setItems] = useState<OpsItem[]>(() => sortOpsItems(initialItems));
  // One key per in-flight request (an item id, or 'new' for the create form) so
  // two cards being saved at once each stay locked on their own.
  const inFlight = useRef<Set<string>>(new Set());
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // The first read is capped, so a full page means there may be more behind it.
  const listCapped = initialItems.length >= OPS_LIST_LIMIT;

  async function send(method: 'POST' | 'PATCH', body: Record<string, unknown>, id?: string) {
    const key = id ?? 'new';
    // A second click while the first request is still open is a duplicate, not
    // a new intent. Drop it rather than racing two writes on the same row.
    if (inFlight.current.has(key)) return null;
    inFlight.current.add(key);
    setBusyKeys(new Set(inFlight.current));
    setError(null);
    try {
      const res = await fetch('/api/admin/ops', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error ?? 'Something went wrong.');
        return null;
      }
      const item = payload.item as OpsItem;
      setItems(prev =>
        sortOpsItems(method === 'POST' ? [...prev, item] : prev.map(i => (i.id === item.id ? item : i)))
      );
      return item;
    } catch {
      setError('Network error. Try again.');
      return null;
    } finally {
      inFlight.current.delete(key);
      setBusyKeys(new Set(inFlight.current));
    }
  }

  const groups = useMemo(() => {
    const open = items.filter(i => !isTerminalOpsStatus(i.status));
    const done = items
      .filter(i => isTerminalOpsStatus(i.status))
      .sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at));
    return {
      approvals: open.filter(i => i.kind === 'approval'),
      active: open.filter(i => i.kind === 'task' && i.status !== 'blocked'),
      blocked: open.filter(i => i.kind === 'task' && i.status === 'blocked'),
      done: done.slice(0, DONE_VISIBLE),
      doneHidden: Math.max(0, done.length - DONE_VISIBLE)
    };
  }, [items]);

  const counts = [
    { label: 'Waiting on you', value: groups.approvals.length },
    { label: 'Active', value: groups.active.length },
    { label: 'Blocked', value: groups.blocked.length }
  ];

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-6">
        {counts.map(c => (
          <div key={c.label} className="bg-card border border-[var(--border)] rounded-[14px] px-3 py-3 text-center">
            <div className="font-serif text-[24px] font-bold text-ink leading-none">{c.value}</div>
            <div className="text-[11px] text-muted mt-1.5 leading-tight">{c.label}</div>
          </div>
        ))}
      </div>

      {listCapped && (
        <p role="status" className="text-[12px] text-muted mb-4 leading-[1.5]">
          Showing the first {OPS_LIST_LIMIT} items. Older items exist beyond this list; finish or reopen
          what is here to bring the rest into view.
        </p>
      )}

      {error && (
        <p role="alert" className="text-[12.5px] text-danger mb-4">{error}</p>
      )}

      <CreateForm
        open={creating}
        busy={busyKeys.has('new')}
        onToggle={() => setCreating(v => !v)}
        onSubmit={async body => {
          const created = await send('POST', body);
          if (created) setCreating(false);
        }}
      />

      <Section title="Pending approvals" hint="Decisions waiting on you.">
        {groups.approvals.length === 0 ? (
          <Empty>No decisions are waiting.</Empty>
        ) : (
          groups.approvals.map(item => (
            <Card key={item.id} item={item} busy={busyKeys.has(item.id)} send={send} />
          ))
        )}
      </Section>

      <Section title="Active work">
        {groups.active.length === 0 ? (
          <Empty>Nothing in flight.</Empty>
        ) : (
          groups.active.map(item => <Card key={item.id} item={item} busy={busyKeys.has(item.id)} send={send} />)
        )}
      </Section>

      {groups.blocked.length > 0 && (
        <Section title="Blocked" hint="Stuck until something else moves.">
          {groups.blocked.map(item => <Card key={item.id} item={item} busy={busyKeys.has(item.id)} send={send} />)}
        </Section>
      )}

      {groups.done.length > 0 && (
        <Section title="Recently completed">
          {groups.done.map(item => <Card key={item.id} item={item} busy={busyKeys.has(item.id)} send={send} />)}
          {groups.doneHidden > 0 && (
            <p className="text-[12px] text-muted mt-1">
              +{groups.doneHidden} more completed {groups.doneHidden === 1 ? 'item' : 'items'} not shown.
            </p>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-1">{title}</h2>
      {hint && <p className="text-[11.5px] text-muted mb-2">{hint}</p>}
      <div className="flex flex-col gap-3 mt-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card border border-[var(--border)] rounded-[14px] px-5 py-6 text-center text-[13px] text-muted">
      {children}
    </div>
  );
}

type Send = (method: 'POST' | 'PATCH', body: Record<string, unknown>, id?: string) => Promise<OpsItem | null>;

// Everything the edit form can change, held in one place so a save sends the
// whole set at once and nothing typed is lost on the way.
type Draft = {
  status: OpsStatus;
  owner: OpsOwner;
  priority: OpsPriority;
  title: string;
  summary: string;
  nextAction: string;
  decisionNotes: string;
};

function draftFrom(item: OpsItem): Draft {
  return {
    status: item.status,
    owner: item.owner,
    priority: item.priority,
    title: item.title,
    summary: item.summary ?? '',
    nextAction: item.next_action ?? '',
    decisionNotes: item.decision_notes ?? ''
  };
}

function Card({ item, busy, send }: { item: OpsItem; busy: boolean; send: Send }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(item));
  // Resync the draft when the server hands back a newer row (our own save, a
  // decision, a reopen). Nothing else mutates this card, so no typing is lost.
  const [syncedAt, setSyncedAt] = useState(item.updated_at);
  if (syncedAt !== item.updated_at) {
    setSyncedAt(item.updated_at);
    setDraft(draftFrom(item));
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(d => ({ ...d, [key]: value }));

  const due = formatDue(item.due_at);
  const resolved = isTerminalOpsStatus(item.status);
  // An open approval carries its notes next to the decision buttons, so what
  // the owner types is part of the decision instead of a separate save.
  const notesWithDecision = item.kind === 'approval' && !resolved;
  const fieldId = (field: string) => `${item.id}-${field}`;

  return (
    <article className="bg-card border border-[var(--border2)] rounded-[14px] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <h3 className="text-[14.5px] font-semibold text-ink leading-snug">{item.title}</h3>
        <span className={`text-[11px] font-mono uppercase tracking-wider flex-shrink-0 ${PRIORITY_STYLE[item.priority]}`}>
          {PRIORITY_LABELS[item.priority]}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted mb-2">
        <span>{OWNER_LABELS[item.owner]}</span>
        <span aria-hidden="true">·</span>
        <span>{STATUS_LABELS[item.status]}</span>
        {due && (
          <>
            <span aria-hidden="true">·</span>
            <span className={item.status === 'blocked' ? '' : 'text-ink-2'}>Due {due}</span>
          </>
        )}
      </div>

      {item.summary && <p className="text-[13px] text-ink-2 leading-[1.55] mb-2">{item.summary}</p>}

      {item.approval_question && (
        <p className="text-[13px] text-ink leading-[1.55] mb-2">
          <span className="text-gold-2 font-medium">Decision: </span>{item.approval_question}
        </p>
      )}

      {item.next_action && !resolved && (
        <p className="text-[12.5px] text-ink leading-[1.5] mb-2">
          <span className="text-muted font-mono uppercase tracking-wider text-[10.5px]">Next </span>
          {item.next_action}
        </p>
      )}

      {item.decision_notes && !notesWithDecision && (
        <p className="text-[12.5px] text-muted leading-[1.5] mb-2">{item.decision_notes}</p>
      )}

      {item.source_url && (
        <a
          href={item.source_url}
          className="text-[12px] text-accent underline underline-offset-2 inline-block mb-2"
          target="_blank"
          rel="noreferrer"
        >
          Reference link
        </a>
      )}

      {notesWithDecision && (
        <div className="mt-3">
          <Field label="Decision notes" htmlFor={fieldId('notes')}>
            <textarea
              id={fieldId('notes')}
              className="input"
              rows={2}
              maxLength={600}
              value={draft.decisionNotes}
              onChange={e => set('decisionNotes', e.target.value)}
            />
          </Field>
          <p className="text-[11.5px] text-muted mt-1">Saved with Approve, Reject, or Save.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {item.kind === 'approval' && !resolved && (
          <>
            <button className="btn btn-sm btn-accent" disabled={busy}
              onClick={() => send('PATCH', { id: item.id, action: 'approve', decisionNotes: draft.decisionNotes }, item.id)}>
              Approve
            </button>
            <button className="btn btn-sm btn-ghost" disabled={busy}
              onClick={() => send('PATCH', { id: item.id, action: 'reject', decisionNotes: draft.decisionNotes }, item.id)}>
              Reject
            </button>
          </>
        )}
        {item.kind === 'task' && !resolved && (
          <button className="btn btn-sm btn-accent" disabled={busy}
            onClick={() => send('PATCH', { id: item.id, action: 'complete', decisionNotes: draft.decisionNotes }, item.id)}>
            Mark done
          </button>
        )}
        {resolved && (
          <button className="btn btn-sm btn-ghost" disabled={busy}
            onClick={() => send('PATCH', { id: item.id, action: 'reopen' }, item.id)}>Reopen</button>
        )}
        <button className="btn btn-sm btn-ghost" disabled={busy} aria-expanded={editing}
          onClick={() => setEditing(v => !v)}>{editing ? 'Close' : 'Edit'}</button>
      </div>

      {editing && (
        <EditPanel
          item={item}
          draft={draft}
          set={set}
          busy={busy}
          send={send}
          showNotes={!notesWithDecision}
          onDone={() => setEditing(false)}
        />
      )}
    </article>
  );
}

function EditPanel({
  item, draft, set, busy, send, showNotes, onDone
}: {
  item: OpsItem;
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  busy: boolean;
  send: Send;
  showNotes: boolean;
  onDone: () => void;
}) {
  const fieldId = (field: string) => `${item.id}-edit-${field}`;

  // Only offer moves the server will accept. Finishing and reopening belong to
  // the buttons above, so they never appear in this dropdown.
  const statusOptions = STATUSES_BY_KIND[item.kind].filter(s =>
    isLegalDirectStatusChange(item.kind, item.status, s)
  );

  return (
    <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Field label="Status" htmlFor={fieldId('status')}>
          <select id={fieldId('status')} className="input" value={draft.status} disabled={busy}
            onChange={e => set('status', e.target.value as OpsStatus)}>
            {statusOptions.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="Owner" htmlFor={fieldId('owner')}>
          <select id={fieldId('owner')} className="input" value={draft.owner} disabled={busy}
            onChange={e => set('owner', e.target.value as OpsOwner)}>
            {OPS_OWNERS.map(o => <option key={o} value={o}>{OWNER_LABELS[o]}</option>)}
          </select>
        </Field>
        <Field label="Priority" htmlFor={fieldId('priority')}>
          <select id={fieldId('priority')} className="input" value={draft.priority} disabled={busy}
            onChange={e => set('priority', e.target.value as OpsPriority)}>
            {OPS_PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Title" htmlFor={fieldId('title')}>
        <input id={fieldId('title')} className="input" value={draft.title} maxLength={120}
          onChange={e => set('title', e.target.value)} />
      </Field>
      <Field label="Summary" htmlFor={fieldId('summary')}>
        <textarea id={fieldId('summary')} className="input" rows={3} maxLength={600} value={draft.summary}
          onChange={e => set('summary', e.target.value)} />
      </Field>
      <Field label="Next action" htmlFor={fieldId('next')}>
        <input id={fieldId('next')} className="input" value={draft.nextAction} maxLength={240}
          onChange={e => set('nextAction', e.target.value)} />
      </Field>
      {showNotes && (
        <Field label="Blocker or decision notes" htmlFor={fieldId('notes')}>
          <textarea id={fieldId('notes')} className="input" rows={2} maxLength={600} value={draft.decisionNotes}
            onChange={e => set('decisionNotes', e.target.value)} />
        </Field>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm btn-accent" disabled={busy}
          onClick={async () => {
            // Everything goes in one request: a regroup mid-edit cannot drop
            // half the form on the floor.
            const saved = await send('PATCH', {
              id: item.id,
              status: draft.status,
              owner: draft.owner,
              priority: draft.priority,
              title: draft.title,
              summary: draft.summary,
              nextAction: draft.nextAction,
              decisionNotes: draft.decisionNotes
            }, item.id);
            if (saved) onDone();
          }}>Save</button>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[11px] font-mono uppercase tracking-wider text-muted">{label}</label>
      {children}
    </div>
  );
}

function CreateForm({
  open, busy, onToggle, onSubmit
}: {
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [kind, setKind] = useState<OpsKind>('task');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [owner, setOwner] = useState<OpsOwner>('user');
  const [priority, setPriority] = useState<OpsPriority>('medium');
  const [nextAction, setNextAction] = useState('');
  const [approvalQuestion, setApprovalQuestion] = useState('');
  const [dueAt, setDueAt] = useState('');

  // Both are entry statuses: nothing is ever created already finished.
  const status: OpsStatus = kind === 'approval' ? 'pending_approval' : 'in_progress';

  return (
    <div className="mb-8">
      <button className="btn btn-sm btn-ghost btn-full sm:w-auto" aria-expanded={open} onClick={onToggle}>
        {open ? 'Close' : 'Add an item'}
      </button>

      {open && (
        <form
          className="mt-3 bg-card border border-[var(--border2)] rounded-[14px] p-4 sm:p-5 flex flex-col gap-3"
          onSubmit={e => {
            e.preventDefault();
            onSubmit({
              kind, title, summary, status, owner, priority, nextAction,
              approvalQuestion: kind === 'approval' ? approvalQuestion : '',
              // datetime-local has no zone; the browser's own offset is applied here.
              dueAt: dueAt ? new Date(dueAt).toISOString() : ''
            });
          }}
        >
          <fieldset className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-0 p-0 m-0">
            <legend className="sr-only">New ops item</legend>
            <Field label="Type" htmlFor="new-kind">
              <select id="new-kind" className="input" value={kind} onChange={e => setKind(e.target.value as OpsKind)}>
                <option value="task">Task</option>
                <option value="approval">Approval</option>
              </select>
            </Field>
            <Field label="Owner" htmlFor="new-owner">
              <select id="new-owner" className="input" value={owner} onChange={e => setOwner(e.target.value as OpsOwner)}>
                {OPS_OWNERS.map(o => <option key={o} value={o}>{OWNER_LABELS[o]}</option>)}
              </select>
            </Field>
            <Field label="Priority" htmlFor="new-priority">
              <select id="new-priority" className="input" value={priority}
                onChange={e => setPriority(e.target.value as OpsPriority)}>
                {OPS_PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </Field>
          </fieldset>

          <Field label="Title" htmlFor="new-title">
            <input id="new-title" className="input" required maxLength={120} value={title}
              onChange={e => setTitle(e.target.value)} />
          </Field>
          <Field label="Summary" htmlFor="new-summary">
            <textarea id="new-summary" className="input" rows={3} maxLength={600} value={summary}
              onChange={e => setSummary(e.target.value)} />
          </Field>

          {kind === 'approval' ? (
            <Field label="What is being decided" htmlFor="new-question">
              <textarea id="new-question" className="input" rows={2} maxLength={400} value={approvalQuestion}
                onChange={e => setApprovalQuestion(e.target.value)} />
            </Field>
          ) : (
            <Field label="Next action" htmlFor="new-next">
              <input id="new-next" className="input" maxLength={240} value={nextAction}
                onChange={e => setNextAction(e.target.value)} />
            </Field>
          )}

          <Field label="Due (optional)" htmlFor="new-due">
            <input id="new-due" type="datetime-local" className="input" value={dueAt}
              onChange={e => setDueAt(e.target.value)} />
          </Field>

          <button type="submit" className="btn btn-sm btn-accent btn-full sm:w-auto" disabled={busy || !title.trim()}>
            {busy ? 'Saving…' : 'Add item'}
          </button>
        </form>
      )}
    </div>
  );
}
