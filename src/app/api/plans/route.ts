import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth, requireUser, unauthorized } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { calculateExpiry, slugify, INTENT_TAGS, isPlanCategory } from '@/lib/utils';
import { blockLookupUnavailable, BlockLookupError, getBlockedIds } from '@/lib/blocks';
import { suspensionGate } from '@/lib/moderation';
import { BLOCKED_LANGUAGE_MESSAGE, containsBlockedLanguage, isBlockedLanguageError } from '@/lib/text-moderation';
import { pingIndexNow } from '@/lib/indexnow';
import type { TablesUpdate } from '@/types/database';

const VALID_TAG_IDS = new Set<string>(INTENT_TAGS.map(t => t.id));

export async function GET(req: NextRequest) {
  const auth = await getRouteAuth(req);
  // The feed is readable signed out, but a request that presented a broken
  // credential is an error, not an anonymous visitor.
  if (auth.rejected) return unauthorized();
  const { supabase, user } = auth;

  // Blocked users (either direction) are filtered out of the feed entirely.
  // If that list cannot be read there is no safe feed to serve: returning an
  // unfiltered one puts a blocked member's plans back in front of the person
  // who blocked them. Fail closed and let the app retry.
  let blockedIds: string[] = [];
  if (user) {
    try {
      blockedIds = await getBlockedIds(user.id);
    } catch (caught) {
      if (caught instanceof BlockLookupError) return blockLookupUnavailable();
      throw caught;
    }
  }
  const { searchParams } = new URL(req.url);
  const citySlug = searchParams.get('city');
  const neighborhoodSlug = searchParams.get('neighborhood');
  const category = searchParams.get('category');

  // An unknown category filters everything out rather than being ignored,
  // which is what the old `.eq('category', <anything>)` did.
  if (category && !isPlanCategory(category)) return NextResponse.json({ plans: [] });

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
  if (isPlanCategory(category)) query = query.eq('category', category);

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
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const user = auth.user!;

  const suspended = await suspensionGate(user.id);
  if (suspended) return suspended;

  const body = await req.json();
  const { text, category, spot, whenDate, whenDayLabel, whenTime, whenTimeSpecific, spots, neighborhoodSlug, intentTags } = body;

  if (!text || typeof text !== 'string' || text.length < 25 || text.length > 220) {
    return NextResponse.json({ error: 'Plan text must be 25-220 characters' }, { status: 400 });
  }
  if (!isPlanCategory(category)) {
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
  const cleanSpot = typeof spot === 'string' && spot.trim() ? spot.trim() : null;
  if (containsBlockedLanguage(text) || containsBlockedLanguage(cleanSpot)) {
    return NextResponse.json({ error: BLOCKED_LANGUAGE_MESSAGE, code: 'blocked_language' }, { status: 400 });
  }

  const cleanTags: string[] = Array.isArray(intentTags)
    ? intentTags.filter((t: unknown): t is string => typeof t === 'string' && VALID_TAG_IDS.has(t)).slice(0, 2)
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

  // slug is unique (0008). Re-roll on a genuine collision rather than assuming
  // the second roll is free.
  let slug = slugify(text);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: taken } = await supabaseAdmin.from('plans').select('id').eq('slug', slug).maybeSingle();
    if (!taken) break;
    slug = slugify(text);
  }

  const { data: plan, error } = await supabaseAdmin
    .from('plans')
    .insert({
      slug,
      user_id: user.id,
      city_id: profile.city_id,
      neighborhood_id: neighborhoodId,
      text,
      category,
      spot: cleanSpot,
      when_day: whenDayLabel,
      when_date: whenDate,
      when_time: typeof whenTime === 'string' && whenTime ? whenTime : null,
      when_time_specific: typeof whenTimeSpecific === 'string' && whenTimeSpecific ? whenTimeSpecific : null,
      spots_total: spots,
      spots_left: spots,
      intent_tags: cleanTags,
      expires_at: calculateExpiry(whenDate)
    })
    .select()
    .single();

  if (error) {
    if (isBlockedLanguageError(error)) {
      return NextResponse.json({ error: BLOCKED_LANGUAGE_MESSAGE, code: 'blocked_language' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Founding member mechanic: the first 50 people to publish a plan get the
  // badge, automatically and permanently. Best-effort; never fails the post.
  let becameFounding = false;
  try {
    if (!profile.is_founding_member) {
      const { count: foundingCount } = await supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_founding_member', true);
      if ((foundingCount ?? 0) < 50) {
        const { error: fmErr } = await supabaseAdmin
          .from('profiles')
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
      supabaseAdmin.from('cities').select('slug').eq('id', profile.city_id).single(),
      supabaseAdmin.from('neighborhoods').select('slug').eq('id', neighborhoodId).single()
    ]);
    const urls = [`https://www.stoop.house/plan/${plan.slug}`, 'https://www.stoop.house/feed'];
    if (cityRes.data?.slug) {
      urls.push(`https://www.stoop.house/${cityRes.data.slug}`);
      if (hoodRes.data?.slug) urls.push(`https://www.stoop.house/${cityRes.data.slug}/${hoodRes.data.slug}`);
    }
    await pingIndexNow(urls);
  } catch (e) {
    console.error('post-create indexnow failed (non-fatal):', e);
  }

  return NextResponse.json({ plan, becameFounding });
}

/**
 * Edit a plan you posted.
 *
 * `null` is meaningful here: clearing the optional time on a plan is a real
 * edit, so `whenTime: null` and `whenTimeSpecific: null` are honoured, while
 * `undefined` (the field simply not sent) leaves the column alone. Those are
 * different intentions and the route no longer conflates them.
 */
export async function PATCH(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const user = auth.user!;

  const suspended = await suspensionGate(user.id);
  if (suspended) return suspended;

  const body = await req.json();
  const { planId, text, whenDate, whenDayLabel, whenTime, whenTimeSpecific, spot, intentTags } = body;
  if (!planId || typeof planId !== 'string') {
    return NextResponse.json({ error: 'planId required' }, { status: 400 });
  }

  // Verify ownership BEFORE updating, using admin client
  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('user_id, status')
    .eq('id', planId)
    .maybeSingle();

  if (!plan || plan.user_id !== user.id) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }
  // Editing a plan nobody can join any more would silently do nothing useful.
  if (plan.status === 'removed' || plan.status === 'expired') {
    return NextResponse.json(
      { error: 'This plan is closed and can no longer be edited.', code: 'plan_closed' },
      { status: 409 }
    );
  }

  const updates: TablesUpdate<'plans'> = {};

  if (text !== undefined) {
    if (typeof text !== 'string' || text.length < 25 || text.length > 220) {
      return NextResponse.json({ error: 'Plan text must be 25-220 characters' }, { status: 400 });
    }
    if (containsBlockedLanguage(text)) {
      return NextResponse.json({ error: BLOCKED_LANGUAGE_MESSAGE, code: 'blocked_language' }, { status: 400 });
    }
    updates.text = text;
  }

  if (whenDate !== undefined) {
    if (typeof whenDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(whenDate)) {
      return NextResponse.json({ error: 'Date must be YYYY-MM-DD' }, { status: 400 });
    }
    updates.when_date = whenDate;
    updates.expires_at = calculateExpiry(whenDate);
    if (typeof whenDayLabel === 'string' && whenDayLabel) updates.when_day = whenDayLabel;
  }

  if (whenTime !== undefined) {
    if (whenTime !== null && typeof whenTime !== 'string') {
      return NextResponse.json({ error: 'Invalid time' }, { status: 400 });
    }
    updates.when_time = whenTime || null;
  }

  if (whenTimeSpecific !== undefined) {
    if (whenTimeSpecific !== null && typeof whenTimeSpecific !== 'string') {
      return NextResponse.json({ error: 'Invalid time' }, { status: 400 });
    }
    updates.when_time_specific = whenTimeSpecific || null;
  }

  if (spot !== undefined) {
    if (spot !== null && typeof spot !== 'string') {
      return NextResponse.json({ error: 'Invalid spot' }, { status: 400 });
    }
    const cleanSpot = typeof spot === 'string' && spot.trim() ? spot.trim() : null;
    if (containsBlockedLanguage(cleanSpot)) {
      return NextResponse.json({ error: BLOCKED_LANGUAGE_MESSAGE, code: 'blocked_language' }, { status: 400 });
    }
    updates.spot = cleanSpot;
  }

  if (intentTags !== undefined) {
    if (!Array.isArray(intentTags)) {
      return NextResponse.json({ error: 'Invalid tags' }, { status: 400 });
    }
    updates.intent_tags = intentTags
      .filter((t: unknown): t is string => typeof t === 'string' && VALID_TAG_IDS.has(t))
      .slice(0, 2);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from('plans')
    .update(updates)
    .eq('id', planId)
    .eq('user_id', user.id)
    .select('id, slug, text, when_day, when_date, when_time, when_time_specific, spot, intent_tags, status')
    .maybeSingle();

  if (error) {
    if (isBlockedLanguageError(error)) {
      return NextResponse.json({ error: BLOCKED_LANGUAGE_MESSAGE, code: 'blocked_language' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  return NextResponse.json({ ok: true, plan: updated });
}

export async function DELETE(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const user = auth.user!;

  const suspended = await suspensionGate(user.id);
  if (suspended) return suspended;

  const { searchParams } = new URL(req.url);
  const planId = searchParams.get('planId');
  if (!planId) return NextResponse.json({ error: 'planId required' }, { status: 400 });

  // Verify ownership BEFORE deleting, using admin client
  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('user_id')
    .eq('id', planId)
    .maybeSingle();

  if (!plan || plan.user_id !== user.id) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from('plans')
    .update({ status: 'removed' })
    .eq('id', planId)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
