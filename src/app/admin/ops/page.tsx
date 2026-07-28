import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAdminUser } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import Nav from '@/components/Nav';
import AdminNav from '@/components/AdminNav';
import { OPS_LIST_LIMIT } from '@/lib/ops';
import OpsBoard, { type OpsItem } from './OpsBoard';

export const dynamic = 'force-dynamic';

// Private board. Keep it out of every index, not just ours.
export const metadata: Metadata = {
  title: 'Ops',
  robots: { index: false, follow: false, nocache: true }
};

export default async function AdminOpsPage() {
  const admin = await getAdminUser();
  if (!admin) notFound();

  const { data, error } = await supabaseAdmin
    .from('ops_items')
    .select(`
      id, kind, title, summary, status, owner, priority, due_at, next_action,
      approval_question, decision_notes, source_url, sort_order,
      created_at, updated_at, completed_at
    `)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(OPS_LIST_LIMIT);

  const items = (data ?? []) as OpsItem[];

  return (
    <>
      <Nav />
      <div className="max-w-[680px] mx-auto px-5 sm:px-6 py-8 sm:py-10">
        <AdminNav current="/admin/ops" />
        <h1 className="text-[18px] font-semibold text-ink mb-1">Ops</h1>
        <p className="text-[13px] text-muted mb-6">
          The short list: what is moving, what is stuck, and what is waiting on a decision.
        </p>
        {error ? (
          // An empty board and a broken read look identical, and one of them is
          // a lie. Say which one this is instead of showing a clean slate.
          <div
            role="alert"
            className="bg-card border border-[var(--border2)] rounded-[14px] px-5 py-6 text-[13px] text-ink-2 leading-[1.55]"
          >
            <p className="text-danger font-medium mb-1">The board could not load.</p>
            <p>
              Nothing was lost; this page just could not reach the database. Reload to try again.
              If it keeps failing, check that migration 0006 has been run.
            </p>
          </div>
        ) : (
          <OpsBoard initialItems={items} />
        )}
      </div>
    </>
  );
}
