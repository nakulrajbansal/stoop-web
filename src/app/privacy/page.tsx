import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy · Stoop',
  description: 'What Stoop collects, why, who can see it, and how to delete it.'
};

/**
 * Written against what the code actually does. Every claim here should be
 * checkable in the repo: the column grants in migration 0003, the admin-only
 * reads of notify_email, the service-role-only push_tokens table (0007), and
 * the cascade delete in /api/account.
 *
 * Apple requires a reachable privacy policy URL for an App Store listing, and
 * the answers in App Store Connect must match this page.
 */
export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <div className="max-w-[680px] mx-auto px-6 py-12">
        <h1 className="font-serif text-[30px] font-bold tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-[12px] text-muted mb-9">Last updated: August 2026</p>

        <div className="border border-[rgba(42,66,50,0.18)] bg-[rgba(42,66,50,0.05)] rounded-[14px] px-5 py-4 mb-9">
          <div className="text-[12px] font-mono uppercase tracking-wider text-sage mb-1.5">The short version</div>
          <p className="text-[15px] text-ink leading-[1.6]">
            Stoop collects what it needs to run a small neighborhood noticeboard and nothing else.
            We do not sell your data, we do not track you across other apps or websites, and there
            are no advertising or analytics SDKs in the iOS app.
          </p>
        </div>

        <div className="flex flex-col gap-7 text-[14px] text-ink leading-[1.7]">
          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">What we collect</h2>
            <ul className="text-muted list-disc pl-5 flex flex-col gap-1.5">
              <li>
                <strong className="text-ink font-medium">Your phone number.</strong> Used to sign you
                in and to keep out bots and throwaway accounts. It is never shown to other members.
              </li>
              <li>
                <strong className="text-ink font-medium">A notification email.</strong> Required,
                because it is how you learn that someone joined your plan or replied. It is never
                shown to other members.
              </li>
              <li>
                <strong className="text-ink font-medium">Your name, neighborhood, and one line
                about you.</strong> These are visible to other signed-in members next to your plans
                and messages.
              </li>
              <li>
                <strong className="text-ink font-medium">A profile photo, if you add one.</strong>{' '}
                Optional, one per person. It is served from a public web address, so anyone holding
                that address can load it without signing in — the same as a photo on a public web
                page. We re-encode every upload on our servers and strip its metadata, including any
                location the camera recorded. You can remove it at any time.
              </li>
              <li>
                <strong className="text-ink font-medium">Your plans and messages.</strong> A plan is
                visible to anyone browsing Stoop. Messages are visible only to the two people in the
                conversation.
              </li>
              <li>
                <strong className="text-ink font-medium">A notification token, on the iOS app
                only.</strong> If you turn on notifications, we store a token for that install so
                Apple can deliver them. It is stored server side only, is never readable by other
                members, and the row is deleted — not just marked inactive — when you sign out, turn
                notifications off, delete your account, or Apple tells us the install is gone. If
                your phone is offline at the moment you sign out, it cannot reach us to say so; it
                remembers what still needs deleting and finishes the job the next time it has a
                connection, even if somebody else has signed in on that phone since.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">What we do not collect</h2>
            <p className="text-muted">
              No location from your device. Stoop never asks iOS for your position, and there is no
              location permission in the app. No contacts. No advertising identifier. No third-party
              analytics or advertising SDK.
            </p>
            <p className="text-muted mt-3">
              The city and neighborhood on your profile are ones you picked from a list, not read
              from your phone. They are still coarse location information about you, and they are
              shown next to your plans, so we declare them that way on the App Store listing rather
              than arguing the point.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Notifications and your lock screen</h2>
            <p className="text-muted">
              Push notifications from Stoop are deliberately generic: they tell you that someone
              wants to join, that there is a reply, or that a plan is confirmed. They never contain
              message text, plan text, names, phone numbers, or email addresses, so nothing private
              appears on a locked phone. Tapping one opens the app, where the content loads over
              your own signed-in session.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Who can see what</h2>
            <p className="text-muted">
              Your name, neighborhood, about line and photo appear next to your plans, and a plan
              page is public — readable by anyone on the web, signed in or not, and indexable by
              search engines. Treat what you put in a plan as public writing. Messages are different:
              only the two people in a conversation can read them.
            </p>
            <p className="text-muted mt-3">
              Nobody can see your phone number or your notification email. Those columns are revoked
              from the public API entirely and are read only by our servers, to send you an alert.
            </p>
            <p className="text-muted mt-3">
              If you block someone, the two of you disappear from each other while signed in, in
              both directions: the feed, plan pages, profiles, conversations, live message
              delivery, and notifications. Neither of you can start a conversation with the other.
              That rule lives in the database itself, not only in the app, so it holds however a
              signed-in account asks for the data.
            </p>
            <p className="text-muted mt-3">
              What a block cannot do is hide a public plan page from someone who is not signed in.
              Plan pages are public so they can be shared, and a signed-out visitor presents no
              account for us to recognise. So blocking is about what an account can reach, and what
              you put in a plan stays public writing.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Who we share it with</h2>
            <p className="text-muted">
              Only the services that make Stoop work: Supabase (database and sign-in), Twilio (the
              verification text), Resend (notification email), Vercel (hosting), and Expo (delivering
              iOS notifications). Each one sees only what it needs to do its job. We do not sell
              personal information and we do not share it for advertising.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Moderation</h2>
            <p className="text-muted">
              Plans, messages, and the name and about line on your profile are checked against a
              blocklist of slurs, explicit solicitation and direct threats before they are saved.
              That check runs in our database, so it applies however the text was sent. It is a
              blocklist, not a judgment: it will not catch everything, and it is deliberately narrow
              so that ordinary posts are not rejected. Reporting is what catches the rest, and a
              person reviews every report within 24 hours.
            </p>
            <p className="text-muted mt-3">
              Profile photos are re-encoded and stripped of metadata, and are size- and
              dimension-limited, but their <em>content</em> is not automatically classified. A photo
              that should not be on Stoop is handled through reporting, like anything else.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">How long we keep it</h2>
            <p className="text-muted">
              Plans expire at the end of the day they are scheduled for and stop appearing. Your
              account data stays until you delete it. Reports and the record of a suspension are
              kept while they are needed for safety review.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Deleting your account</h2>
            <p className="text-muted">
              You can delete your account from the app or the website (Profile, then Delete account).
              It is immediate and permanent: your profile, plans, conversations, messages, photo, and
              notification tokens are removed. There is no waiting period and you do not have to
              email anyone. Your photo lives in public file storage rather than in the database, so
              it is deleted first and the rest only goes ahead once that has worked. If it cannot,
              nothing is deleted and you are asked to try again — we would rather you retry than have
              a photo of you outlive the account it belonged to.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Children</h2>
            <p className="text-muted">
              Stoop is for people 18 and over. We do not knowingly collect information from anyone
              younger. If you believe a minor has an account, email us and we will remove it.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold mb-1.5">Changes and contact</h2>
            <p className="text-muted">
              We will update the date above if this changes. Questions, or a request to see or delete
              your data? Email{' '}
              <a href="mailto:hi@stoop.house" className="text-accent underline underline-offset-2">
                hi@stoop.house
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-[var(--border)] flex items-center gap-5">
          <Link href="/terms" className="text-[13px] text-muted hover:text-ink">
            Terms &amp; Community Standard
          </Link>
          <Link href="/support" className="text-[13px] text-muted hover:text-ink">
            Support
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
