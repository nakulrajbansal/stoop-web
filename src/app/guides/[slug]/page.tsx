import { notFound } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import type { Metadata } from 'next';

// Evergreen guide pages: the honest, useful version of SEO content. Each one
// targets "how to make friends in {city}" searches and hands the reader a
// concrete path that ends, naturally, at posting a plan.
export const revalidate = 86400;

type Guide = {
  citySlug: string;
  cityName: string;
  cityShort: string;
  title: string;
  description: string;
  intro: string;
  spots: string;
};

const GUIDES: Record<string, Guide> = {
  'how-to-make-friends-in-nyc': {
    citySlug: 'nyc',
    cityName: 'New York City',
    cityShort: 'New York',
    title: 'How to make friends in NYC as an adult (without it feeling like work)',
    description:
      'A practical, low-pressure guide to making friends in New York City as an adult: why proximity beats apps, what actually works, and how to start with one small plan this week.',
    intro:
      'New York has more people per block than almost anywhere in America, and it is still one of the easiest places in the world to feel alone. Everyone is busy, everyone assumes everyone else already has their people, and most tools for meeting someone new are built like shopping. The fix is not more browsing. It is smaller: one real plan, close to home, with one to three people who said yes to the plan itself.',
    spots:
      'a bagel place before work, a loop in Prospect Park or along the East River, a bookstore wander, a gallery you keep meaning to visit, pickup at the courts, a show at a small venue'
  },
  'how-to-make-friends-in-austin': {
    citySlug: 'austin',
    cityName: 'Austin',
    cityShort: 'Austin',
    title: 'How to make friends in Austin as an adult (the low-pressure way)',
    description:
      'A practical guide to making friends in Austin as an adult: why neighborhood beats networking, what actually works after the college years, and how to start with one small plan this week.',
    intro:
      'Austin is famously friendly and famously transient, which is a strange combination: people will talk to you anywhere, and then everyone moves or gets busy. Most advice says join more things. The advice that works is smaller: one real plan, close to home, with one to three people who said yes to the plan itself, not to a networking event.',
    spots:
      'breakfast tacos before work, a walk around the lake, a record store or bookstore wander, pickleball, a swim at the springs, a show on a weeknight'
  }
};

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return Object.keys(GUIDES).map(slug => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const guide = GUIDES[slug];
  if (!guide) return { title: 'Not found · Stoop' };
  return {
    title: `${guide.title} · Stoop`,
    description: guide.description,
    alternates: { canonical: `https://www.stoop.house/guides/${slug}` },
    openGraph: { title: guide.title, description: guide.description, type: 'article' }
  };
}

export default async function GuidePage({ params }: { params: Params }) {
  const { slug } = await params;
  const guide = GUIDES[slug];
  if (!guide) notFound();

  const sections = [
    {
      h: 'Why apps and big events keep not working',
      p: `Friend apps borrow the shape of dating apps: browse people, judge from a profile, hope the chemistry survives the ${guide.cityShort} scheduling gauntlet. Big events and mixers have the opposite problem, forty strangers and no reason to talk to any particular one of them. Both put the relationship before the activity. Real friendships in ${guide.cityName} almost always form the other way around: you do a thing together, repeatedly, and the friendship sneaks in sideways.`
    },
    {
      h: 'Proximity is the whole secret',
      p: `The research on friendship is embarrassingly consistent: the strongest predictor is not shared interests, it is repeated, low-effort contact. In ${guide.cityName} terms, someone twenty minutes away might as well be in another city. Someone three blocks away can join your Tuesday coffee. When you optimize for close-by instead of perfect-match, the follow-up hangout stops being a logistics project, and follow-up is where acquaintances become friends.`
    },
    {
      h: 'Start with what you already do',
      p: `You do not need new hobbies. You need company for the life you already have: ${guide.spots}. Take one thing from your normal week, give it a specific time and place, and make it joinable. The plan costs you nothing because you were going anyway, and that removes the desperation that makes meeting people feel like work.`
    },
    {
      h: 'Keep the group tiny',
      p: 'Two to four people, total. In a big group you can spend two hours and leave without a single real conversation. With two or three others, everyone talks to everyone, names stick, and there is an obvious next step ("same time next week?"). Small also means low stakes: if it is merely fine, you lost an hour you were going to spend on that coffee anyway.'
    },
    {
      h: 'How Stoop fits',
      p: `Stoop is a neighborhood noticeboard for exactly this. You post the plan you were already doing this week, in your own words, and up to three phone-verified neighbors can message to join. No profiles to browse, no swiping, no tickets. It is free, it works neighborhood by neighborhood across ${guide.cityName}, and the first plan takes about two minutes to post.`
    }
  ];

  return (
    <>
      <Nav />
      <article className="max-w-[720px] mx-auto px-6 py-12">
        <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.1em] text-accent mb-5">
          <span className="w-6 h-px bg-accent"></span>
          <span>Guide</span>
          <span className="opacity-40">·</span>
          <Link href={`/${guide.citySlug}`} className="hover:underline">{guide.cityName}</Link>
        </div>

        <h1 className="font-serif text-[clamp(30px,4.5vw,44px)] font-bold tracking-[-1.2px] leading-[1.1] mb-6">
          {guide.title}
        </h1>

        <p className="text-[15.5px] text-ink-2 leading-[1.75] font-light mb-10">{guide.intro}</p>

        {sections.map(s => (
          <section key={s.h} className="mb-8">
            <h2 className="font-serif text-[22px] font-bold tracking-tight mb-2.5">{s.h}</h2>
            <p className="text-[14px] text-ink-2 leading-[1.75] font-light">{s.p}</p>
          </section>
        ))}

        <div className="bg-cream-2 border border-[var(--border)] rounded-2xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap mt-10">
          <div>
            <div className="font-serif text-[17px] font-bold text-ink mb-0.5">Try it this week</div>
            <div className="text-[12.5px] text-muted">
              See what neighbors in <Link href={`/${guide.citySlug}`} className="underline underline-offset-2 hover:text-ink">{guide.cityName}</Link> are up to, or post your own plan.
            </div>
          </div>
          <Link href="/post" className="btn btn-accent btn-sm">Post a plan →</Link>
        </div>
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: guide.title,
            description: guide.description,
            author: { '@type': 'Organization', name: 'Stoop', url: 'https://www.stoop.house' },
            publisher: { '@type': 'Organization', name: 'Stoop', url: 'https://www.stoop.house' },
            mainEntityOfPage: `https://www.stoop.house/guides/${slug}`
          })
        }}
      />
    </>
  );
}
