'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import Avatar from '@/components/Avatar';
import { useCityPreference, setCityPreference } from '@/lib/city-preference';
import { intentTagLabel } from '@/lib/utils';

const CATEGORIES = ['coffee', 'outdoors', 'sports', 'arts', 'food', 'books', 'music'];

// Shown ONLY in the empty state, clearly labeled as samples. They demonstrate
// the format without pretending to be real activity.
const SAMPLE_PLANS = [
  {
    cat: 'coffee',
    text: 'getting a flat white saturday morning before the market gets busy, come sit',
    meta: 'Saturday, 9am · 1 spot'
  },
  {
    cat: 'outdoors',
    text: 'slow loop around the park sunday at 9, the kind of pace where you can actually talk',
    meta: 'Sunday, 9am · 2 spots'
  },
  {
    cat: 'music',
    text: 'free show wednesday night, going alone unless someone joins',
    meta: 'Wednesday, 8pm · 1 spot'
  }
];

function weekOfLabel(): string {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return monday.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

function dateStamp(iso: string | null): { weekday: string; day: number } | null {
  if (!iso) return null;
  const date = new Date(iso + 'T00:00:00');
  return {
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: date.getDate()
  };
}

function FeedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cityPref] = useCityPreference();

  const cityParam = searchParams.get('city');
  const activeCity = cityParam ?? cityPref ?? 'all';
  const cat = searchParams.get('category');

  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (activeCity !== 'all') params.set('city', activeCity);
    if (cat) params.set('category', cat);

    fetch(`/api/plans?${params}`)
      .then(r => r.json())
      .then(d => {
        // Sort by when_date ascending (soonest first), no-date at the bottom
        const sorted = (d.plans || []).sort((a: any, b: any) => {
          if (!a.when_date && !b.when_date) return 0;
          if (!a.when_date) return 1;
          if (!b.when_date) return -1;
          return a.when_date.localeCompare(b.when_date);
        });
        setPlans(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeCity, cat]);

  function pickCity(c: 'all' | 'nyc' | 'austin') {
    const params = new URLSearchParams(searchParams.toString());
    if (c === 'all') {
      setCityPreference(null);
      params.delete('city');
    } else {
      setCityPreference(c);
      params.set('city', c);
    }
    router.push(`/feed?${params.toString()}`);
  }

  function setCategory(c: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (c) params.set('category', c); else params.delete('category');
    router.push(`/feed?${params.toString()}`);
  }

  const planCount = plans.length;
  const totalSpots = plans.reduce((acc, p) => acc + (p.spots_left ?? 0), 0);
  const hostCount = new Set(plans.map(p => p.user_id)).size;
  const week = weekOfLabel();
  const cityLabel = activeCity === 'austin' ? 'Austin' : activeCity === 'nyc' ? 'New York' : 'NYC + Austin';

  return (
    <>
      <Nav />
      <div className="max-w-[1080px] mx-auto px-6 sm:px-9 pt-10 pb-16">
        {/* Masthead */}
        <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.1em] text-accent mb-4">
          <span className="w-6 h-px bg-accent"></span>
          <span>Week of {week}</span>
          <span className="opacity-40">·</span>
          <span>{cityLabel}</span>
        </div>

        {/* Headline */}
        {loading ? (
          <h1 className="font-serif text-[clamp(36px,5.5vw,64px)] font-bold tracking-[-2px] leading-[1.0] mb-3">
            This week<em className="italic text-gold">…</em>
          </h1>
        ) : (
          <>
            {planCount > 0 ? (
              <>
                <h1 className="font-serif text-[clamp(36px,5.5vw,64px)] font-bold tracking-[-2px] leading-[1.0] mb-3">
                  This week, <em className="italic text-gold">{planCount} {planCount === 1 ? 'plan' : 'plans'}.</em>
                </h1>
                <p className="text-[13px] text-muted mb-8">
                  Posted by {hostCount} {hostCount === 1 ? 'host' : 'hosts'}
                  <span className="opacity-40 mx-1.5">·</span>
                  {totalSpots} {totalSpots === 1 ? 'spot' : 'spots'} open
                </p>
              </>
            ) : (
              <>
                <h1 className="font-serif text-[clamp(36px,5.5vw,64px)] font-bold tracking-[-2px] leading-[1.0] mb-3">
                  This week is <em className="italic text-gold">wide open.</em>
                </h1>
                <p className="text-[13px] text-muted mb-8">
                  Whatever gets posted first sets the tone.
                  <span className="text-gold"> The first 50 hosts become Founding members.</span>
                </p>
              </>
            )}
          </>
        )}

        {/* Editor's note */}
        <div className="bg-cream-2 border-l-[3px] border-accent rounded-r-lg px-5 py-4 mb-9 max-w-[640px]">
          <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-accent mb-1.5">A note from the Stoop</div>
          <p className="text-[13.5px] text-ink-2 leading-[1.65]">
            Stoop is small on purpose. A few plans, posted by real people in your city, that you can actually show up to. If nothing here fits, post your own. See who comes.
          </p>
        </div>

        {/* City filter tabs */}
        <div className="flex border-b border-[var(--border)] mb-1">
          {[
            { id: 'all' as const, label: 'Both cities' },
            { id: 'nyc' as const, label: 'New York' },
            { id: 'austin' as const, label: 'Austin' }
          ].map(t => (
            <button key={t.id} onClick={() => pickCity(t.id)}
              className={`px-4 py-2.5 text-[13px] border-b-2 -mb-px transition-colors ${
                activeCity === t.id
                  ? 'text-ink border-accent font-medium'
                  : 'text-muted border-transparent hover:text-ink-2'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Quiet category filter */}
        <div className="flex items-center gap-1 flex-wrap py-3 mb-2">
          <button onClick={() => setCategory(null)} className={`text-[11px] font-mono uppercase tracking-[0.1em] px-2 py-1 rounded ${
            !cat ? 'text-ink bg-cream-2' : 'text-muted hover:text-ink-2'
          }`}>All</button>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)} className={`text-[11px] font-mono uppercase tracking-[0.1em] px-2 py-1 rounded ${
              cat === c ? 'text-accent bg-[rgba(47,107,63,0.08)]' : 'text-muted hover:text-ink-2'
            }`}>{c}</button>
          ))}
        </div>

        {/* Plan list - itinerary view */}
        {loading ? (
          <div className="flex flex-col" aria-hidden="true">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-start gap-4 sm:gap-5 py-5 border-b border-[var(--border)] animate-pulse">
                <div className="flex-shrink-0 w-[56px] sm:w-[64px] flex flex-col items-center gap-2 pt-1">
                  <div className="h-2.5 w-8 rounded bg-cream-2"></div>
                  <div className="h-7 w-9 rounded-lg bg-cream-2"></div>
                </div>
                <div className="w-px self-stretch bg-[var(--border)] flex-shrink-0"></div>
                <div className="flex-1 min-w-0 pt-1">
                  <div className="h-2.5 w-20 rounded bg-cream-2 mb-3"></div>
                  <div className="h-4 w-3/4 max-w-[420px] rounded bg-cream-2 mb-3"></div>
                  <div className="h-3 w-44 rounded bg-cream-2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="py-10">
            <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-3">What plans here look like</div>
            <div className="grid sm:grid-cols-3 gap-3 mb-12">
              {SAMPLE_PLANS.map(s => (
                <div key={s.cat} className="border border-dashed border-[var(--border2)] rounded-2xl px-4 py-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className={`tag tag-${s.cat}`}>{s.cat}</span>
                    <span className="text-[10px] font-mono uppercase tracking-wide text-muted">Sample</span>
                  </div>
                  <p className="font-serif text-[15px] font-bold leading-snug mb-1.5 opacity-80">{s.text}</p>
                  <div className="text-[11.5px] text-muted">{s.meta}</div>
                </div>
              ))}
            </div>
            <div className="text-center">
            <h3 className="font-serif text-[22px] font-bold mb-2">Be the first.</h3>
            <p className="text-[13.5px] text-muted leading-relaxed mb-5 max-w-[400px] mx-auto">
              Nothing here for {cityLabel} this week. The type of person who posts on Stoop is the same type who shows up.
              And the first 50 hosts become Founding members, badge and all.
            </p>
            <Link href="/post" className="btn btn-accent">Post a plan →</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col">
              {plans.map((plan: any) => {
                const stamp = dateStamp(plan.when_date);
                const timeStr = plan.when_time_specific || (plan.when_time ? plan.when_time.toLowerCase() : '');
                const tags = plan.intent_tags ?? [];
                return (
                  <Link key={plan.id} href={`/plan/${plan.slug}`}
                    className="group flex items-start gap-4 sm:gap-5 py-5 border-b border-[var(--border)] hover:bg-cream-2/40 -mx-3 px-3 rounded-md transition-colors">
                    {/* Date stamp column */}
                    <div className="flex-shrink-0 w-[56px] sm:w-[64px] text-center">
                      {stamp ? (
                        <>
                          <div className="text-[10.5px] font-mono uppercase tracking-[0.1em] text-muted">{stamp.weekday}</div>
                          <div className="font-serif text-[26px] sm:text-[30px] font-bold leading-none tracking-tight text-ink mt-0.5">{stamp.day}</div>
                          {timeStr && <div className="text-[10.5px] text-muted mt-1.5 leading-tight">{timeStr}</div>}
                        </>
                      ) : (
                        <div className="text-[11px] text-muted mt-1">{plan.when_day}</div>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="w-px self-stretch bg-[var(--border)] flex-shrink-0"></div>

                    {/* Plan content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap mb-1.5 text-[10.5px] font-mono uppercase tracking-[0.1em]">
                        <span className="text-accent">{plan.category}</span>
                        {tags.slice(0, 2).map((t: string) => (
                          <span key={t} className="text-muted">
                            <span className="opacity-40 mx-1.5">·</span>{intentTagLabel(t)}
                          </span>
                        ))}
                      </div>
                      <h3 className="font-serif text-[17px] sm:text-[18px] font-bold text-ink leading-snug mb-1 tracking-[-0.2px]">
                        {plan.text.length > 100 ? plan.text.substring(0, 100) + '…' : plan.text}
                      </h3>
                      <div className="text-[12px] text-muted flex items-center flex-wrap">
                        <Avatar
                          userId={plan.user_id}
                          name={plan.poster?.name}
                          initials={plan.poster?.initials}
                          bg={plan.poster?.avatar_bg}
                          fg={plan.poster?.avatar_fg}
                          size={20}
                          radius={6}
                          className="mr-1.5"
                        />
                        <span className="text-ink-2 font-medium">{plan.poster?.name}</span>
                        <span className="opacity-40 mx-1.5">·</span>
                        hosting
                        {plan.neighborhood?.name && (
                          <>
                            <span className="opacity-40 mx-1.5">·</span>
                            {plan.neighborhood.name}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right action column */}
                    <div className="flex-shrink-0 text-right pt-1 hidden sm:block">
                      <div className="text-[11px] font-mono text-sage flex items-center gap-1.5 justify-end">
                        <span className="w-1.5 h-1.5 rounded-full bg-sage inline-block"></span>
                        {plan.spots_left} open
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Closing prompt */}
            <div className="mt-10 bg-cream-2 border border-[var(--border)] rounded-2xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-serif text-[17px] font-bold text-ink mb-0.5">Nothing here for you?</div>
                <div className="text-[12.5px] text-muted">Be the first this weekend in your neighborhood. Plans get joined fast.</div>
              </div>
              <Link href="/post" className="btn btn-primary btn-sm">Post a plan →</Link>
            </div>
          </>
        )}
      </div>
      <Footer />
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