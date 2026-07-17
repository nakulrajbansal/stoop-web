import { notFound } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import PlanCard from '@/components/PlanCard';
import { supabasePublic } from '@/lib/supabase/public';
import type { Metadata } from 'next';

// The SEO and QR-card surface: stoop.house/nyc/williamsburg lists that
// neighborhood's open plans. Re-rendered at most every 5 minutes.
export const revalidate = 300;

type Params = Promise<{ city: string; hood: string }>;

async function fetchHood(citySlug: string, hoodSlug: string) {
  const { data: city } = await supabasePublic
    .from('cities')
    .select('id, slug, name')
    .eq('slug', citySlug.toLowerCase())
    .single();
  if (!city) return null;

  const { data: hood } = await supabasePublic
    .from('neighborhoods')
    .select('id, slug, name')
    .eq('city_id', city.id)
    .eq('slug', hoodSlug.toLowerCase())
    .single();
  if (!hood) return null;

  return { city, hood };
}

async function fetchPlans(neighborhoodId: string) {
  const { data } = await supabasePublic
    .from('plans')
    .select(`
      id, slug, user_id, text, category, when_day, when_time, when_time_specific,
      spots_left, spots_total, status, spot, intent_tags, when_date,
      neighborhood:neighborhoods(name),
      poster:profiles!plans_user_id_fkey(name, initials, avatar_bg, avatar_fg)
    `)
    .eq('neighborhood_id', neighborhoodId)
    .eq('status', 'open')
    .gt('expires_at', new Date().toISOString())
    .order('when_date', { ascending: true, nullsFirst: false })
    .limit(30);
  return (data ?? []) as any[];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { city, hood } = await params;
  const found = await fetchHood(city, hood);
  if (!found) return { title: 'Not found · Stoop' };

  const title = `Things to do in ${found.hood.name} this week with neighbors · Stoop`;
  const description = `Meet people in ${found.hood.name}, ${found.city.name} over real plans: coffee, runs, food, live music, whatever a neighbor is already doing. Join one or post your own. Free, small groups, phone-verified.`;
  return {
    title,
    description,
    alternates: { canonical: `https://www.stoop.house/${found.city.slug}/${found.hood.slug}` },
    openGraph: { title, description, type: 'website' }
  };
}

export default async function NeighborhoodPage({ params }: { params: Params }) {
  const { city, hood } = await params;
  const found = await fetchHood(city, hood);
  if (!found) notFound();

  const plans = await fetchPlans(found.hood.id);

  return (
    <>
      <Nav />
      <div className="max-w-[1080px] mx-auto px-6 sm:px-9 pt-10 pb-16">
        <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.1em] text-accent mb-4">
          <span className="w-6 h-px bg-accent"></span>
          <span>{found.city.name}</span>
          <span className="opacity-40">·</span>
          <Link href={`/${found.city.slug}`} className="hover:underline">All neighborhoods</Link>
        </div>

        <h1 className="font-serif text-[clamp(34px,5vw,58px)] font-bold tracking-[-1.5px] leading-[1.02] mb-3">
          This week in <em className="italic text-gold">{found.hood.name}.</em>
        </h1>
        <p className="text-[13.5px] text-muted mb-9 max-w-[520px]">
          Plans posted by people who live here. No tickets, no events page; a neighbor is
          doing something and a couple of spots are open.
        </p>

        {plans.length === 0 ? (
          <div className="py-14 text-center border border-dashed border-[var(--border2)] rounded-2xl">
            <h2 className="font-serif text-[22px] font-bold mb-2">Nothing here yet this week.</h2>
            <p className="text-[13.5px] text-muted leading-relaxed mb-5 max-w-[400px] mx-auto">
              {found.hood.name} is quiet right now. The first plan posted is the one everyone sees.
            </p>
            <Link href="/post" className="btn btn-accent">Post the first plan →</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map(plan => <PlanCard key={plan.id} plan={plan} />)}
          </div>
        )}

        {/* Substantive copy so this page ranks for "things to do in X" and
            "meet people in X" searches instead of being a thin listing */}
        <div className="mt-12 max-w-[640px]">
          <h2 className="font-serif text-[22px] font-bold tracking-tight mb-3">
            How people use Stoop in {found.hood.name}
          </h2>
          <p className="text-[13.5px] text-ink-2 leading-[1.75] font-light mb-3">
            Stoop is a neighborhood noticeboard, not an events site. Someone in {found.hood.name} posts
            a thing they were already going to do this week: coffee before work, a slow run, a pickup
            game, a gallery or bookstore wander, live music, a long walk. Up to three neighbors join.
            That&apos;s the whole idea.
          </p>
          <p className="text-[13.5px] text-ink-2 leading-[1.75] font-light">
            Every plan is posted by a phone-verified neighbor, capped at four people total, and happens
            somewhere public in or near {found.hood.name}. It&apos;s a low-key way to meet people nearby
            and make friends in {found.city.name} without profiles, swiping, or ticketed events.
          </p>
        </div>

        <div className="mt-10 bg-cream-2 border border-[var(--border)] rounded-2xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-serif text-[17px] font-bold text-ink mb-0.5">Live in {found.hood.name}?</div>
            <div className="text-[12.5px] text-muted">Post something you&apos;re already doing. See which neighbors turn up.</div>
          </div>
          <Link href="/post" className="btn btn-primary btn-sm">Post a plan →</Link>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Stoop', item: 'https://www.stoop.house/' },
              { '@type': 'ListItem', position: 2, name: found.city.name, item: `https://www.stoop.house/${found.city.slug}` },
              { '@type': 'ListItem', position: 3, name: found.hood.name, item: `https://www.stoop.house/${found.city.slug}/${found.hood.slug}` }
            ]
          })
        }}
      />
      {plans.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: `Plans in ${found.hood.name} this week`,
              itemListElement: plans.map((p, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                url: `https://www.stoop.house/plan/${p.slug}`
              }))
            })
          }}
        />
      )}
    </>
  );
}
