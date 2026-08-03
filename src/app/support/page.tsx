import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support · Stoop',
  description: 'How to reach a person at Stoop, and how to report or block someone.'
};

const SUPPORT_EMAIL = 'hi@stoop.house';

/**
 * The App Store listing needs a support URL, and Apple checks that the page
 * actually offers a way to get help rather than being a marketing page with a
 * link somewhere on it. The email address is in the body copy, above the fold,
 * as a mailto link.
 *
 * Nothing on this page promises a response time the product cannot keep. The
 * 24-hour commitment is specifically about report review, which is what the
 * Community Standard already commits to.
 */
export default function SupportPage() {
  return (
    <>
      <Nav />
      <div className="max-w-[680px] mx-auto px-6 py-12">
        <h1 className="font-serif text-[30px] font-bold tracking-tight mb-2">Support</h1>
        <p className="text-[12px] text-muted mb-9">Stoop · New York City and Austin</p>

        <div className="border border-[rgba(42,66,50,0.18)] bg-[rgba(42,66,50,0.05)] rounded-[14px] px-5 py-4 mb-9">
          <div className="text-[12px] font-mono uppercase tracking-wider text-sage mb-1.5">Contact</div>
          <p className="text-[15px] text-ink leading-[1.6]">
            Email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>
            . A person reads it. Include your phone number if you are writing about your account, so
            we can find it.
          </p>
        </div>

        <div className="flex flex-col gap-7 text-[14px] text-ink leading-[1.7]">
          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Reporting someone</h2>
            <p className="text-muted">
              You do not need to email us to report someone. In the app, open their plan or your
              conversation and use <strong className="text-ink font-medium">Report or block</strong>.
              Reporting is private, the other person is never told who reported them, and blocking is
              silent and works in both directions immediately. A person reviews every report within
              24 hours and can warn or suspend an account.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Blocking someone</h2>
            <p className="text-muted">
              Blocking is one tap and takes effect at once. While either of you is signed in, you
              disappear from each other: the feed, plan pages, profiles, conversations, and
              notifications, in both directions, and neither of you can start a new conversation.
              The rule is enforced by our database, not just the app. It does not hide a public plan
              page from someone who is not signed in — plan pages are public so plans can be shared,
              and a signed-out visitor has no account for us to recognise. It is permanent unless
              you unblock them.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Deleting your account</h2>
            <p className="text-muted">
              In the app: <strong className="text-ink font-medium">Profile → Delete account</strong>.
              It is immediate and permanent, with no waiting period and nobody to email. Your profile,
              plans, conversations, messages, photo, and notification tokens go with it. It is all or
              nothing: if any part of it cannot be done right then, we tell you and delete nothing, so
              you can try again rather than being left half-deleted.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Something is broken</h2>
            <p className="text-muted">
              Email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent underline underline-offset-2">
                {SUPPORT_EMAIL}
              </a>{' '}
              with what you were doing and what happened. A screenshot helps. If you can, say which
              iPhone and which iOS version.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Who Stoop is for</h2>
            <p className="text-muted">
              Stoop is for adults, 18 and over. It is a noticeboard for small plans in your
              neighborhood — a coffee, a walk, a show — not a dating app and not a place to sell
              things. The{' '}
              <Link href="/terms" className="text-accent underline underline-offset-2">
                Community Standard
              </Link>{' '}
              is short and worth reading.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-[var(--border)] flex items-center gap-5">
          <Link href="/terms" className="text-[13px] text-muted hover:text-ink">
            Terms &amp; Community Standard
          </Link>
          <Link href="/privacy" className="text-[13px] text-muted hover:text-ink">
            Privacy
          </Link>
          <Link href="/feed" className="text-[13px] text-muted hover:text-ink">
            Back to Stoop
          </Link>
        </div>
      </div>
      <Footer />
    </>
  );
}
