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

/**
 * Trim to a whole word.
 * A hard slice ended a board row on "before the market gets busy, c…", which
 * reads as a rendering fault rather than as an excerpt.
 */
function excerpt(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const kept = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return kept.replace(/[\s,.;:]+$/, '') + '…';
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
      {/* ── Masthead ──────────────────────────────────────────────────────
          A band of photograph under the nameplate, the way a local paper
          carries one, fading into the paper instead of sitting in a frame.
          Decorative: everything it could say, the headline under it says
          better. Short on a phone on purpose, so the promise and the action
          below it are both inside the first screen at 320 x 568. */}
      <Photograph
        photo={PHOTOS.sidewalkTable}
        priority
        sizes="100vw"
        className="photo-fade-b h-[104px] sm:h-[188px]"
      />

      {/* ── Hero ──────────────────────────────────────────────────────────
          The promise, then one action, then the board itself. On a phone this
          is the whole page's argument in two screens; from sm the board moves
          alongside. */}
      <section className="gut max-w-[1080px] mx-auto pt-4 sm:pt-9 pb-7 sm:pb-14">
        <div className="grid sm:grid-cols-[1.05fr,1fr] gap-8 sm:gap-14 items-start">
          <div>
            <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[10.5px] font-mono uppercase tracking-[0.1em] text-accent mb-3">
              <span aria-hidden="true" className="w-5 h-px bg-accent"></span>
              <span>Week of {week}</span>
              <span aria-hidden="true" className="opacity-40">·</span>
              <span>NYC + Austin</span>
            </div>

            {/* 38px at 320px, where the old clamp's 42px floor left "profiles."
                filling the column edge to edge. */}
            <h1 className="font-serif text-[38px] sm:text-[clamp(52px,7vw,88px)] font-bold leading-[0.94] tracking-[-1.2px] sm:tracking-[-3px] mb-3.5 sm:mb-6">
              Plans,<br />not <em className="italic text-gold">profiles.</em>
            </h1>

            <p className="text-[15.5px] sm:text-[17px] text-ink-2 leading-[1.5] font-light mb-5 sm:mb-7 max-w-[430px]">
              Post what you&apos;re already doing this week.{' '}
              <strong className="text-ink font-medium">A few neighbors join you.</strong>
            </p>

            {/* One dominant action, full width where the thumb is. Browsing sits
                directly under it rather than competing at the same weight. */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <Link href="/post" className="btn btn-accent btn-lg justify-center">
                {planCount > 0 ? 'Post a plan →' : 'Post the first plan →'}
              </Link>
              <Link href="/feed" className="btn btn-ghost btn-lg justify-center">
                {planCount > 0 ? `Browse ${planCount} ${planCount === 1 ? 'plan' : 'plans'}` : 'Browse'}
              </Link>
            </div>
            <p className="text-[11.5px] text-muted leading-[1.5] mt-3.5 max-w-[430px]">
              {openPlanCount(openPlans)} across both cities. Free to browse; an account is only for posting
              or messaging.
            </p>
          </div>

          {/* The board. The plans are the product, so they are the second thing
              on the page rather than the fifth. */}
          <div className="rise rise-1">
            <div className="flex items-baseline justify-between gap-3 pb-2 mb-1 border-b border-ink/15">
              <h2 className="text-[10.5px] font-mono uppercase tracking-[0.1em] text-ink-2">On the board</h2>
              {planCount > 0 && totalSpots > 0 && (
                <span className="text-[10.5px] font-mono uppercase tracking-[0.1em] text-muted">{totalSpots} open</span>
              )}
            </div>

            {!plans || plans.length === 0 ? (
              <div className="pt-3">
                {/* Empty week: show what a plan looks like instead of a void */}
                <div className="border border-dashed border-[var(--border2)] rounded-xl px-3.5 py-3.5 mb-3.5 flex items-start gap-3">
                  <CategoryArt category="coffee" size={34} className="mt-0.5" />
                  <div className="min-w-0">
                    {/* Labelled Sample for the same reason the feed's are: it is
                        an illustration, and it is not in any count on this page. */}
                    <div className="text-[10px] font-mono uppercase tracking-[0.1em] text-muted mb-1">
                      Sample · what a plan looks like
                    </div>
                    <div className="font-serif text-[14.5px] font-bold text-ink leading-snug mb-1 opacity-70">
                      going to the farmers market saturday morning, making coffee after…
                    </div>
                    <div className="text-[11px] text-muted">
                      Saturday, 9am
                      <span className="opacity-40 mx-1">·</span>
                      2 spots
                      <span className="opacity-40 mx-1">·</span>
                      your neighborhood
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 mb-3.5">
                  <EmptyBoardArt width={50} className="text-muted flex-shrink-0 mt-0.5" />
                  <p className="text-[12.5px] text-muted leading-[1.55]">
                    {emptyNeighborhoodCopy()}{' '}
                    <span className="text-gold-2">First 50 hosts become Founding members.</span>
                  </p>
                </div>
                <Link href="/post" className="btn btn-accent btn-sm">Post a plan →</Link>
              </div>
            ) : (
              <div className="flex flex-col">
                {plans.map((plan: any) => (
                  <Link key={plan.id} href={`/plan/${plan.slug}`}
                    className="group flex items-start gap-3 py-3 border-b border-[var(--border)] hover:bg-cream-2/60 -mx-2.5 px-2.5 rounded-md transition-colors">
                    {/* The one surface where the category is not written out:
                        these rows have no room for the word the feed shows,
                        so the drawing carries an accessible name instead and
                        the link reads "Coffee, going to the farmers market…".
                        A category we no longer draw names itself nothing, and
                        the plan text still says what it is. */}
                    <CategoryArt
                      category={plan.category}
                      size={34}
                      className="mt-0.5"
                      label={categoryLabelOf(plan.category) ?? undefined}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-serif text-[14.5px] font-bold text-ink leading-snug mb-0.5">
                        {excerpt(plan.text, 52)}
                      </div>
                      <div className="text-[11px] text-muted flex items-center flex-wrap gap-y-0.5">
                        <Avatar
                          userId={plan.user_id}
                          name={firstNameOf(plan.poster?.name)}
                          initials={plan.poster?.initials}
                          bg={plan.poster?.avatar_bg}
                          fg={plan.poster?.avatar_fg}
                          size={16}
                          radius={5}
                          className="mr-1.5"
                        />
                        {firstNameOf(plan.poster?.name)}
                        <span aria-hidden="true" className="opacity-40 mx-1">·</span>
                        {plan.when_day}
                        {plan.when_time_specific && `, ${plan.when_time_specific}`}
                        {!plan.when_time_specific && plan.when_time && `, ${plan.when_time.toLowerCase()}`}
                        <span aria-hidden="true" className="opacity-40 mx-1">·</span>
                        {plan.neighborhood?.name}
                        {/* Capacity rides in the meta line on a phone. As its
                            own right-hand column it took 60px of a 284px row,
                            which pushed every title to a third line. */}
                        <span className="inline-flex items-center whitespace-nowrap sm:hidden">
                          <span aria-hidden="true" className="opacity-40 mx-1">·</span>
                          {plan.status === 'full' || plan.spots_left === 0
                            ? <span className="text-muted">Full</span>
                            : <span className="text-accent font-medium">{plan.spots_left} open</span>}
                        </span>
                      </div>
                    </div>
                    <div className="text-[10.5px] font-medium whitespace-nowrap mt-1 hidden sm:block">
                      {plan.status === 'full' || plan.spots_left === 0 ? (
                        <span className="text-muted">Full ✓</span>
                      ) : (
                        <span className="text-accent">{plan.spots_left} open →</span>
                      )}
                    </div>
                  </Link>
                ))}
                <Link href="/feed" className="text-[12px] text-accent font-medium pt-3 hover:underline">
                  See every plan →
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────
          The sequence as a list you can run your eye down, one drawing per
          step doing the scanning work. v1 gave each step a card with a 112px
          drawing in its own header band, which was four full screens on a
          phone to say four sentences. Every fact the short lines leave out is
          stated in the section below this one. */}
      <section aria-labelledby="how-it-works-heading" className="bg-cream-2 border-y border-[var(--border)] sec">
        <div className="gut max-w-[1080px] mx-auto">
          <h2 id="how-it-works-heading" className="font-serif h-sec font-bold mb-1">
            Four steps, and <em className="italic text-gold">no guessing.</em>
          </h2>
          <p className="text-[12.5px] text-muted mb-4 sm:mb-8">Nothing here asks for an account until step two.</p>

          <ol className="rows rows-flat-sm sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-x-8 sm:gap-y-7 list-none">
            {CONTRACT_STEPS.map((step, i) => {
              const Art = STEP_ART[i];
              return (
                <li key={step.n} className="flex items-start gap-3.5 py-3.5 sm:block sm:py-0">
                  {/* One element, two sizes: the width attribute is what the
                      drawing is authored at and the class overrides it from sm,
                      so the desktop version is not a second copy in the DOM. */}
                  <Art width={40} className="text-accent flex-shrink-0 mt-0.5 w-[40px] sm:w-[92px] sm:mt-0 sm:mb-3" />
                  <div className="min-w-0">
                    <h3 className="font-serif text-[15px] sm:text-[18px] font-bold tracking-tight mb-0.5 sm:mb-1">
                      <span className="font-mono text-[10.5px] tracking-[0.08em] text-[rgba(47,107,63,0.9)] mr-1.5">{step.n}</span>
                      {step.title}
                    </h3>
                    <p className="text-[12.5px] sm:text-[13px] text-ink-2 leading-[1.55] font-light">{step.short}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ── What people post ──────────────────────────────────────────────
          Seven ways into the feed. The drawings are the scanning surface here:
          two columns of picture-plus-word is faster to read at 320px than
          seven lines of text. */}
      <section aria-labelledby="categories-heading" className="gut max-w-[1080px] mx-auto sec-tight sm:sec">
        <h2 id="categories-heading" className="font-serif h-sec font-bold mb-1">What people post</h2>
        <p className="text-[12.5px] sm:text-[13.5px] text-ink-2 leading-[1.55] font-light mb-4 sm:mb-6 max-w-[460px]">
          Something you were doing anyway, with room for a few neighbors. Pick a kind to see what is on the
          board this week.
        </p>
        <ul className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 sm:gap-2.5 list-none">
          {CATEGORIES.map(cat => (
            <li key={cat}>
              <Link href={`/feed?category=${cat}`}
                className="lift flex sm:flex-col items-center sm:items-start gap-2 sm:gap-2 bg-card border border-[var(--border)] rounded-xl px-2.5 py-2 sm:px-3.5 sm:py-3.5 hover:border-accent/40">
                <CategoryArt category={cat} size={30} />
                <span className="text-[12.5px] font-medium text-ink">{CATEGORY_LABELS[cat]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Before you sign up ────────────────────────────────────────────
          The whole contract, in the product rather than in the terms. Six
          questions a first time visitor actually has, as hairline rows: as six
          bordered cards in a 284px column they read as a component gallery,
          and the answers are what matter. */}
      <section aria-labelledby="before-signup-heading" className="bg-cream-2 border-y border-[var(--border)] sec">
        <div className="gut max-w-[1080px] mx-auto">
          <h2 id="before-signup-heading" className="font-serif h-sec font-bold mb-2">
            What you are <em className="italic text-gold">actually agreeing to.</em>
          </h2>
          <p className="text-[12.5px] sm:text-[14px] text-ink-2 leading-[1.6] max-w-[600px] mb-4 sm:mb-8">{BROWSE_CONTRACT}</p>
          <ul className="rows rows-flat-sm sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-x-10 sm:gap-y-7 list-none">
            {CONTRACT_QUESTIONS.map(item => {
              const Icon = iconFor(item.q);
              return (
                <li key={item.q} className="py-3.5 sm:py-0">
                  <h3 className="flex items-start gap-2 font-serif text-[14.5px] sm:text-[16.5px] font-bold tracking-tight mb-1">
                    <Icon size={14} className="text-accent flex-shrink-0 mt-[3px]" />
                    <span className="min-w-0">{item.q}</span>
                  </h3>
                  {/* Flush left on a phone: the 22px the mark costs is 8% of a
                      284px column, and it buys a line back on every long
                      answer. Indented from sm, where the width is free. */}
                  <p className="text-[12.5px] sm:text-[13px] text-ink-2 leading-[1.6] font-light sm:pl-[22px]">{item.a}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── Common questions ──────────────────────────────────────────────
          Real content for visitors, FAQPage data for Google. Closed by
          default, open one at a time, all answers still in the DOM. */}
      <section aria-labelledby="faq-heading" className="gut max-w-[1080px] mx-auto sec">
        <h2 id="faq-heading" className="font-serif h-sec font-bold mb-2 sm:mb-4">
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

      {/* ── Closing ───────────────────────────────────────────────────────
          The second photograph is a layer inside this panel, bleeding to its
          edges and fading into the ink, rather than a tile sitting on it. A
          path going somewhere, next to a line about somewhere three blocks
          away; nobody is in it and it claims nothing. */}
      <section className="gut max-w-[1080px] mx-auto pb-8 sm:pb-12">
        <div className="relative overflow-hidden bg-ink rounded-[22px] sm:rounded-3xl">
          <Photograph
            photo={PHOTOS.parkPath}
            sizes="(max-width: 640px) 100vw, 460px"
            className="photo-layer photo-fade-panel"
          />
          <div className="relative px-5 sm:px-11 pt-8 sm:pt-14 pb-[120px] sm:pb-14 sm:w-[60%]">
            <h2 className="font-serif text-[26px] sm:text-[clamp(30px,3.4vw,44px)] font-bold tracking-[-0.8px] leading-[1.05] text-cream mb-2">
              The best plans are<br /><em className="italic text-[#D4A93C]">three blocks away.</em>
            </h2>
            <p className="text-[13px] text-cream/70 font-light leading-relaxed mb-5">
              Post yours this week. See which neighbors turn up.
            </p>
            <Link href="/post" className="btn btn-lg bg-cream text-ink hover:bg-white justify-center w-full sm:w-auto">
              Post your first plan →
            </Link>
          </div>
        </div>
      </section>
      </PageMain>

      <Footer />
    </>
  );
}
