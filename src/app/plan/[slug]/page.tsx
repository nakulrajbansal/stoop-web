import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
  const plan = await fetchPlan(slug);
  if (!plan) notFound();

  return (
    <Suspense fallback={<div className="max-w-[720px] mx-auto px-6 py-20 text-center text-muted text-sm">Loading…</div>}>
      <PlanDetailClient initialPlan={plan} />
    </Suspense>
  );
}