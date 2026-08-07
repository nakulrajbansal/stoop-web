import Link from 'next/link';
import Nav from '@/components/Nav';
import PageMain from '@/components/PageMain';
import Footer from '@/components/Footer';
import Avatar from '@/components/Avatar';
import Photograph from '@/components/Photograph';
import FaqList from '@/components/FaqList';
import JsonLd from '@/components/JsonLd';
import CategoryArt, { CATEGORIES, CATEGORY_LABELS, categoryLabelOf } from '@/components/CategoryArt';
import { BrowseArt, MessageArt, HostChoosesArt, TableArt, EmptyBoardArt } from '@/components/StoopArt';
import { CalendarIcon, MessageIcon, CheckCircleIcon, UsersIcon, UndoIcon, NoteIcon } from '@/components/icons';
import { PHOTOS } from '@/lib/photos';
import { createClient } from '@/lib/supabase/server';
import { firstNameOf } from '@/lib/participants';
import {
  BROWSE_CONTRACT,
  CONTRACT_STEPS,
  CONTRACT_QUESTIONS,
  CONTRACT_FAQ,
  emptyNeighborhoodCopy,
  openPlanCount
} from '@/lib/product-copy';
import type { Metadata } from 'next';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Stoop · Meet neighbors over real plans in NYC and Austin',
  description:
    "Post what you're already doing this week (coffee, a run, pickleball) and a few neighbors join you. Browse plans and hosts without an account; sign up only when you want to post or message.",
  alternates: { canonical: 'https://www.stoop.house/' }
};

// Visible on the page AND mirrored into FAQPage structured data below, so
// Google can show these as rich results. Every answer is in the DOM even when
// its disclosure is closed, which is why the two can still be in sync.
const FAQ = [
  {
    q: 'What is Stoop?',
    a: 'Stoop is a neighborhood noticeboard for plans. You post something you are already doing this week, in your own words, and up to three neighbors can join you. No profiles to browse, no feed to scroll.'
  },
  ...CONTRACT_FAQ,
  {
    q: 'What kinds of plans do people post?',
    a: 'Coffee, runs and pickup sports, food, arts, books, live music, time outdoors. If you were going to do it anyway, it belongs on Stoop.'
  },
  {
    q: 'Where does Stoop work?',
    a: 'New York City and Austin, neighborhood by neighborhood. Every plan is local: posted by someone who lives nearby, happening somewhere you can walk or train to.'
  },
  {
    q: 'Is Stoop free?',
    a: 'Yes. Posting plans and joining them is free.'
  },
  {
    q: 'Is it safe to meet people from Stoop?',
    a: 'Every member verifies a real phone number, groups are capped at four people, plans happen in public places, and blocking and reporting are built in. Blocking is instant and mutual, and every report is read.'
  }
];

// One drawing per step, in the step's own order. Kept next to the copy it
// illustrates so a fifth step cannot quietly arrive without a picture.
const STEP_ART = [BrowseArt, MessageArt, HostChoosesArt, TableArt];

// A mark per contract question, chosen by what the question is about rather
// than by position, so re-ordering the six cannot silently mismatch them.
const QUESTION_ICON: { match: RegExp; Icon: typeof CalendarIcon }[] = [
  { match: /what is this/i, Icon: NoteIcon },
  { match: /what will i see/i, Icon: CalendarIcon },
  { match: /when i message/i, Icon: MessageIcon },
  { match: /who decides/i, Icon: CheckCircleIcon },
  { match: /see the group/i, Icon: UsersIcon },
  { match: /change my mind/i, Icon: UndoIcon }
];

