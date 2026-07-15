import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import Nav from '@/components/Nav';
import ReportActions from './ReportActions';

export const dynamic = 'force-dynamic';

const REASON_LABELS: Record<string, string> = {
  harassment: 'Harassment or threats',
  inappropriate_messages: 'Inappropriate messages',
  unsafe_behavior: 'No-show or unsafe behavior',
  fake_profile: 'Fake profile',
  other: 'Something else'
};

function when(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

export default async function AdminReportsPage() {
  // Gate: only the founder account may view this page.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !process.env.ADMIN_USER_ID || user.id !== process.env.ADMIN_USER_ID) {
    notFound();
  }

  const { data: reports } = await supabaseAdmin
    .from('reports')
    .select(`
      id, reason, details, status, created_at, conversation_id,
      reporter:profiles!reports_reporter_id_fkey(id, name),
      reported:profiles!reports_reported_user_id_fkey(id, name, blocked_at, warned_at)
    `)
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  // Pull a little conversation context for each linked conversation.
  const convIds = (reports ?? []).map((r: any) => r.conversation_id).filter(Boolean);
  const messagesByConv: Record<string, { from_user_id: string; text: string }[]> = {};
  if (convIds.length) {
    const { data: msgs } = await supabaseAdmin
      .from('messages')
      .select('conversation_id, from_user_id, text, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: true });
    for (const m of (msgs ?? []) as any[]) {
      (messagesByConv[m.conversation_id] ??= []).push({ from_user_id: m.from_user_id, text: m.text });
    }
  }

  const list = (reports ?? []) as any[];

  return (
    <>
      <Nav />
      <div className="max-w-[680px] mx-auto px-6 py-10">
        <h1 className="text-[18px] font-semibold text-ink mb-1">Reports</h1>
        <p className="text-[13px] text-muted mb-7">
          {list.length} open {list.length === 1 ? 'report' : 'reports'}. Review within 24 hours.
        </p>

        {list.length === 0 ? (
          <div className="text-center text-muted text-sm py-16">Nothing to review. 🌱</div>
        ) : (
          <div className="flex flex-col gap-4">
            {list.map((r) => {
              const reportedName = r.reported?.name ?? 'Unknown';
              const reporterName = r.reporter?.name ?? 'Unknown';
              const convMsgs = r.conversation_id ? (messagesByConv[r.conversation_id] ?? []) : [];
              return (
                <div key={r.id} className="bg-card border border-[var(--border2)] rounded-[14px] p-5">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-[14px] text-ink">
                      <span className="font-semibold">{reportedName}</span>
                      <span className="text-muted"> reported by {reporterName}</span>
                    </div>
                    <span className="text-[11px] text-muted font-mono flex-shrink-0">{when(r.created_at)}</span>
                  </div>

                  <div className="text-[12.5px] text-danger font-medium mb-1">
                    {REASON_LABELS[r.reason] ?? r.reason}
                  </div>
                  {r.details && (
                    <p className="text-[13.5px] text-ink leading-[1.55] mb-2">&ldquo;{r.details}&rdquo;</p>
                  )}
                  {(r.reported?.blocked_at || r.reported?.warned_at) && (
                    <div className="text-[11.5px] text-muted mb-2">
                      {r.reported?.blocked_at ? 'Already suspended. ' : ''}
                      {r.reported?.warned_at ? 'Previously warned.' : ''}
                    </div>
                  )}

                  {convMsgs.length > 0 && (
                    <div className="mt-3 border border-[var(--border)] rounded-[10px] p-3 bg-cream-2 max-h-[180px] overflow-y-auto flex flex-col gap-1.5">
                      {convMsgs.slice(-8).map((m, i) => (
                        <div key={i} className="text-[12.5px] leading-[1.5]">
                          <span className="text-muted font-mono">
                            {m.from_user_id === r.reported?.id ? reportedName : reporterName}:
                          </span>{' '}
                          <span className="text-ink">{m.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <ReportActions reportId={r.id} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
