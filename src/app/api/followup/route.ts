import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendFollowUp } from '@/lib/resend';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Same two ways in as /api/digest:
// 1. Vercel cron with "Authorization: Bearer ${CRON_SECRET}" sends for real.
// 2. The signed-in admin in a browser is a DRY RUN unless ?send=1.
async function authMode(req: NextRequest): Promise<'cron' | 'admin' | null> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return 'cron';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && process.env.ADMIN_USER_ID && user.id === process.env.ADMIN_USER_ID) return 'admin';
  return null;
}

// Runs daily. Finds conversations that were confirmed for a plan whose day was
// yesterday, and asks both people how it went. Marks each conversation so the
// question is only ever asked once.
export async function GET(req: NextRequest) {
  const mode = await authMode(req);
  if (!mode) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Activation gate: dark until migration 0005 creates plan_feedback and
  // conversations.followup_sent_at.
  const gate = await supabaseAdmin.from('plan_feedback' as any).select('id').limit(1);
  if (gate.error) {
    return NextResponse.json(
      { error: 'Follow-up inactive: run migration 0005 (plan_feedback) first.' },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const sending = mode === 'cron' || url.searchParams.get('send') === '1';

  // "Yesterday" in UTC. The cron runs mid-day UTC (morning in NYC/Austin), so
  // the UTC date and the US date agree at send time.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: convs, error: convErr } = await supabaseAdmin
    .from('conversations')
    .select(`
      id, poster_id, joiner_id,
      plan:plans(id, text, when_date, status, spots_left)
    `)
    .eq('status', 'confirmed')
    .is('followup_sent_at' as any, null);
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });

  const due = ((convs ?? []) as any[]).filter(c =>
    c.plan && c.plan.when_date === yesterday && c.plan.status !== 'removed'
  );

  // Fetch everyone's notify email in one query (private column, admin only).
  const userIds = [...new Set(due.flatMap(c => [c.poster_id, c.joiner_id]))];
  const emailFor = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('id, notify_email, blocked_at' as any)
      .in('id', userIds);
    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });
    for (const p of (profiles ?? []) as any[]) {
      // Suspended people get no mail.
      if (p.notify_email && !p.blocked_at) emailFor.set(p.id, p.notify_email);
    }
  }

  let sent = 0;
  let failed = 0;
  for (const conv of due) {
    const planFilled = conv.plan.spots_left === 0 || conv.plan.status === 'full';
    const recipients: Array<{ id: string; isHost: boolean }> = [
      { id: conv.poster_id, isHost: true },
      { id: conv.joiner_id, isHost: false }
    ];

    if (sending) {
      for (const r of recipients) {
        const to = emailFor.get(r.id);
        if (!to) continue;
        try {
          await sendFollowUp(to, r.id, conv.id, conv.plan.text, r.isHost, planFilled);
          sent++;
        } catch (e) {
          console.error('followup send failed for', r.id, e);
          failed++;
        }
      }
      // Mark asked even if a send failed: never risk double-emailing people.
      await (supabaseAdmin.from('conversations') as any)
        .update({ followup_sent_at: new Date().toISOString() })
        .eq('id', conv.id);
    } else {
      sent += recipients.filter(r => emailFor.has(r.id)).length;
    }
  }

  return NextResponse.json({
    ok: true,
    mode,
    dryRun: !sending,
    yesterday,
    conversationsDue: due.length,
    wouldSendOrSent: sent,
    failed
  });
}
