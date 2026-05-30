import Link from 'next/link';
import Nav from '@/components/Nav';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms & Community Standard · Stoop',
  description: 'How Stoop works, what we expect, and how we keep people safe.'
};

export default function TermsPage() {
  return (
    <>
      <Nav />
      <div className="max-w-[680px] mx-auto px-6 py-12">
        <h1 className="font-serif text-[30px] font-bold tracking-tight mb-2">Terms &amp; Community Standard</h1>
        <p className="text-[12px] text-muted mb-9">Last updated: May 2026</p>

        {/* Community Standard — the heart of it, kept to one line */}
        <div className="border border-[rgba(42,66,50,0.18)] bg-[rgba(42,66,50,0.05)] rounded-[14px] px-5 py-4 mb-9">
          <div className="text-[12px] font-mono uppercase tracking-wider text-sage mb-1.5">Community Standard</div>
          <p className="text-[15px] text-ink leading-[1.6]">
            Stoop is for genuine plans between real people. Harassment, solicitation, and unsafe
            behavior get you removed.
          </p>
        </div>

        <div className="flex flex-col gap-7 text-[14px] text-ink leading-[1.7]">
          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">What Stoop is</h2>
            <p className="text-muted">
              Stoop helps neighbors meet up around real plans (a coffee, a run, a show). You post
              something you're already doing, and a few people can join. There are no profiles to
              browse and no algorithm. We're a small platform that makes introductions; the plans
              themselves are yours.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Who can use it</h2>
            <p className="text-muted">
              You must be 18 or older and use a real mobile number and a name people would recognize.
              One account per person. Don't impersonate anyone.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">How to behave</h2>
            <p className="text-muted">
              Post plans you actually intend to keep. Be respectful in messages. No harassment,
              threats, hate, sexual solicitation, spam, scams, or commercial promotion. Don't use
              Stoop to sell things or push a business. If you say you'll show up, show up; if plans
              change, let the other person know.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Meeting in person</h2>
            <p className="text-muted">
              Use your judgment. Meet in public, tell a friend where you're going, and trust your
              gut. You can cancel any plan at any time, for any reason. Stoop does not run background
              checks or verify identities beyond a phone number, and we aren't responsible for what
              happens when people meet offline.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Blocking and reporting</h2>
            <p className="text-muted">
              You can block anyone at any time; it's silent and it's mutual (you each disappear from
              the other's experience). You can also report someone. We review every report within
              24 hours and can warn, suspend, or remove accounts. Reports are private; the person
              you report is not told who reported them.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Suspension and removal</h2>
            <p className="text-muted">
              Breaking the Community Standard can get your account suspended or removed, which ends
              your access to sign in, post, and message, and hides your plans. We may act without
              notice when someone's safety is at stake.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Email</h2>
            <p className="text-muted">
              A notification email is required so you find out when someone joins your plan or
              replies. We use it only for that and for the occasional important notice, not for
              marketing lists.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Changes and contact</h2>
            <p className="text-muted">
              We may update these terms as Stoop grows; we'll change the date above when we do.
              Questions, or something feels off? Email{' '}
              <a href="mailto:hi@stoop.house" className="text-accent underline underline-offset-2">hi@stoop.house</a>.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-[var(--border)]">
          <Link href="/feed" className="text-[13px] text-muted hover:text-ink">← Back to Stoop</Link>
        </div>
      </div>
    </>
  );
}
