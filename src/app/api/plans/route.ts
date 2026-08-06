import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { calculateExpiry, slugify, INTENT_TAGS } from '@/lib/utils';
import { parsePlanContractBody, parseReferenceDate, resolveDayLabel } from '@/lib/plan-contract';
import { toPublicPlans } from '@/lib/public-plan';
import { getBlockedIds } from '@/lib/blocks';
import { isSuspended } from '@/lib/moderation';
import { pingIndexNow } from '@/lib/indexnow';

const VALID_TAG_IDS = new Set(INTENT_TAGS.map(t => t.id));

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Blocked users (either direction) are filtered out of the feed entirely
  const blockedIds = user ? await getBlockedIds(supabase, user.id) : [];
  const { searchParams } = new URL(req.url);
  const citySlug = searchParams.get('city');
  const neighborhoodSlug = searchParams.get('neighborhood');
  const category = searchParams.get('category');

  let cityId: string | null = null;
  if (citySlug) {
    const { data: city } = await supabase.from('cities').select('id').eq('slug', citySlug).single();
    if (!city) return NextResponse.json({ plans: [] });
    cityId = city.id;
  }

  let query = supabase
    .from('plans')
    .select(`
      *,
      poster:profiles!plans_user_id_fkey(id, name:display_name, initials, avatar_bg, avatar_fg, about, is_founding_member),
      neighborhood:neighborhoods(id, slug, name),
      city:cities(slug, name)
    `, { count: 'exact' })
    .eq('status', 'open')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(60);

  if (cityId) query = query.eq('city_id', cityId);
  if (category) query = query.eq('category', category);

  if (blockedIds.length > 0) {
    query = query.not('user_id', 'in', `(${blockedIds.join(',')})`);
  }

  if (neighborhoodSlug && cityId) {
    const { data: nb } = await supabase
      .from('neighborhoods')
      .select('id')
      .eq('city_id', cityId)
      .eq('slug', neighborhoodSlug)
      .single();
    if (nb) query = query.eq('neighborhood_id', nb.id);
  }

  const { data: plans, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Public feed data: hosts are first names here, the same as on the card.
  // `total` is the count for the same filters before the row cap, so the feed
  // can state a true number instead of the length of one page.
  return NextResponse.json({
    plans: toPublicPlans((plans ?? []) as any[]),
    total: count ?? (plans ?? []).length
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await isSuspended(user.id)) {
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
  }

  const body = await req.json();
  const { category, whenDayLabel, whenTime, neighborhoodSlug, intentTags, clientToday } = body;

  // The composer offers fourteen day chips counted from the visitor's own day,
  // so the window has to be judged from that day too. At 8pm in New York or
  // Austin the UTC day is already tomorrow, and counting from UTC refused the
  // "Today" chip the composer had just offered. A client may leave the field
  // out and get UTC, but a day it cannot honestly be on is refused here rather
  // than dropped, so nothing is stored against a fortnight nobody was shown.
  const reference = parseReferenceDate(clientToday);
  if (!reference.ok) {
    return NextResponse.json({ error: reference.error }, { status: 400 });
  }
  const today = reference.today;

  // The clarity contract, enforced on the server. The composer checks the same
  // rules, but a client that skips them gets a 400 rather than a vague plan.
  const contract = parsePlanContractBody(body, { today });
  if (!contract.ok) {
    return NextResponse.json({ error: contract.error, missing: contract.missing }, { status: 400 });
  }
  const { text, whenDate, whenTimeSpecific, spot, spots, costExpectation } = contract.value;

  if (!['coffee','outdoors','arts','food','books','music','sports'].includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  // The client computes the label in its own timezone, which is why it is sent
  // rather than derived. It still has to agree with the date it came with.
  const dayLabel = resolveDayLabel(whenDate, whenDayLabel, today);

  const cleanTags: string[] = Array.isArray(intentTags)
    ? intentTags.filter((t: unknown) => typeof t === 'string' && VALID_TAG_IDS.has(t as any)).slice(0, 2)
    : [];

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('city_id, neighborhood_id, is_founding_member')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Complete your profile first' }, { status: 400 });

  let neighborhoodId = profile.neighborhood_id;
  if (neighborhoodSlug) {
    const { data: nb } = await supabaseAdmin
      .from('neighborhoods')
      .select('id')
      .eq('city_id', profile.city_id)
      .eq('slug', neighborhoodSlug)
      .single();
    if (nb) neighborhoodId = nb.id;
  }
  if (!neighborhoodId) return NextResponse.json({ error: 'Neighborhood required' }, { status: 400 });

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from('plans')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', oneWeekAgo);
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'You can post up to 10 plans per week.' }, { status: 429 });
  }

  let slug = slugify(text);
  const { data: existing } = await supabaseAdmin.from('plans').select('id').eq('slug', slug).maybeSingle();
  if (existing) slug = slugify(text);

  const { data: plan, error } = await supabaseAdmin
    .from('plans')
    .insert({
      slug,
      user_id: user.id,
      city_id: profile.city_id,
      neighborhood_id: neighborhoodId,
      text,
      category,
      spot,
      when_day: dayLabel,
      when_date: whenDate,
      when_time: whenTime ?? null,
      when_time_specific: whenTimeSpecific,
      cost_expectation: costExpectation,
      spots_total: spots,
      spots_left: spots,
      intent_tags: cleanTags,
      expires_at: calculateExpiry(whenDate)
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Founding member mechanic: the first 50 people to publish a plan get the
  // badge, automatically and permanently. Best-effort; never fails the post.
  let becameFounding = false;
  try {
    if (!(profile as any).is_founding_member) {
      const { count: foundingCount } = await supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_founding_member', true);
      if ((foundingCount ?? 0) < 50) {
        const { error: fmErr } = await (supabaseAdmin.from('profiles') as any)
          .update({ is_founding_member: true })
          .eq('id', user.id);
        becameFounding = !fmErr;
      }
    }
  } catch (e) {
    console.error('founding badge grant failed (non-fatal):', e);
  }

  // Tell Bing/DuckDuckGo about the new plan and its neighborhood page right
  // away (fire-and-forget; a failed ping never fails the post).
  try {
    const [cityRes, hoodRes] = await Promise.all([
      supabaseAdmin.from('cities').select('slug').eq('id', (profile as any).city_id).single(),
      supabaseAdmin.from('neighborhoods').select('slug').eq('id', neighborhoodId).single()
    ]);
    const cityRow = cityRes.data as any;
    const hoodRow = hoodRes.data as any;
    const urls = [`https://www.stoop.house/plan/${(plan as any).slug}`, 'https://www.stoop.house/feed'];
    if (cityRow?.slug) {
      urls.push(`https://www.stoop.house/${cityRow.slug}`);
      if (hoodRow?.slug) urls.push(`https://www.stoop.house/${cityRow.slug}/${hoodRow.slug}`);
    }
    await pingIndexNow(urls);
  } catch (e) {
    console.error('post-create indexnow failed (non-fatal):', e);
  }

  return NextResponse.json({ plan, becameFounding });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { planId, whenDayLabel, whenTime, intentTags, clientToday } = body;
  if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 });

  // Verify ownership BEFORE updating, using admin client
  const { data: planRow } = await supabaseAdmin
    .from('plans')
    .select('user_id, spots_total, cost_expectation')
    .eq('id', planId)
    .single();
  const plan = planRow as { user_id: string; spots_total: number; cost_expectation: string | null } | null;

  if (!plan || plan.user_id !== user.id) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  // Same reference day as POST, judged the same way: the editor offers the same
  // chips, so an edit is measured against the same fourteen days a new plan is,
  // and a day the client cannot honestly be on is refused rather than dropped.
  // Asked after ownership, so a stranger's request is still answered with 403
  // and nothing else, whatever they put in the body.
  const reference = parseReferenceDate(clientToday);
  if (!reference.ok) {
    return NextResponse.json({ error: reference.error }, { status: 400 });
  }
  const today = reference.today;

  // Editing a plan is republishing it, so the edit has to meet the same
  // contract a new plan does. Group size is not editable (capacity is already
  // committed to whoever was confirmed), so the stored value is what is judged.
  const contract = parsePlanContractBody({ ...body, spots: plan.spots_total }, { today });
  if (!contract.ok) {
    return NextResponse.json({ error: contract.error, missing: contract.missing }, { status: 400 });
  }
  const { text, whenDate, whenTimeSpecific, spot, costExpectation } = contract.value;

  const cleanTags: string[] | undefined = Array.isArray(intentTags)
    ? intentTags.filter((t: unknown) => typeof t === 'string' && VALID_TAG_IDS.has(t as any)).slice(0, 2)
    : undefined;

  const updates: any = {
    text,
    when_date: whenDate,
    when_time_specific: whenTimeSpecific,
    spot,
    cost_expectation: costExpectation,
    expires_at: calculateExpiry(whenDate)
  };
  // An edit that moves the date must not keep the old day copy.
  updates.when_day = resolveDayLabel(whenDate, whenDayLabel, today);
  if (typeof whenTime === 'string') updates.when_time = whenTime || null;
  if (cleanTags !== undefined) updates.intent_tags = cleanTags;

  const { error } = await supabaseAdmin
    .from('plans')
    .update(updates)
    .eq('id', planId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const planId = searchParams.get('planId');
  if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 });

  // Verify ownership BEFORE deleting, using admin client
  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('user_id')
    .eq('id', planId)
    .single();

  if (!plan || plan.user_id !== user.id) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from('plans')
    .update({ status: 'removed' })
    .eq('id', planId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}