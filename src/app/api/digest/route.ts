import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildWeeklyDigestHtml, sendWeeklyDigest, type DigestPlan } from '@/lib/resend';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Two ways in:
// 1. Vercel cron, which sends "Authorization: Bearer ${CRON_SECRET}" when the
//    CRON_SECRET env var is set. Cron calls SEND for real.
// 2. The signed-in admin (manual runs). Admin calls are DRY RUN unless ?send=1,
//    so opening this URL in a browser can never accidentally email everyone.
async function authMode(req: NextRequest): Promise<'cron' | 'admin' | null> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return 'cron';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && process.env.ADMIN_USER_ID && user.id === process.env.ADMIN_USER_ID) return 'admin';
  return null;
}

export async function GET(req: NextRequest) {
  const mode = await authMode(req);
  if (!mode) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Activation gate: until migration 0004 adds digest_opt_out_at, there is no
  // opt-out mechanism, so the digest refuses to run at all.
  const gate = await supabaseAdmin.from('profiles').select('digest_opt_out_at' as any).limit(1);
  if (gate.error) {
    return NextResponse.json(
      { error: 'Digest inactive: run migration 0004 (digest_opt_out_at) first.' },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const sending = mode === 'cron' || url.searchParams.get('send') === '1';
  const preview = url.searchParams.get('preview') === '1';

  // Open plans this week, per city (suspended users' plans are already removed).
  const { data: rawPlans, error: plansErr } = await supabaseAdmin
    .from('plans')
    .select(`
      slug, text, when_day, when_time, when_time_specific, user_id, city_id,
      neighborhood:neighborhoods(name),
      poster:profiles!plans_user_id_fkey(name)
    `)
    .eq('status', 'open')
    .gt('expires_at', new Date().toISOString())
    .order('when_date', { ascending: true, nullsFirst: false })
    .limit(60);
  if (plansErr) return NextResponse.json({ error: plansErr.message }, { status: 500 });

  const { data: cities } = await supabaseAdmin.from('cities').select('id, name');
  const cityName = new Map((cities ?? []).map((c: any) => [c.id, c.name]));

  const plansByCity = new Map<string, any[]>();
  for (const p of (rawPlans ?? []) as any[]) {
    const list = plansByCity.get(p.city_id) ?? [];
    list.push(p);
    plansByCity.set(p.city_id, list);
  }

  // Recipients: opted in (no opt-out), not suspended, with a notify email,
  // and living in a city that has at least one open plan.
  const { data: recipients, error: recErr } = await supabaseAdmin
    .from('profiles')
    .select('id, name, notify_email, city_id' as any)
    .is('digest_opt_out_at' as any, null)
    .is('blocked_at', null)
    .not('notify_email', 'is', null);
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });

  const toDigestPlan = (p: any): DigestPlan => ({
    slug: p.slug,
    text: p.text,
    when_day: p.when_day,
    when_time: p.when_time,
    when_time_specific: p.when_time_specific,
    neighborhood: p.neighborhood?.name ?? null,
    hostName: p.poster?.name ? String(p.poster.name).split(' ')[0] : null
  });

  if (preview) {
    // Render the email for the first city that has plans, addressed to the admin.
    const firstCity = [...plansByCity.keys()][0];
    if (!firstCity) return new NextResponse('No open plans in any city, nothing to preview.', { status: 200 });
    const html = buildWeeklyDigestHtml(
      process.env.ADMIN_USER_ID ?? 'preview',
      cityName.get(firstCity) ?? 'your city',
      plansByCity.get(firstCity)!.slice(0, 6).map(toDigestPlan)
    );
    return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
  }

  let sent = 0;
  let failed = 0;
  let skippedNoPlans = 0;
  for (const r of (recipients ?? []) as any[]) {
    const cityPlans = plansByCity.get(r.city_id) ?? [];

    // Respect blocks in both directions, and never show someone their own plan.
    // A missed filter here would be a real safety hole (see ARCHITECTURE.md).
    const { data: blocked, error: blockErr } = await supabaseAdmin
      .rpc('blocked_user_ids' as any, { for_user: r.id } as any);
    if (blockErr) {
      // If the block lookup fails, skip this recipient rather than risk
      // showing them a blocked person's plan.
      failed++;
      continue;
    }
    const blockedIds = ((blocked ?? []) as { other_id: string }[]).map(b => b.other_id);

    const visible = cityPlans
      .filter(p => p.user_id !== r.id && !blockedIds.includes(p.user_id))
      .slice(0, 6);
    if (visible.length === 0) { skippedNoPlans++; continue; }

    if (sending) {
      try {
        await sendWeeklyDigest(r.notify_email, r.id, cityName.get(r.city_id) ?? 'your city', visible.map(toDigestPlan));
        sent++;
      } catch (e) {
        console.error('digest send failed for', r.id, e);
        failed++;
      }
    } else {
      sent++; // dry run: count who WOULD receive it
    }
  }

  return NextResponse.json({
    ok: true,
    mode,
    dryRun: !sending,
    recipientsConsidered: ((recipients ?? []) as any[]).length,
    wouldSendOrSent: sent,
    skippedNoPlans,
    failed,
    plansByCity: Object.fromEntries([...plansByCity.entries()].map(([k, v]) => [cityName.get(k) ?? k, v.length]))
  });
}
