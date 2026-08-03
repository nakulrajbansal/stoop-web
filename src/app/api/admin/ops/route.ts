import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  applyOpsAction,
  isTerminalOpsStatus,
  OPS_ACTIONS,
  OPS_LIST_LIMIT,
  parseOpsItemCreate,
  parseOpsItemPatch,
  type OpsAction,
  type OpsItemPatch,
  type OpsKind,
  type OpsStatus,
} from '@/lib/ops';

export const dynamic = 'force-dynamic';

const SELECT = `
  id, kind, title, summary, status, owner, priority, due_at, next_action,
  approval_question, decision_notes, source_url, sort_order,
  created_at, updated_at, completed_at
`;

function denied() {
  // Same shape as /api/admin/reports: never confirm the route exists.
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

async function readJson(req: NextRequest): Promise<unknown | undefined> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export async function GET() {
  if (!(await getAdminUser())) return denied();

  const { data, error } = await supabaseAdmin
    .from('ops_items')
    .select(SELECT)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(OPS_LIST_LIMIT);

  if (error) return NextResponse.json({ error: 'Could not load ops items' }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await getAdminUser())) return denied();

  const body = await readJson(req);
  if (body === undefined) return badRequest('Invalid request body');

  const parsed = parseOpsItemCreate(body);
  if (!parsed.ok) return badRequest(parsed.error);

  const { data, error } = await supabaseAdmin
    .from('ops_items')
    // Creation is restricted to nonterminal entry statuses, so a new row is
    // never born already finished and completed_at always starts empty.
    .insert({ ...parsed.value, completed_at: null })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: 'Could not save the item' }, { status: 500 });
  return NextResponse.json({ item: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!(await getAdminUser())) return denied();

  const body = await readJson(req);
  if (body === undefined || typeof body !== 'object' || body === null || Array.isArray(body)) {
    return badRequest('Invalid request body');
  }

  const { id, action } = body as { id?: unknown; action?: unknown };
  if (typeof id !== 'string' || !id.trim()) return badRequest('id is required');

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('ops_items')
    .select('id, kind, status')
    .eq('id', id)
    .maybeSingle();
  // A failed read is a server problem, not a missing item: saying "not found"
  // here would tell the owner their work vanished when it did not.
  if (lookupError) return NextResponse.json({ error: 'Could not load the item' }, { status: 500 });
  // Cast: the generated row type collapses to `never` here, as elsewhere in
  // this codebase (see src/lib/rate-limit.ts). The shape is the select above.
  const current = existing as { id: string; kind: OpsKind; status: OpsStatus } | null;
  if (!current) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  type OpsUpdate = OpsItemPatch & { completed_at?: string | null };
  let patch: OpsUpdate = {};

  if (action !== undefined) {
    if (typeof action !== 'string' || !(OPS_ACTIONS as readonly string[]).includes(action)) {
      return badRequest(`action must be one of: ${OPS_ACTIONS.join(', ')}`);
    }
    const transition = applyOpsAction(
      { kind: current.kind, status: current.status },
      action as OpsAction,
      new Date().toISOString(),
    );
    if (!transition.ok) return badRequest(transition.error);
    patch = { ...transition.value };

    // Notes may ride along with a decision (approve/reject) or a completion.
    const notes = (body as Record<string, unknown>).decisionNotes;
    if (notes !== undefined) {
      const withNotes = parseOpsItemPatch({ kind: current.kind, status: current.status }, { decisionNotes: notes });
      if (!withNotes.ok) return badRequest(withNotes.error);
      patch = { ...patch, ...withNotes.value };
    }
  } else {
    const parsed = parseOpsItemPatch({ kind: current.kind, status: current.status }, body);
    if (!parsed.ok) return badRequest(parsed.error);
    patch = parsed.value;

    // Keep completed_at in step with a hand-set status change. Restating the
    // current status must not restamp it, or every save would move the clock.
    if (patch.status && patch.status !== current.status) {
      patch.completed_at = isTerminalOpsStatus(patch.status) ? new Date().toISOString() : null;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('ops_items')
    // Cast: supabase-js's generated Update argument collapses to `never`
    // against this repo's hand-written Database types (same in the reports
    // route). The payload itself is validated above.
    .update(patch as unknown as never)
    .eq('id', id)
    // Optimistic lock: the decision above was made against this status, so the
    // write only lands if nobody changed it in another tab in the meantime.
    .eq('status', current.status)
    .select(SELECT)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Could not update the item' }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: 'This item changed somewhere else. Reload the board and try again.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ item: data });
}
