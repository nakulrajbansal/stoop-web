import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateExpiry } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const citySlug = searchParams.get('city'); // null = all cities
  const neighborhoodSlug = searchParams.get('neighborhood');
  const category = searchParams.get('category');

  let cityId: string | null = null;
  if (citySlug) {
    const { data: city } = await supabase
      .from('cities')
      .select('id')
      .eq('slug', citySlug)
      .single();
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
    .order('created_at', { ascending: false })
    .limit(60);

  if (cityId) query = query.eq('city_id', cityId);
  if (category) query = query.eq('category', category);

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

  const body = await req.json();
  const { text, category, spot, whenDay, whenTime, spots, neighborhoodSlug } = body;

  if (!text || typeof text !== 'string' || text.length < 25 || text.length > 220) {
    return NextResponse.json({ error: 'Plan text must be 25-220 characters' }, { status: 400 });
  }
  if (!['coffee','outdoors','arts','food','books','music'].includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  if (![1, 2].includes(spots)) {
    return NextResponse.json({ error: 'Spots must be 1 or 2' }, { status: 400 });
  }
  if (!whenDay) {
    return NextResponse.json({ error: 'Day is required' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('city_id, neighborhood_id')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Complete your profile first' }, { status: 400 });
  }

  let neighborhoodId = profile.neighborhood_id;
  if (neighborhoodSlug) {
    const { data: nb } = await supabase
      .from('neighborhoods')
      .select('id')
      .eq('city_id', profile.city_id)
      .eq('slug', neighborhoodSlug)
      .single();
    if (nb) neighborhoodId = nb.id;
  }

  if (!neighborhoodId) {
    return NextResponse.json({ error: 'Neighborhood required' }, { status: 400 });
  }

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('plans')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', oneWeekAgo);

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'You can post up to 10 plans per week.' }, { status: 429 });
  }

  const { data: plan, error } = await supabase
    .from('plans')
    .insert({
      user_id: user.id,
      city_id: profile.city_id,
      neighborhood_id: neighborhoodId,
      text,
      category,
      spot: spot ?? null,
      when_day: whenDay,
      when_time: whenTime ?? null,
      spots_total: spots,
      spots_left: spots,
      expires_at: calculateExpiry(whenDay)
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan });
}