import Link from 'next/link';
import Nav from '@/components/Nav';
import PlanCard from '@/components/PlanCard';
import { createClient } from '@/lib/supabase/server';

export const revalidate = 60;

export default async function HomePage() {
  const supabase = await createClient();

  // Fetch plans from BOTH cities, mixed
  const { data: plans } = await supabase
    .from('plans')
    .select(`
      *,
      poster:profiles!plans_user_id_fkey(name, initials, avatar_bg, avatar_fg),
      neighborhood:neighborhoods(name),
      city:cities(slug, name)
    `)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(6);

  return (
    <>
      <Nav />

      {/* Hero */}
      <section className="max-w-[1080px] mx-auto px-6 sm:px-9 py-16 sm:py-20 grid sm:grid-cols-2 gap-16 items-center">
        <div>
          <div className="flex items-center gap-2.5 mb-6 text-[11px] uppercase tracking-wider text-accent font-medium">
            <span className="w-5 h-px bg-accent"></span>
            <span>New York + Austin · This week</span>
          </div>
          <h1 className="font-serif text-[clamp(54px,6vw,84px)] font-bold leading-[0.95] tracking-[-2.5px] mb-7">
            Plans,<br />not <em className="italic text-accent">profiles.</em>
          </h1>
          <p className="text-[17px] text-ink-2 leading-[1.65] font-light max-w-[420px] mb-9">
            Post what you&apos;re doing this week.{' '}
            <strong className="text-ink font-medium">Meet the person who shows up.</strong>{' '}
            No swiping, no algorithm, no awkward intros.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/feed" className="btn btn-primary btn-lg">See what&apos;s out there</Link>
            <Link href="/post" className="btn btn-ghost btn-lg">Post a plan →</Link>
          </div>
          <p className="text-[11.5px] text-muted mt-4 flex items-center gap-1.5">
            <span className="text-[10px]">↑</span>
            Browse everything free. No sign-up until you&apos;re ready to act.
          </p>
        </div>

        <div className="hidden sm:block relative h-[460px]">
          {plans?.slice(0, 3).map((plan, i) => {
            const rotations = ['-2.5deg', '1.8deg', '-1deg'];
            const tops = ['10px', '110px', '210px'];
            const lefts = ['-10px', '15px', '-5px'];
            return (
              <div
                key={plan.id}
                className="absolute w-[268px]"
                style={{
                  top: tops[i],
                  left: lefts[i],
                  transform: `rotate(${rotations[i]})`,
                  zIndex: 3 - i
                }}
              >
                <PlanCard plan={plan as any} />
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-cream-2 py-16 sm:py-20">
        <div className="max-w-[1080px] mx-auto px-6 sm:px-9">
          <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2">How it works</div>
          <h2 className="font-serif text-[clamp(28px,4vw,44px)] font-bold tracking-[-1.2px] leading-[1.05]">
            Three steps to <em className="italic text-accent">an actual plan.</em>
          </h2>

          <div className="grid sm:grid-cols-3 gap-[2px] mt-10 rounded-2xl overflow-hidden bg-[var(--border)]">
            {[
              { n: '01', h: 'Write your plan', p: 'In your own words. Specific place and time. No event form, no category dropdown.' },
              { n: '02', h: 'Someone reaches out', p: 'Not a swipe. A real message from someone who read what you wrote and wants to come.' },
              { n: '03', h: 'You meet', p: 'Two people, one thing, no pressure. You were already going. Now you\'re not going alone.' }
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

      {/* Feed preview */}
      <section className="py-16 sm:py-20">
        <div className="max-w-[1080px] mx-auto px-6 sm:px-9">
          <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2">Happening this week</div>
          <h2 className="font-serif text-[clamp(24px,3vw,36px)] font-bold tracking-tight mb-5">Across both cities</h2>
          <div className="grid sm:grid-cols-3 gap-2.5">
            {plans?.slice(0, 3).map(plan => <PlanCard key={plan.id} plan={plan as any} />)}
          </div>
          <div className="text-center mt-6">
            <Link href="/feed" className="btn btn-ghost">See all plans →</Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 sm:px-9 mb-20">
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
        </div>
        <div className="text-[11px] text-muted">NYC + Austin · 2026</div>
      </footer>
    </>
  );
}