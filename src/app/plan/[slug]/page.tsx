import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getBlockedIds } from '@/lib/blocks';
import PlanDetailClient from './PlanDetailClient';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

async function fetchPlan(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('plans')
    .select(`
      *,
      poster:profiles!plans_user_id_fkey(id, name, initials, avatar_bg, avatar_fg, about, is_founding_member),
      neighborhood:neighborhoods(name),
      city:cities(name)
    `)
    .eq('slug', slug)
    .single();

  if (!data) return null;

  // If the viewer and the poster are blocked (either direction), hide the plan
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const blockedIds = await getBlockedIds(supabase, user.id);
    if (blockedIds.includes(data.user_id)) return null;
  }

  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const plan = await fetchPlan(slug);
  if (!plan) return { title: 'Plan not found · Stoop' };

  const title = `${plan.text.substring(0, 60)}${plan.text.length > 60 ? '…' : ''} · Stoop`;
  const description = `${plan.when_day}${plan.when_time_specific ? ` ${plan.when_time_specific}` : plan.when_time ? ` ${plan.when_time}` : ''} in ${plan.neighborhood?.name}, ${plan.city?.name}. ${plan.spots_left} spot${plan.spots_left !== 1 ? 's' : ''} open.`;

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description }
  };
}

export default async function PlanDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const plan: any = await fetchPlan(slug);
  if (!plan) notFound();

  // Honest trust signal: how many plans this host has posted (removed ones
  // don't count). Shown on the page only once they have a track record.
  const supabase = await createClient();
  const { count: hostPlanCount } = await supabase
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', plan.user_id)
    .neq('status', 'removed');

  // Machine-readable event data for Google. Only when the plan has a real
  // date; a dateless plan is not a valid Event for rich results.
  const eventJsonLd = plan.when_date
    ? {
        '@context': 'https://schema.org',
        '@type': 'SocialEvent',
        name: plan.text.length > 110 ? plan.text.substring(0, 110) + '…' : plan.text,
        startDate: plan.when_date,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        isAccessibleForFree: true,
        maximumAttendeeCapacity: 4,
        organizer: { '@type': 'Person', name: plan.poster?.name ?? 'A neighbor' },
        location: {
          '@type': 'Place',
          name: plan.spot || plan.neighborhood?.name || plan.city?.name || 'Neighborhood spot',
          address: {
            '@type': 'PostalAddress',
            addressLocality: plan.city?.name ?? undefined
          }
        },
        url: `https://www.stoop.house/plan/${plan.slug}`
      }
    : null;

  return (
    <Suspense fallback={<div className="max-w-[720px] mx-auto px-6 py-20 text-center text-muted text-sm">Loading…</div>}>
      {eventJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }} />
      )}
      <PlanDetailClient initialPlan={plan} hostPlanCount={hostPlanCount ?? 0} />
    </Suspense>
  );
}