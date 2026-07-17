import { notFound } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { supabasePublic } from '@/lib/supabase/public';
import type { Metadata } from 'next';

// City index: stoop.house/nyc lists every neighborhood with its open-plan
// count. Mostly a crawl surface for search engines and a hub for QR cards.
export const revalidate = 300;

type Params = Promise<{ city: string }>;

async function fetchCity(citySlug: string) {
  const { data: city } = await supabasePublic
    .from('cities')
    .select('id, slug, name')
    .eq('slug', citySlug.toLowerCase())
    .single();
  return city ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { city } = await params;
  const found = await fetchCity(city);
  if (!found) return { title: 'Not found · Stoop' };
  const title = `Make friends in ${found.name}, one plan at a time · Stoop`;
  const description = `Meet neighbors in ${found.name} over real plans: coffee, runs, food, live music, posted by people nearby. Pick your neighborhood, join a plan, or post your own. Free and phone-verified.`;
  return {
    title,
    description,
    alternates: { canonical: `https://www.stoop.house/${found.slug}` },
    openGraph: { title, description, type: 'website' }
  };
}

export default async function CityPage({ params }: { params: Params }) {
  const { city } = await params;
  const found = await fetchCity(city);
  if (!found) notFound();

  const { data: hoods } = await supabasePublic
    .from('neighborhoods')
    .select('id, slug, name')
    .eq('city_id', found.id)
    .order('name');

  const { data: openPlans } = await supabasePublic
    .from('plans')
    .select('neighborhood_id')
    .eq('city_id', found.id)
    .eq('status', 'open')
    .gt('expires_at', new Date().toISOString());

  const countFor = new Map<string, number>();
  for (const p of (openPlans ?? []) as any[]) {
    countFor.set(p.neighborhood_id, (countFor.get(p.neighborhood_id) ?? 0) + 1);
  }

  return (
    <>
      <Nav />
      <div className="max-w-[1080px] mx-auto px-6 sm:px-9 pt-10 pb-16">
        <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.1em] text-accent mb-4">
          <span className="w-6 h-px bg-accent"></span>
          <span>Stoop in {found.name}</span>
        </div>

        <h1 className="font-serif text-[clamp(34px,5vw,58px)] font-bold tracking-[-1.5px] leading-[1.02] mb-3">
          Pick your <em className="italic text-gold">neighborhood.</em>
        </h1>
        <p className="text-[13.5px] text-muted mb-9 max-w-[520px]">
          Stoop works block by block. Find yours and see what neighbors are doing this week.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(hoods ?? []).map((h: any) => {
            const n = countFor.get(h.id) ?? 0;
            return (
              <Link
                key={h.id}
                href={`/${found.slug}/${h.slug}`}
                className="bg-card border border-[var(--border)] rounded-2xl px-5 py-4 hover:border-accent/40 hover:shadow-sm transition-all flex items-center justify-between gap-3"
              >
                <span className="font-serif text-[17px] font-bold text-ink">{h.name}</span>
                <span className={`text-[11px] font-mono ${n > 0 ? 'text-accent' : 'text-muted'}`}>
                  {n > 0 ? `${n} open` : 'quiet'}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Substantive copy so this page ranks for "make friends in {city}" searches */}
        <div className="mt-12 max-w-[640px]">
          <h2 className="font-serif text-[22px] font-bold tracking-tight mb-3">
            Meeting people in {found.name}, without the apps feeling
          </h2>
          <p className="text-[13.5px] text-ink-2 leading-[1.75] font-light">
            Stoop is how neighbors in {found.name} turn ordinary weeks into company: someone posts the
            coffee, run, meal, or show they were already planning, and up to three people nearby join.
            Everyone is phone-verified, groups stay small, and plans happen in public places. Pick your
            neighborhood above to see what&apos;s open this week, or read our guide to{' '}
            <Link
              href={`/guides/how-to-make-friends-in-${found.slug}`}
              className="underline underline-offset-2 hover:text-ink"
            >
              making friends in {found.name}
            </Link>.
          </p>
        </div>

        <div className="mt-10 bg-cream-2 border border-[var(--border)] rounded-2xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-serif text-[17px] font-bold text-ink mb-0.5">Don&apos;t see yours?</div>
            <div className="text-[12.5px] text-muted">We add neighborhoods as people join. Post a plan and put yours on the map.</div>
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
              { '@type': 'ListItem', position: 2, name: found.name, item: `https://www.stoop.house/${found.slug}` }
            ]
          })
        }}
      />
    </>
  );
}
