import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import Nav from '@/components/Nav';

export const dynamic = 'force-dynamic';

// Monday of the week a timestamp falls in, as an ISO date string key.
function weekKey(iso: string): string {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function weekLabel(key: string): string {
  return new Date(key + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC'
  });
}

export default async function AdminMetricsPage() {
  // Same gate as /admin/reports: founder account only.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !process.env.ADMIN_USER_ID || user.id !== process.env.ADMIN_USER_ID) {
    notFound();
  }

  const [profilesRes, plansRes, convsRes, reportsRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, created_at').order('created_at', { ascending: false }).limit(2000),
    supabaseAdmin.from('plans').select('id, user_id, created_at, status').order('created_at', { ascending: false }).limit(2000),
    supabaseAdmin.from('conversations').select('plan_id, status, created_at').limit(4000),
    supabaseAdmin.from('reports').select('status, created_at').eq('status', 'open')
  ]);

  const profiles = (profilesRes.data ?? []) as any[];
  const plans = (plansRes.data ?? []) as any[];
  const convs = (convsRes.data ?? []) as any[];
  const openReports = (reportsRes.data ?? []) as any[];

  const now = Date.now();
  const days = (n: number) => now - n * 24 * 60 * 60 * 1000;

  const signups7 = profiles.filter(p => new Date(p.created_at).getTime() > days(7)).length;

  // The metric that matters: plans per week and the fraction that get a join.
  const plansWithConv = new Set(convs.map(c => c.plan_id));
  const plansWithConfirm = new Set(convs.filter(c => c.status === 'confirmed').map(c => c.plan_id));

  // Only judge join rate on plans old enough to have had a chance (3+ days).
  const judgeablePlans = plans.filter(p => new Date(p.created_at).getTime() < days(3));
  const joinRate = judgeablePlans.length
    ? Math.round((judgeablePlans.filter(p => plansWithConv.has(p.id)).length / judgeablePlans.length) * 100)
    : null;
  const confirmRate = judgeablePlans.length
    ? Math.round((judgeablePlans.filter(p => plansWithConfirm.has(p.id)).length / judgeablePlans.length) * 100)
    : null;

  const postsPerUser = new Map<string, number>();
  plans.forEach(p => postsPerUser.set(p.user_id, (postsPerUser.get(p.user_id) ?? 0) + 1));
  const repeatPosters = [...postsPerUser.values()].filter(n => n >= 2).length;

  // Last 8 weeks of plans and signups, newest week first.
  const weeks: string[] = [];
  for (let i = 0; i < 8; i++) {
    weeks.push(weekKey(new Date(now - i * 7 * 24 * 60 * 60 * 1000).toISOString()));
  }
  const planWeeks = new Map<string, number>();
  plans.forEach(p => {
    const k = weekKey(p.created_at);
    planWeeks.set(k, (planWeeks.get(k) ?? 0) + 1);
  });
  const signupWeeks = new Map<string, number>();
  profiles.forEach(p => {
    const k = weekKey(p.created_at);
    signupWeeks.set(k, (signupWeeks.get(k) ?? 0) + 1);
  });

  const oldestReportHours = openReports.length
    ? Math.round((now - Math.min(...openReports.map(r => new Date(r.created_at).getTime()))) / 3600000)
    : null;

  const stats: { label: string; value: string; note?: string }[] = [
    { label: 'Plans posted, last 7 days', value: String(plans.filter(p => new Date(p.created_at).getTime() > days(7)).length), note: 'THE metric. Everything else supports it.' },
    { label: 'Plans that got at least one join', value: joinRate === null ? 'n/a' : `${joinRate}%`, note: 'Of plans at least 3 days old.' },
    { label: 'Plans that got a confirmed join', value: confirmRate === null ? 'n/a' : `${confirmRate}%` },
    { label: 'Members', value: String(profiles.length), note: `${signups7} new this week` },
    { label: 'Repeat posters (2+ plans)', value: String(repeatPosters), note: 'One person who posts weekly beats ten lurkers.' },
    { label: 'Open reports', value: String(openReports.length), note: oldestReportHours === null ? undefined : `Oldest is ${oldestReportHours}h old. Commitment: under 24h.` }
  ];

  return (
    <>
      <Nav />
      <div className="max-w-[680px] mx-auto px-6 py-10">
        <div className="flex items-baseline justify-between mb-1">
          <h1 className="text-[18px] font-semibold text-ink">Metrics</h1>
          <Link href="/admin/reports" className="text-[12px] text-muted hover:text-ink underline underline-offset-2">Reports queue →</Link>
        </div>
        <p className="text-[13px] text-muted mb-7">Plans per week and join rate. Not signups.</p>

        <div className="flex flex-col gap-2 mb-10">
          {stats.map(s => (
            <div key={s.label} className="bg-card border border-[var(--border)] rounded-[14px] px-5 py-4 flex items-baseline justify-between gap-4">
              <div>
                <div className="text-[13.5px] text-ink font-medium">{s.label}</div>
                {s.note && <div className="text-[11.5px] text-muted mt-0.5">{s.note}</div>}
              </div>
              <div className="font-serif text-[26px] font-bold text-ink tracking-tight flex-shrink-0">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-2">Last 8 weeks</div>
        <div className="bg-card border border-[var(--border)] rounded-[14px] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-5 py-2.5 text-[11px] font-mono uppercase tracking-wider text-muted font-normal">Week of</th>
                <th className="px-5 py-2.5 text-[11px] font-mono uppercase tracking-wider text-muted font-normal text-right">Plans</th>
                <th className="px-5 py-2.5 text-[11px] font-mono uppercase tracking-wider text-muted font-normal text-right">Signups</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map(w => (
                <tr key={w} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-5 py-2.5 text-ink">{weekLabel(w)}</td>
                  <td className="px-5 py-2.5 text-right font-medium text-ink">{planWeeks.get(w) ?? 0}</td>
                  <td className="px-5 py-2.5 text-right text-ink-2">{signupWeeks.get(w) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] text-muted mt-3 leading-relaxed">
          Numbers cover the most recent 2,000 profiles and plans; more than enough until the roadmap says otherwise.
        </p>
      </div>
    </>
  );
}
