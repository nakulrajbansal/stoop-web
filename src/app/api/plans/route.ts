import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { calculateExpiry, slugify, INTENT_TAGS } from '@/lib/utils';
import { getBlockedIds } from '@/lib/blocks';
import { isSuspended } from '@/lib/moderation';

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
      poster:profiles!plans_user_id_fkey(id, name, initials, avatar_bg, avatar_fg, about, is_founding_member),
      neighborhood:neighborhoods(id, slug, name),
      city:cities(slug, name)
    `)
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

  const { data: plans, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plans: plans ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await isSuspended(user.id)) {
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
  }

  const body = await req.json();
  const { text, category, spot, whenDate, whenDayLabel, whenTime, whenTimeSpecific, spots, neighborhoodSlug, intentTags } = body;

  if (!text || typeof text !== 'string' || text.length < 25 || text.length > 220) {
    return NextResponse.json({ error: 'Plan text must be 25-220 characters' }, { status: 400 });
  }
  if (!['coffee','outdoors','arts','food','books','music','sports'].includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  if (![1, 2, 3].includes(spots)) {
    return NextResponse.json({ error: 'Spots must be 1, 2, or 3' }, { status: 400 });
  }
  if (!whenDate || !/^\d{4}-\d{2}-\d{2}$/.test(whenDate)) {
    return NextResponse.json({ error: 'Date is required' }, { status: 400 });
  }
  if (!whenDayLabel || typeof whenDayLabel !== 'string') {
    return NextResponse.json({ error: 'Date label required' }, { status: 400 });
  }

  const cleanTags: string[] = Array.isArray(intentTags)
    ? intentTags.filter((t: unknown) => typeof t === 'string' && VALID_TAG_IDS.has(t as any)).slice(0, 2)
    : [];

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('city_id, neighborhood_id')
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
      spot: spot ?? null,
      when_day: whenDayLabel,
      when_date: whenDate,
      when_time: whenTime ?? null,
      when_time_specific: whenTimeSpecific ?? null,
      spots_total: spots,
      spots_left: spots,
      intent_tags: cleanTags,
      expires_at: calculateExpiry(whenDate)
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { planId, text, whenDate, whenDayLabel, whenTime, whenTimeSpecific, intentTags } = await req.json();
  if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 });

  // Verify ownership BEFORE updating, using admin client
  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('user_id')
    .eq('id', planId)
    .single();

  if (!plan || plan.user_id !== user.id) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const cleanTags: string[] | undefined = Array.isArray(intentTags)
    ? intentTags.filter((t: unknown) => typeof t === 'string' && VALID_TAG_IDS.has(t as any)).slice(0, 2)
    : undefined;

  const updates: any = {};
  if (typeof text === 'string' && text.length >= 25 && text.length <= 220) updates.text = text;
  if (typeof whenDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(whenDate)) {
    updates.when_date = whenDate;
    if (typeof whenDayLabel === 'string' && whenDayLabel) {
      updates.when_day = whenDayLabel;
    }
    updates.expires_at = calculateExpiry(whenDate);
  }
  if (typeof whenTime === 'string') updates.when_time = whenTime || null;
  if (typeof whenTimeSpecific === 'string') updates.when_time_specific = whenTimeSpecific || null;
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