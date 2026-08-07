'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import CategoryArt, { CATEGORIES } from '@/components/CategoryArt';
import { CapacitySegments } from '@/components/CapacityMeter';
import { EmptyBoardArt, OutageArt, PinnedCardArt } from '@/components/StoopArt';
import { PinIcon, CoinIcon } from '@/components/icons';
import { useCityPreference, setCityPreference } from '@/lib/city-preference';
import { intentTagLabel } from '@/lib/utils';
import {
  BROWSE_CONTRACT,
  emptyNeighborhoodCopy,
  openPlanCount,
  FEED_ERROR_HEADLINE,
  FEED_ERROR_BODY,
  FEED_ERROR_RETRY
} from '@/lib/product-copy';
import { costExpectationLabel } from '@/lib/plan-contract';
import { firstNameOf } from '@/lib/participants';

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

// The feed list itself. Kept out of page.tsx because a Next page module may
// only export the page and its metadata, and this needs to be importable by
// a test that renders the three states directly.
// rendered directly in a test without standing up the router around them.
export default function FeedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cityPref] = useCityPreference();

  const cityParam = searchParams.get('city');
  const activeCity = cityParam ?? cityPref ?? 'all';
  const cat = searchParams.get('category');

  // Three states, never conflated. An empty list is a fact about the
  // neighborhood; a failed request is a fact about us. Reading the second as
  // the first is how an outage ends up telling somebody there is nothing here.
  type FeedState =
    | { kind: 'loading' }
    | { kind: 'ready'; plans: any[]; total: number }
    | { kind: 'error' };

  const [state, setState] = useState<FeedState>({ kind: 'loading' });
  // Bumped by the retry button, so the effect runs again with the same filters.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Anything already on screen belongs to the old filters or the old attempt.
    let abandoned = false;
    setState({ kind: 'loading' });

    const params = new URLSearchParams();
    if (activeCity !== 'all') params.set('city', activeCity);
    if (cat) params.set('category', cat);

    fetch(`/api/plans?${params}`)
      .then(r => {
        // An error body is still JSON. Without this check it becomes plans=[]
        // and the page reports zero supply for a database that is simply down.
        if (!r.ok) throw new Error('plans request failed');
        return r.json();
      })
      .then(d => {
        if (abandoned) return;
        // Sort by when_date ascending (soonest first), no-date at the bottom
        const sorted = (d.plans || []).sort((a: any, b: any) => {
          if (!a.when_date && !b.when_date) return 0;
          if (!a.when_date) return 1;
          if (!b.when_date) return -1;
          return a.when_date.localeCompare(b.when_date);
        });
        setState({
          kind: 'ready',
          plans: sorted,
          total: typeof d.total === 'number' ? d.total : sorted.length
        });
      })
      .catch(() => {
        // Whatever the server said stays in the network tab. The page says one
        // fixed thing, so no operational detail reaches a visitor.
        if (!abandoned) setState({ kind: 'error' });
      });

    // If the filters change mid-flight, the answer to the question nobody is
    // asking any more must not repaint the page, in either direction.
    return () => { abandoned = true; };
  }, [activeCity, cat, attempt]);

  const loading = state.kind === 'loading';
  const failed = state.kind === 'error';
  const plans = state.kind === 'ready' ? state.plans : [];
  const total = state.kind === 'ready' ? state.total : 0;

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
      {/* Masthead. Each part is nowrap and the row wraps between them: at 320px
          the plain flex row broke "Week of August 3" after "August" and split
          "NYC + Austin" down the middle. */}
      <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[10.5px] sm:text-[11px] font-mono uppercase tracking-[0.1em] text-accent mb-3">
        <span aria-hidden="true" className="w-5 h-px bg-accent"></span>
        <span className="whitespace-nowrap">Week of {week}</span>
        <span aria-hidden="true" className="opacity-40">·</span>
        <span className="whitespace-nowrap">{cityLabel}</span>
      </div>

      {/* Headline */}
      {loading ? (
        <h1 className="font-serif text-[28px] sm:text-[clamp(36px,5.5vw,64px)] font-bold tracking-[-1px] sm:tracking-[-2px] leading-[1.02] mb-2.5 sm:mb-3">
          This week<em className="italic text-gold">…</em>
        </h1>
      ) : failed ? (
        // One announcement, not two. The headline names the problem and the
        // paragraph explains it, so they live inside a single role="alert":
        // split across the page, a screen reader reached the body ("that is a
        // problem with Stoop") without ever hearing what had gone wrong. The
        // retry and the way out are in here for the same reason.
        //
        // No count, no samples, no server detail. The drawing is a snapped
        // line, deliberately not an empty board: the one thing this state must
        // never look like is zero supply. It wraps at 320px because the block
        // is a single column with no fixed widths.
        <div role="alert" className="mb-9">
          <h1 className="font-serif text-[26px] sm:text-[clamp(30px,5vw,52px)] font-bold tracking-[-0.8px] sm:tracking-[-1.5px] leading-[1.05] mb-3 sm:mb-4">
            {FEED_ERROR_HEADLINE}
          </h1>
          <div className="bg-cream-2 border-l-[3px] border-danger rounded-r-lg px-5 py-4 max-w-[560px]">
            <OutageArt width={108} className="text-danger mb-3" />
            <p className="text-[13.5px] text-ink-2 leading-[1.65] mb-4">{FEED_ERROR_BODY}</p>
            <button type="button" onClick={() => setAttempt(n => n + 1)} className="btn btn-accent btn-sm">
              {FEED_ERROR_RETRY}
            </button>
          </div>
          <p className="text-[12.5px] text-muted mt-4 max-w-[560px] leading-relaxed">
            You can still <Link href="/post" className="text-accent font-medium hover:underline">post a plan</Link>{' '}
            while this is happening.
          </p>
        </div>
      ) : (
        <>
          {planCount > 0 ? (
            <>
              <h1 className="font-serif text-[28px] sm:text-[clamp(36px,5.5vw,64px)] font-bold tracking-[-1px] sm:tracking-[-2px] leading-[1.02] mb-2.5 sm:mb-3">
                This week, <em className="italic text-gold">{total} {total === 1 ? 'plan' : 'plans'}.</em>
              </h1>
              <p className="text-[13px] text-muted mb-8">
                {openPlanCount(total, cat)} in {cityLabel}
                {total > planCount && <>, showing the first {planCount}</>}
                <span className="opacity-40 mx-1.5">·</span>
                {hostCount} {hostCount === 1 ? 'host' : 'hosts'} on this page
                <span className="opacity-40 mx-1.5">·</span>
                {totalSpots} {totalSpots === 1 ? 'spot' : 'spots'} open here
              </p>
            </>
          ) : (
            <>
              <h1 className="font-serif text-[28px] sm:text-[clamp(36px,5.5vw,64px)] font-bold tracking-[-1px] sm:tracking-[-2px] leading-[1.02] mb-2.5 sm:mb-3">
                This week is <em className="italic text-gold">wide open.</em>
              </h1>
              <p className="text-[13px] text-muted mb-8 max-w-[520px] leading-relaxed">
                {emptyNeighborhoodCopy(cityLabel)}
                <span className="text-gold-2"> The first 50 hosts become Founding members.</span>
              </p>
            </>
          )}
        </>
      )}

      {/* Editor's note. Still the whole contract, in a block that does not own
          a fifth of the phone screen before the first plan. */}
      <div className="bg-cream-2 border-l-[3px] border-accent rounded-r-lg px-3.5 sm:px-5 py-3 sm:py-4 mb-6 sm:mb-9 max-w-[640px] flex items-start gap-3">
        <PinnedCardArt width={22} className="text-accent flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-[10.5px] font-mono uppercase tracking-[0.1em] text-accent mb-1">How this works</div>
          <p className="text-[12.5px] sm:text-[13.5px] text-ink-2 leading-[1.55]">{BROWSE_CONTRACT}</p>
        </div>
      </div>

      {/* City filter tabs */}
      <div role="group" aria-label="Filter by city" className="flex border-b border-[var(--border)] mb-1">
        {[
          { id: 'all' as const, label: 'Both cities' },
          { id: 'nyc' as const, label: 'New York' },
          { id: 'austin' as const, label: 'Austin' }
        ].map(t => (
          <button key={t.id} type="button" onClick={() => pickCity(t.id)} aria-pressed={activeCity === t.id}
            className={`px-4 py-2.5 text-[13px] border-b-2 -mb-px transition-colors ${
              activeCity === t.id
                ? 'text-ink border-accent font-medium'
                : 'text-muted border-transparent hover:text-ink-2'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Quiet category filter. The drawing repeats what the word already says,
          so it stays decorative and the button keeps its plain accessible name.
          Every chip is a 32px row: at py-1 these were 24px tall, which is a
          small thing to hit on a phone and there are eight of them. */}
      <div role="group" aria-label="Filter by category" className="flex items-center gap-1 flex-wrap py-2.5 mb-2">
        <button type="button" onClick={() => setCategory(null)} aria-pressed={!cat}
          className={`text-[11px] font-mono uppercase tracking-[0.1em] px-3 h-8 rounded inline-flex items-center ${
          !cat ? 'text-ink bg-cream-2' : 'text-muted hover:text-ink-2'
        }`}>All</button>
        {CATEGORIES.map(c => (
          <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={cat === c}
            className={`text-[11px] font-mono uppercase tracking-[0.1em] pl-1.5 pr-2.5 h-8 rounded inline-flex items-center gap-1.5 ${
            cat === c ? 'text-accent bg-[rgba(47,107,63,0.08)]' : 'text-muted hover:text-ink-2'
          }`}>
            <CategoryArt category={c} size={20} tile={false} />
            {c}
          </button>
        ))}
      </div>

      {/* Plan list - itinerary view */}
      {loading ? (
        // The skeleton is the shape of a row, so nothing jumps when the real
        // rows replace it: same stamp column, same rule, same three lines.
        <div className="flex flex-col" role="status" aria-label="Loading plans">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-start gap-4 sm:gap-5 py-5 border-b border-[var(--border)] animate-pulse">
              <div className="flex-shrink-0 w-[56px] sm:w-[64px] flex flex-col items-center gap-2 pt-1">
                <div className="h-2.5 w-8 rounded bg-cream-2"></div>
                <div className="h-7 w-9 rounded-lg bg-cream-2"></div>
              </div>
              <div className="w-px self-stretch bg-[var(--border)] flex-shrink-0"></div>
              <div className="h-9 w-9 rounded-xl bg-cream-2 flex-shrink-0 mt-0.5"></div>
              {/* Percentages, not fixed widths. At 320px this column is 143px
                  wide and the last bar was w-44 (176px), so the skeleton was
                  the one thing on the site that scrolled sideways, and only
                  while the real rows were still loading. */}
              <div className="flex-1 min-w-0 pt-1">
                <div className="h-2.5 w-1/2 max-w-[80px] rounded bg-cream-2 mb-3"></div>
                <div className="h-4 w-full max-w-[420px] rounded bg-cream-2 mb-3"></div>
                <div className="h-3 w-3/4 max-w-[176px] rounded bg-cream-2"></div>
              </div>
            </div>
          ))}
        </div>
      ) : failed ? (
        // The whole outage state is one alert, up where the headline goes.
        // Nothing is repeated down here: a second region would be announced
        // separately, which is the problem this state was fixing.
        null
      ) : plans.length === 0 ? (
        <div className="py-10">
          <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-3">What plans here look like</div>
          <div className="grid sm:grid-cols-3 gap-3 mb-12">
            {SAMPLE_PLANS.map(s => (
              <div key={s.cat} className="border border-dashed border-[var(--border2)] rounded-2xl px-4 py-4">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <CategoryArt category={s.cat} size={30} />
                  <span className={`tag tag-${s.cat}`}>{s.cat}</span>
                  <span className="text-[10px] font-mono uppercase tracking-wide text-muted">Sample</span>
                </div>
                <p className="font-serif text-[15px] font-bold leading-snug mb-1.5 opacity-80">{s.text}</p>
                <div className="text-[11.5px] text-muted">{s.meta}</div>
              </div>
            ))}
          </div>
          <div className="text-center">
          {/* The board is up and bare. Nothing here says anything is broken. */}
          <EmptyBoardArt width={132} className="text-muted mx-auto mb-4" />
          <h2 className="font-serif text-[22px] font-bold mb-2">Be the first.</h2>
          <p className="text-[13.5px] text-muted leading-relaxed mb-5 max-w-[400px] mx-auto">
            {emptyNeighborhoodCopy(cityLabel)} The first 50 hosts become Founding members, badge and all.
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

                  {/* Plan content. The drawing is a second reading of the
                      category word beside it, so it stays decorative. */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap mb-1.5 text-[10.5px] font-mono uppercase tracking-[0.1em]">
                      <CategoryArt category={plan.category} size={22} tile={false} className="mr-1.5" />
                      <span className="text-accent">{plan.category}</span>
                      {tags.slice(0, 2).map((t: string) => (
                        <span key={t} className="text-muted">
                          <span className="opacity-40 mx-1.5">·</span>{intentTagLabel(t)}
                        </span>
                      ))}
                    </div>
                    <h2 className="font-serif text-[17px] sm:text-[18px] font-bold text-ink leading-snug mb-1.5 tracking-[-0.2px]">
                      {plan.text.length > 100 ? plan.text.substring(0, 100) + '…' : plan.text}
                    </h2>
                    {/* Each fact is one nowrap group. Left to wrap freely, a
                        320px row put the pin at the end of one line and the
                        neighborhood at the start of the next. */}
                    <div className="text-[11.5px] sm:text-[12px] text-muted flex items-center flex-wrap gap-x-1.5 gap-y-1">
                      <span className="inline-flex items-center whitespace-nowrap">
                        <Avatar
                          userId={plan.user_id}
                          name={firstNameOf(plan.poster?.name)}
                          initials={plan.poster?.initials}
                          bg={plan.poster?.avatar_bg}
                          fg={plan.poster?.avatar_fg}
                          size={18}
                          radius={6}
                          className="mr-1.5"
                        />
                        <span className="text-ink-2 font-medium">{firstNameOf(plan.poster?.name)}</span>
                        <span aria-hidden="true" className="opacity-40 mx-1.5">·</span>
                        hosting
                      </span>
                      {plan.neighborhood?.name && (
                        <span className="inline-flex items-center whitespace-nowrap">
                          <span aria-hidden="true" className="opacity-40 mr-1.5">·</span>
                          <PinIcon size={12} className="mr-1 flex-shrink-0" />
                          {plan.neighborhood.name}
                        </span>
                      )}
                      {costExpectationLabel(plan.cost_expectation) && (
                        <span className="inline-flex items-center whitespace-nowrap">
                          <span aria-hidden="true" className="opacity-40 mr-1.5">·</span>
                          <CoinIcon size={12} className="mr-1 flex-shrink-0" />
                          {costExpectationLabel(plan.cost_expectation)}
                        </span>
                      )}
                      {/* Desktop shows this in the right-hand column; on a
                          phone that column is hidden, so say it here. */}
                      <span className="inline-flex items-center whitespace-nowrap text-sage sm:hidden">
                        <span aria-hidden="true" className="opacity-40 mr-1.5 text-muted">·</span>
                        {plan.spots_left} open
                      </span>
                    </div>
                  </div>

                  {/* Right action column: the segments draw the same number the
                      line under them writes out. */}
                  <div className="flex-shrink-0 text-right pt-1 hidden sm:block">
                    <CapacitySegments
                      spotsLeft={plan.spots_left}
                      spotsTotal={plan.spots_total}
                      compact
                      className="justify-end mb-1.5"
                    />
                    <div className="text-[11px] font-mono text-sage">
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
              <div className="text-[12.5px] text-muted">Post your own week instead. Your neighborhood, your time, your call on who comes.</div>
            </div>
            <Link href="/post" className="btn btn-primary btn-sm">Post a plan →</Link>
          </div>
        </>
      )}
    </>
  );
}