function iconFor(question: string) {
  return QUESTION_ICON.find(entry => entry.match.test(question))?.Icon ?? NoteIcon;
}

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
      poster:profiles!plans_user_id_fkey(name:display_name, initials, avatar_bg, avatar_fg),
      neighborhood:neighborhoods(name),
      city:cities(slug, name)
    `, { count: 'exact' })
    .in('status', ['open', 'full'])
    .gt('expires_at', new Date().toISOString())
    .order('when_date', { ascending: true, nullsFirst: false })
    .limit(4);

  // Two different true numbers. The featured list includes plans that filled up,
  // because a full plan is still worth reading; the count a visitor is given is
  // plans they could actually join.
  const { count: openCount } = await supabase
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')
    .gt('expires_at', new Date().toISOString());

  const planCount = count ?? 0;
  const openPlans = openCount ?? 0;
  const totalSpots = plans?.reduce((acc, p) => acc + (p.spots_left ?? 0), 0) ?? 0;
  const week = weekOfLabel();

  // ItemList structured data: lets Google read the featured plans as a
  // ranked list on the homepage (carousel-eligible rich result). The names
  // here are plan text a neighbor typed, which is why every block on this page
  // goes out through JsonLd rather than straight into a script element.
  const itemListJsonLd = plans && plans.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Featured neighbor plans this week',
    itemListElement: plans.map((p: any, i: number) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://www.stoop.house/plan/${p.slug}`,
      name: p.text.length > 90 ? p.text.substring(0, 90) + '…' : p.text,
    })),
  } : null;

  return (
    <>
      {itemListJsonLd && <JsonLd data={itemListJsonLd} />}
      <Nav />

      <PageMain>
      {/* Editorial masthead */}
      <section className="max-w-[1080px] mx-auto px-5 sm:px-9 pt-10 sm:pt-12 pb-4">
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono uppercase tracking-[0.1em] text-accent">
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

      {/* Hero: proposition on the left, a photograph and the board on the right */}
      <section className="max-w-[1080px] mx-auto px-5 sm:px-9 pt-2 pb-12 sm:pb-16">
        <div className="grid sm:grid-cols-[1.02fr,1fr] gap-10 sm:gap-14 items-start">
          {/* Left column: headline + CTA */}
          <div>
            {/* Fluid from 320px up: the old 56px floor overflowed the line on a
                narrow phone, which is most of the traffic here. */}
            <h1 className="font-serif text-[clamp(42px,13vw,96px)] font-bold leading-[0.92] tracking-[-1.5px] sm:tracking-[-3px] mb-6 sm:mb-7">
              Plans,<br />not <em className="italic text-gold">profiles.</em>
            </h1>
            <p className="text-[16px] sm:text-[17px] text-ink-2 leading-[1.6] font-light mb-4 max-w-[440px]">
              Post what you&apos;re already doing this week.{' '}
              <strong className="text-ink font-medium">A few neighbors join you.</strong>{' '}
              That&apos;s the whole app.
            </p>
            {/* The whole sequence, before anyone is asked for a phone number. */}
            <p className="text-[13.5px] text-ink-2 leading-[1.65] mb-7 sm:mb-8 max-w-[440px]">
              {BROWSE_CONTRACT}
            </p>
            {/* One dominant action, full width where the thumb is. Browsing sits
                directly under it rather than competing at the same weight. */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Link href="/post" className="btn btn-accent btn-lg justify-center">
                {planCount > 0 ? 'Post a plan →' : 'Post the first plan →'}
              </Link>
              <Link href="/feed" className="btn btn-ghost btn-lg justify-center">
                {planCount > 0 ? `Browse ${planCount} ${planCount === 1 ? 'plan' : 'plans'}` : 'Browse'}
              </Link>
            </div>
            <p className="text-[11.5px] text-muted mt-5">
              {openPlanCount(openPlans)} across NYC and Austin right now. Free to browse, and you can write
              your plan before signing up.
            </p>
          </div>

          {/* Right column: a photograph, then the board itself. The picture is
              atmosphere and says so; the plans under it are the real thing. */}
          <div className="rise rise-1">
            <Photograph
              photo={PHOTOS.sidewalkTable}
              priority
              aspect="3 / 2"
              sizes="(max-width: 640px) 92vw, 46vw"
              frameClassName="photo-frame-organic"
            />

            <div className="mt-6 sm:mt-7">
              <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-ink/15">
                <h2 className="text-[11px] font-mono uppercase tracking-[0.1em] text-ink-2">Featured this week</h2>
                {planCount > 0 && totalSpots > 0 && (
                  <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted">{totalSpots} open</div>
                )}
              </div>

              {!plans || plans.length === 0 ? (
                <div className="py-1">
                  {/* Empty week: show what a plan looks like instead of a void */}
                  <div className="border border-dashed border-[var(--border2)] rounded-xl px-4 py-4 mb-4 flex items-start gap-3">
                    <CategoryArt category="coffee" size={38} className="mt-0.5" />
                    <div className="min-w-0">
                      {/* Labelled Sample for the same reason the feed's are: it is
                          an illustration, and it is not in any count on this page. */}
                      <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-1.5">
                        Sample · what a plan looks like
                      </div>
                      <div className="font-serif text-[15px] font-bold text-ink leading-snug mb-1 opacity-70">
                        going to the farmers market saturday morning, making coffee after…
                      </div>
                      <div className="text-[11.5px] text-muted">
                        Saturday, 9am
                        <span className="opacity-40 mx-1">·</span>
                        2 spots
                        <span className="opacity-40 mx-1">·</span>
                        your neighborhood
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 mb-4">
                    <EmptyBoardArt width={58} className="text-muted flex-shrink-0 mt-0.5" />
                    <p className="text-[13px] text-muted leading-relaxed">
                      {emptyNeighborhoodCopy()}{' '}
                      <span className="text-gold-2">First 50 hosts become Founding members.</span>
                    </p>
                  </div>
                  <div className="text-center">
                    <Link href="/post" className="btn btn-accent btn-sm">Post a plan →</Link>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col">
                  {plans.map((plan: any) => (
                    <Link key={plan.id} href={`/plan/${plan.slug}`}
                      className="group flex items-start gap-3 py-3.5 border-b border-[var(--border)] last:border-0 hover:bg-cream-2/60 -mx-3 px-3 rounded-md transition-colors">
                      {/* The one surface where the category is not written out:
                          these rows have no room for the word the feed shows,
                          so the drawing carries an accessible name instead and
                          the link reads "Coffee, going to the farmers market…".
                          A category we no longer draw names itself nothing, and
                          the plan text still says what it is. */}
                      <CategoryArt
                        category={plan.category}
                        size={38}
                        className="mt-0.5"
                        label={categoryLabelOf(plan.category) ?? undefined}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-serif text-[15px] font-bold text-ink leading-snug mb-0.5">
                          {plan.text.length > 70 ? plan.text.substring(0, 70) + '…' : plan.text}
                        </div>
                        <div className="text-[11.5px] text-muted flex items-center flex-wrap gap-y-0.5">
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
                          {firstNameOf(plan.poster?.name)}
                          <span className="opacity-40 mx-1">·</span>
                          {plan.when_day}
                          {plan.when_time_specific && `, ${plan.when_time_specific}`}
                          {!plan.when_time_specific && plan.when_time && `, ${plan.when_time.toLowerCase()}`}
                          <span className="opacity-40 mx-1">·</span>
                          {plan.neighborhood?.name}
                        </div>
                      </div>
                      <div className="text-[11px] font-medium whitespace-nowrap mt-1">
                        {plan.status === 'full' || plan.spots_left === 0 ? (
                          <span className="text-muted">Full ✓</span>
                        ) : (
                          <span className="text-accent">{plan.spots_left} open →</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* How it works: the sequence drawn, one line of copy each. Every fact the
          short lines leave out is stated in the section below this one. */}
      <section aria-labelledby="how-it-works-heading" className="bg-cream-2 py-14 sm:py-20 border-y border-[var(--border)]">
        <div className="max-w-[1080px] mx-auto px-5 sm:px-9">
          <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-2">How it works</div>
          <h2 id="how-it-works-heading" className="font-serif text-[clamp(28px,4vw,44px)] font-bold tracking-[-1.2px] leading-[1.05]">
            Four steps, and <em className="italic text-gold">no guessing.</em>
          </h2>

          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mt-9 list-none">
            {CONTRACT_STEPS.map((step, i) => {
              const Art = STEP_ART[i];
              // No connector rule between the cards: this list clips its own
              // overflow to keep the header band inside the rounded corner, so
              // anything drawn outside the card was never painted at any
              // viewport. The numerals carry the order.
              return (
                <li key={step.n} className="bg-cream border border-[var(--border)] rounded-2xl overflow-hidden">
                  <div className="bg-[rgba(47,107,63,0.05)] border-b border-[var(--border)] py-6 flex items-center justify-center">
                    <Art width={112} className="text-accent" />
                  </div>
                  <div className="p-5 sm:p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] font-mono tracking-[0.1em] text-[rgba(47,107,63,0.9)]">{step.n}</span>
                      <span aria-hidden="true" className="w-4 h-px bg-[var(--border2)]"></span>
                    </div>
                    <h3 className="font-serif text-[19px] font-bold tracking-tight mb-1.5">{step.title}</h3>
                    <p className="text-[13.5px] text-ink-2 leading-[1.6] font-light">{step.short}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* What people post: the seven categories, drawn, each a way into the feed */}
      <section aria-labelledby="categories-heading" className="max-w-[1080px] mx-auto px-5 sm:px-9 pt-14 sm:pt-20">
        <div className="grid sm:grid-cols-[0.85fr,1fr] gap-8 sm:gap-12 items-center">
          <Photograph
            photo={PHOTOS.parkPath}
            aspect="4 / 3"
            sizes="(max-width: 640px) 92vw, 40vw"
            frameClassName="photo-frame-organic"
          />
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-2">What people post</div>
            <h2 id="categories-heading" className="font-serif text-[clamp(26px,4vw,40px)] font-bold tracking-[-1.2px] leading-[1.05] mb-3">
              Seven kinds of <em className="italic text-gold">ordinary week.</em>
            </h2>
            <p className="text-[13.5px] text-ink-2 leading-[1.7] font-light mb-6 max-w-[460px]">
              A plan is something you were doing anyway, with room for a few neighbors. Pick a kind to see what is
              on the board this week.
            </p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 list-none">
              {CATEGORIES.map(cat => (
                <li key={cat}>
                  <Link href={`/feed?category=${cat}`}
                    className="lift flex items-center gap-2.5 bg-card border border-[var(--border)] rounded-xl px-3 py-2.5 hover:border-accent/40">
                    <CategoryArt category={cat} size={34} />
                    <span className="text-[13px] font-medium text-ink">{CATEGORY_LABELS[cat]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Before you sign up: the whole contract, in the product rather than in
          the terms. Six questions a first time visitor actually has, as cards
          rather than as one column of prose. */}
      <section aria-labelledby="before-signup-heading" className="max-w-[1080px] mx-auto px-5 sm:px-9 pt-14 sm:pt-20">
        <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-2">Before you sign up</div>
        <h2 id="before-signup-heading" className="font-serif text-[clamp(28px,4vw,44px)] font-bold tracking-[-1.2px] leading-[1.05] mb-4">
          What you are <em className="italic text-gold">actually agreeing to.</em>
        </h2>
        <p className="text-[14px] text-ink-2 leading-[1.7] max-w-[620px] mb-8">{BROWSE_CONTRACT}</p>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 list-none">
          {CONTRACT_QUESTIONS.map(item => {
            const Icon = iconFor(item.q);
            return (
              <li key={item.q} className="bg-card border border-[var(--border)] rounded-2xl p-5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[rgba(47,107,63,0.09)] text-accent mb-3">
                  <Icon size={16} />
                </span>
                <h3 className="font-serif text-[17px] font-bold tracking-tight mb-1.5">{item.q}</h3>
                <p className="text-[13px] text-ink-2 leading-[1.65] font-light">{item.a}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Common questions: real content for visitors, FAQPage data for Google.
          Closed by default, open one at a time, all answers still in the DOM. */}
      <section aria-labelledby="faq-heading" className="max-w-[1080px] mx-auto px-5 sm:px-9 py-14 sm:py-20">
        <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-2">Common questions</div>
        <h2 id="faq-heading" className="font-serif text-[clamp(28px,4vw,44px)] font-bold tracking-[-1.2px] leading-[1.05] mb-6">
          Asked and <em className="italic text-gold">answered.</em>
        </h2>
        <FaqList items={FAQ} />
      </section>

      {/* Structured data for search engines */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Stoop',
          url: 'https://www.stoop.house',
          description: 'A neighborhood noticeboard for plans in NYC and Austin. Post what you are already doing this week; a few neighbors join you.',
          publisher: {
            '@type': 'Organization',
            name: 'Stoop',
            url: 'https://www.stoop.house'
          }
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ.map(item => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a }
          }))
        }}
      />

      {/* CTA */}
      <section className="px-5 sm:px-9 my-14 sm:my-20">
        <div className="max-w-[1080px] mx-auto bg-ink rounded-3xl overflow-hidden grid sm:grid-cols-[1fr,240px] items-center gap-8 sm:gap-10 px-6 sm:px-12 py-10 sm:py-14">
          <div>
            <h2 className="font-serif text-[clamp(26px,6.5vw,46px)] font-bold tracking-[-1.2px] leading-[1.05] text-cream mb-2">
              The best plans are<br /><em className="italic text-[#D4A93C]">three blocks away.</em>
            </h2>
            <p className="text-[14px] text-cream/60 font-light leading-relaxed mb-6">Post yours this week. See which neighbors turn up.</p>
            <Link href="/post" className="btn btn-lg bg-cream text-ink hover:bg-white justify-center w-full sm:w-auto">Post your first plan →</Link>
          </div>
          {/* Same caption as every other photograph on the page, in cream
              because this panel is ink. It reads at 8.2:1 there. */}
          <Photograph
            photo={PHOTOS.coffeeCounter}
            sizes="(max-width: 640px) 88vw, 240px"
            frameClassName="photo-frame-organic aspect-[5/2] sm:aspect-square border-cream/15"
            captionClassName="text-cream/70"
          />
        </div>
      </section>
      </PageMain>

      <Footer />
    </>
  );
}
