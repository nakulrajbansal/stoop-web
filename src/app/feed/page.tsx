'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import PlanCard from '@/components/PlanCard';
import { useCityPreference, setCityPreference } from '@/lib/city-preference';

const NYC_HOODS = ['williamsburg', 'west-village', 'park-slope', 'lower-east-side', 'astoria', 'bushwick', 'greenpoint', 'harlem'];
const AUSTIN_HOODS = ['east-austin', 'south-congress', 'mueller', 'hyde-park', 'east-cesar-chavez', 'clarksville'];
const CATEGORIES = ['coffee', 'outdoors', 'arts', 'food', 'books', 'music'];

function FeedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cityPref] = useCityPreference();

  // URL param wins, otherwise use preference, otherwise show both
  const cityParam = searchParams.get('city');
  const activeCity = cityParam ?? cityPref ?? 'all';
  const hood = searchParams.get('neighborhood');
  const cat = searchParams.get('category');

  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (activeCity !== 'all') params.set('city', activeCity);
    if (hood) params.set('neighborhood', hood);
    if (cat) params.set('category', cat);

    fetch(`/api/plans?${params}`)
      .then(r => r.json())
      .then(d => { setPlans(d.plans || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeCity, hood, cat]);

  function setFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.push(`/feed?${params.toString()}`);
  }

  function pickCity(c: 'nyc' | 'austin' | 'all') {
    if (c === 'all') {
      setCityPreference(null);
      setFilter('city', null);
    } else {
      setCityPreference(c);
      setFilter('city', c);
    }
    // Clear neighborhood when changing city
    const params = new URLSearchParams(searchParams.toString());
    if (c === 'all') params.delete('city'); else params.set('city', c);
    params.delete('neighborhood');
    router.push(`/feed?${params.toString()}`);
  }

  const hoods = activeCity === 'austin' ? AUSTIN_HOODS : activeCity === 'nyc' ? NYC_HOODS : [];
  const cityName = activeCity === 'austin' ? 'Austin' : activeCity === 'nyc' ? 'New York' : 'both cities';
  const showNeighborhoodFilter = activeCity !== 'all';

  return (
    <>
      <Nav />
      <div className="max-w-[1080px] mx-auto px-6 sm:px-9 pt-10 pb-6">
        <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-1">This week in {cityName}</div>
        <h2 className="font-serif text-[clamp(28px,4vw,42px)] font-bold tracking-tight mb-1.5">Browse plans</h2>
        <p className="text-[13px] text-muted mb-5">
          {loading ? 'Loading…' : `${plans.length} plan${plans.length !== 1 ? 's' : ''} this week`}
        </p>

        {/* City switcher */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => pickCity('all')} className={`btn ${activeCity === 'all' ? 'btn-primary' : 'btn-ghost'} btn-sm`}>Both cities</button>
          <button onClick={() => pickCity('nyc')} className={`btn ${activeCity === 'nyc' ? 'btn-primary' : 'btn-ghost'} btn-sm`}>New York</button>
          <button onClick={() => pickCity('austin')} className={`btn ${activeCity === 'austin' ? 'btn-primary' : 'btn-ghost'} btn-sm`}>Austin</button>
        </div>

        {/* Neighborhood filter — only shown when a single city is selected */}
        {showNeighborhoodFilter && (
          <div className="flex gap-1.5 flex-wrap mb-3">
            <button onClick={() => setFilter('neighborhood', null)} className={`px-3.5 py-[7px] rounded-full text-[12.5px] border ${!hood ? 'bg-ink text-cream border-ink' : 'border-[var(--border2)] text-ink-2'}`}>All areas</button>
            {hoods.map(h => (
              <button key={h} onClick={() => setFilter('neighborhood', h)} className={`px-3.5 py-[7px] rounded-full text-[12.5px] border capitalize ${hood === h ? 'bg-ink text-cream border-ink' : 'border-[var(--border2)] text-ink-2'}`}>
                {h.replace(/-/g, ' ')}
              </button>
            ))}
          </div>
        )}

        {/* Category filter */}
        <div className="flex gap-1.5 flex-wrap mb-7">
          <button onClick={() => setFilter('category', null)} className={`px-3.5 py-[7px] rounded-full text-[12.5px] border ${!cat ? 'bg-ink text-cream border-ink' : 'border-[var(--border2)] text-ink-2'}`}>All</button>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setFilter('category', c)} className={`px-3.5 py-[7px] rounded-full text-[12.5px] border capitalize ${cat === c ? 'bg-ink text-cream border-ink' : 'border-[var(--border2)] text-ink-2'}`}>{c}</button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted text-sm">Loading plans…</div>
        ) : plans.length === 0 ? (
          <div className="text-center py-16 text-muted">
            <div className="text-3xl opacity-30 mb-3">◎</div>
            <p className="text-sm">No plans match this filter.<br />Try a different area or category.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {plans.map(plan => <PlanCard key={plan.id} plan={plan} />)}
          </div>
        )}
      </div>
    </>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={<div className="max-w-[1080px] mx-auto px-6 py-20 text-center text-muted">Loading…</div>}>
      <FeedContent />
    </Suspense>
  );
}