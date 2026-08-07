import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getBlockedIds } from '@/lib/blocks';
import { toPublicPlan } from '@/lib/public-plan';
import { firstNameOf } from '@/lib/participants';
import Nav from '@/components/Nav';
import PageMain from '@/components/PageMain';
import Footer from '@/components/Footer';
import JsonLd from '@/components/JsonLd';
import PlanDetailClient from './PlanDetailClient';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

async function fetchPlan(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('plans')
    .select(`
      *,
      poster:profiles!plans_user_id_fkey(id, name:display_name, initials, avatar_bg, avatar_fg, about, is_founding_member),
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
  const timeStr = plan.when_time_specific ? ` ${plan.when_time_specific}` : plan.when_time ? ` ${plan.when_time}` : '';
  const isFull = plan.status === 'full' || plan.spots_left === 0;
  const spotStr = isFull ? 'Fully booked.' : `${plan.spots_left} spot${plan.spots_left !== 1 ? 's' : ''} open.`;
  const place = plan.spot ? `${plan.spot}, ` : '';
  const description = `${plan.when_day}${timeStr} at ${place}${plan.neighborhood?.name}, ${plan.city?.name}. Meet neighbors over a real plan. ${spotStr}`;
  const canonical = `https://www.stoop.house/plan/${plan.slug}`;
  const keywords = [
    plan.category,
    `${plan.neighborhood?.name} ${plan.category}`,
    `things to do ${plan.neighborhood?.name}`,
    `meet people ${plan.city?.name}`,
    `${plan.city?.name} ${plan.category} meetup`,
    'make friends nearby', plan.spot,
  ].filter(Boolean);

  return {
    title,
    description,
    keywords,
    alternates: { canonical },
    openGraph: { title, description, type: 'website', url: canonical, siteName: 'Stoop', locale: 'en_US' },
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

  // The host's own neighborhood, which is public and part of the host card.
  // Read separately because the embedded profile join does not carry it.
  let hostNeighborhood: string | null = null;
  const { data: hostProfile } = await supabase
    .from('profiles')
    .select('neighborhood_id')
    .eq('id', plan.user_id)
    .maybeSingle();
  const hostHoodId = (hostProfile as { neighborhood_id: string | null } | null)?.neighborhood_id;
  if (hostHoodId) {
    const { data: hood } = await supabase
      .from('neighborhoods')
      .select('name')
      .eq('id', hostHoodId)
      .maybeSingle();
    hostNeighborhood = (hood as { name: string } | null)?.name ?? null;
  }

  // Machine-readable event data for Google. Only when the plan has a real
  // date; a dateless plan is not a valid Event for rich results. The name,
  // the location and the organizer's first name are all typed by a neighbor,
  // so this block goes out through JsonLd rather than straight into a script.
  const isFullEvent = plan.status === 'full' || plan.spots_left === 0;
  const paidTag = Array.isArray(plan.intent_tags) && plan.intent_tags.includes('paid');
  // The stated cost expectation wins over the older vibe tag. A plan that never
  // said keeps the old behaviour rather than being described as free.
  const isFree = plan.cost_expectation ? plan.cost_expectation === 'free' : !paidTag;
  const eventJsonLd = plan.when_date
    ? {
        '@context': 'https://schema.org',
        '@type': 'SocialEvent',
        name: plan.text.length > 110 ? plan.text.substring(0, 110) + '…' : plan.text,
        description: `A neighbor-hosted ${plan.category} plan in ${plan.neighborhood?.name || plan.city?.name}. Small group, in person, join over the thing itself.`,
        startDate: plan.when_date,
        endDate: plan.when_date,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        isAccessibleForFree: isFree,
        maximumAttendeeCapacity: 4,
        remainingAttendeeCapacity: Math.max(0, plan.spots_left ?? 0),
        keywords: `${plan.category}, ${plan.neighborhood?.name || ''}, ${plan.city?.name || ''}, meet neighbors, make friends`,
        organizer: { '@type': 'Person', name: firstNameOf(plan.poster?.name) },
        performer: { '@type': 'Person', name: firstNameOf(plan.poster?.name) },
        offers: {
          '@type': 'Offer',
          // Only claim a price when the host said the plan is free. Stoop does
          // not sell anything, and a pay-own-way plan has no price to state.
          ...(isFree ? { price: '0', priceCurrency: 'USD' } : {}),
          availability: isFullEvent ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
          url: `https://www.stoop.house/plan/${plan.slug}`
        },
        location: {
          '@type': 'Place',
          name: plan.spot || plan.neighborhood?.name || plan.city?.name || 'Neighborhood spot',
          address: {
            '@type': 'PostalAddress',
            addressLocality: plan.city?.name ?? undefined,
            addressRegion: plan.city?.slug === 'nyc' ? 'NY' : plan.city?.slug === 'austin' ? 'TX' : undefined,
            addressCountry: 'US'
          }
        },
        url: `https://www.stoop.house/plan/${plan.slug}`
      }
    : null;

  // Nav, the main landmark and the footer sit OUTSIDE the Suspense boundary so
  // the server-rendered fallback already has the one <main id="main"> the skip
  // link points at, rather than gaining it only after hydration.
  return (
    <>
      {eventJsonLd && <JsonLd data={eventJsonLd} />}
      <Nav />
      <PageMain className="max-w-[720px] mx-auto px-5 sm:px-6 py-7 sm:py-10 pb-16 sm:pb-20">
        <Suspense fallback={<div className="py-10 text-center text-muted text-sm">Loading…</div>}>
          <PlanDetailClient
            initialPlan={toPublicPlan(plan)}
            hostPlanCount={hostPlanCount ?? 0}
            hostNeighborhood={hostNeighborhood}
          />
        </Suspense>
      </PageMain>
      <Footer />
    </>
  );
}