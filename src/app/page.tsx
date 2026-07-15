import Link from 'next/link';
import Nav from '@/components/Nav';
import Avatar from '@/components/Avatar';
import { createClient } from '@/lib/supabase/server';

export const revalidate = 60;

function weekOfLabel(): string {
  const now = new Date();
  // Find the Monday of this week
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return monday.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export default async function HomePage() {
  const supabase = await createClient();

  const { data: plans, count } = await supabase
    .from('plans')
    .select(`
      *,
      poster:profiles!plans_user_id_fkey(name, initials, avatar_bg, avatar_fg),
      neighborhood:neighborhoods(name),
      city:cities(slug, name)
    `, { count: 'exact' })
    .eq('status', 'open')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(3);

  const planCount = count ?? 0;
  const totalSpots = plans?.reduce((acc, p) => acc + (p.spots_left ?? 0), 0) ?? 0;
  const week = weekOfLabel();

  return (
    <>
      <Nav />

      {/* Editorial masthead */}
      <section className="max-w-[1080px] mx-auto px-6 sm:px-9 pt-12 pb-4">
        <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.1em] text-accent">
          <span className="w-6 h-px bg-accent"></span>
          <span>Week of {week}</span>
          <span className="opacity-40">·</span>
          <span>NYC + Austin</span>
          {planCount > 0 && (
            <>
              <span className="opacity-40">·</span>
              <span>{planCount} {planCount === 1 ? 'plan' : 'plans'}</span>
            </>
          )}
        </div>
      </section>

      {/* Hero with featured plans index */}
      <section className="max-w-[1080px] mx-auto px-6 sm:px-9 pt-2 pb-12 sm:pb-16">
        <div className="grid sm:grid-cols-[1.1fr,1fr] gap-12 sm:gap-16 items-start">
          {/* Left column: headline + CTA */}
          <div>
            <h1 className="font-serif text-[clamp(56px,7vw,96px)] font-bold leading-[0.92] tracking-[-3px] mb-7">
              Plans,<br />not <em className="italic text-accent">profiles.</em>
            </h1>
            <p className="text-[17px] text-ink-2 leading-[1.6] font-light mb-8 max-w-[440px]">
              Post what you&apos;re doing this week.{' '}
              <strong className="text-ink font-medium">Meet the person who shows up.</strong>{' '}
              No swiping, no algorithm, no awkward intros.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              {planCount > 0 ? (
                <>
                  <Link href="/feed" className="btn btn-primary btn-lg">See all {planCount} plans</Link>
                  <Link href="/post" className="btn btn-ghost btn-lg">Post your own →</Link>
                </>
              ) : (
                <>
                  <Link href="/post" className="btn btn-primary btn-lg">Post the first plan →</Link>
                  <Link href="/feed" className="btn btn-ghost btn-lg">Browse</Link>
                </>
              )}
            </div>
            <p className="text-[11.5px] text-muted mt-5">
              Free to browse. You can even write your plan before signing up.
            </p>
          </div>

          {/* Right column: featured plans index */}
          <div className="pt-2">
            <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-ink/15">
              <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-ink-2">Featured this week</div>
              {planCount > 0 && totalSpots > 0 && (
                <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted">{totalSpots} open</div>
              )}
            </div>

            {!plans || plans.length === 0 ? (
              <div className="py-2">
                {/* Empty week: show what a plan looks like instead of a void */}
                <div className="border border-dashed border-[var(--border2)] rounded-xl px-4 py-4 mb-4">
                  <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-2">What a plan looks like</div>
                  <div className="font-serif text-[15px] font-bold text-ink leading-snug mb-1 opacity-70">
                    going to the farmers market saturday morning, making coffee after…
                  </div>
                  <div className="text-[11.5px] text-muted opacity-70">
                    Saturday, 9am
                    <span className="opacity-40 mx-1">·</span>
                    2 spots
                    <span className="opacity-40 mx-1">·</span>
                    your neighborhood
                  </div>
                </div>
                <p className="text-[13px] text-muted leading-relaxed mb-4 text-center">
                  This week is still wide open.<br />The first plan sets the tone.
                </p>
                <div className="text-center">
                  <Link href="/post" className="btn btn-accent btn-sm">Post a plan →</Link>
                </div>
              </div>
            ) : (
              <div className="flex flex-col">
                {plans.map((plan: any) => (
                  <Link key={plan.id} href={`/plan/${plan.slug}`}
                    className="group flex items-start gap-3 py-3.5 border-b border-[var(--border)] last:border-0 hover:bg-cream-2/60 -mx-3 px-3 rounded-md transition-colors">
                    <Avatar
                      userId={plan.user_id}
                      name={plan.poster?.name}
                      initials={plan.poster?.initials}
                      bg={plan.poster?.avatar_bg}
                      fg={plan.poster?.avatar_fg}
                      size={34}
                      radius={10}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-serif text-[15px] font-bold text-ink leading-snug mb-0.5">
                        {plan.text.length > 70 ? plan.text.substring(0, 70) + '…' : plan.text}
                      </div>
                      <div className="text-[11.5px] text-muted">
                        {plan.poster?.name}
                        <span className="opacity-40 mx-1">·</span>
                        {plan.when_day}
                        {plan.when_time_specific && `, ${plan.when_time_specific}`}
                        {!plan.when_time_specific && plan.when_time && `, ${plan.when_time.toLowerCase()}`}
                        <span className="opacity-40 mx-1">·</span>
                        {plan.neighborhood?.name}
                      </div>
                    </div>
                    <div className="text-[11px] text-accent font-medium whitespace-nowrap mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {plan.spots_left} open →
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-cream-2 py-16 sm:py-20 border-y border-[var(--border)]">
        <div className="max-w-[1080px] mx-auto px-6 sm:px-9">
          <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-2">How it works</div>
          <h2 className="font-serif text-[clamp(28px,4vw,44px)] font-bold tracking-[-1.2px] leading-[1.05]">
            Three steps to <em className="italic text-accent">an actual plan.</em>
          </h2>

          <div className="grid sm:grid-cols-3 gap-[2px] mt-10 rounded-2xl overflow-hidden bg-[var(--border)]">
            {[
              { n: '01', h: 'Write your plan', p: 'In your own words. Specific place, specific time. No event form, no category dropdown.' },
              { n: '02', h: 'Someone reaches out', p: 'Not a swipe. A real message from someone who read what you wrote and wants to come.' },
              { n: '03', h: 'You meet', p: 'A few people, one thing, no pressure. You were already going. Now you\'re not going alone.' }
            ].map(step => (
              <div key={step.n} className="bg-cream p-8">
                <div className="font-serif text-[64px] font-bold tracking-[-3px] leading-none text-cream-2 mb-3">{step.n}</div>
                <h3 className="font-serif text-[20px] font-bold tracking-tight mb-2">{step.h}</h3>
                <p className="text-[13.5px] text-ink-2 leading-[1.65] font-light">{step.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 sm:px-9 my-16 sm:my-20">
        <div className="max-w-[1080px] mx-auto bg-ink rounded-3xl px-12 py-16 sm:py-20 flex items-center justify-between gap-8 flex-wrap relative overflow-hidden">
          <div>
            <h2 className="font-serif text-[clamp(28px,4vw,46px)] font-bold tracking-[-1.2px] leading-[1.05] text-cream mb-2">
              Your city has<br /><em className="italic text-accent">interesting people.</em>
            </h2>
            <p className="text-[14px] text-cream/50 font-light leading-relaxed">Post what you&apos;re doing this week. See who shows up.</p>
          </div>
          <Link href="/post" className="btn btn-lg bg-cream text-ink hover:bg-white">Post your first plan →</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-6 px-6 sm:px-9 flex items-center justify-between flex-wrap gap-3">
        <div className="font-serif text-[17px] font-bold">St<em className="not-italic italic text-accent">oo</em>p</div>
        <div className="flex gap-5">
          <Link href="/feed" className="text-xs text-muted hover:text-ink">Browse</Link>
          <Link href="/post" className="text-xs text-muted hover:text-ink">Post a plan</Link>
          <Link href="/terms" className="text-xs text-muted hover:text-ink">Terms</Link>
        </div>
        <div className="text-[11px] text-muted">NYC + Austin · 2026</div>
      </footer>
    </>
  );
}