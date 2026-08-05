import Link from 'next/link';
import Nav from '@/components/Nav';
import PageMain from '@/components/PageMain';

// Rendered for any unmatched URL, and for notFound() from /plan/[slug] (a plan
// that was removed, or one the viewer is blocked from). It says only what is
// true of both cases: the address did not resolve.
export const metadata = { title: 'Page not found · Stoop' };

export default function NotFound() {
  return (
    <>
      <Nav />
      <PageMain className="max-w-[560px] mx-auto px-6 py-20 text-center">
        <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-2">Not found</div>
        <h1 className="font-serif text-[clamp(30px,9vw,44px)] font-bold tracking-tight mb-3">
          Nothing at this <em className="italic text-gold">address.</em>
        </h1>
        <p className="text-[14px] text-ink-2 leading-relaxed mb-7">
          The page you asked for is not here. A plan that has been taken down leaves
          this page behind too.
        </p>
        <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
          <Link href="/feed" className="btn btn-accent justify-center">Browse this week&apos;s plans</Link>
          <Link href="/post" className="btn btn-ghost justify-center">Post a plan</Link>
        </div>
        <p className="text-[12.5px] text-muted mt-7 leading-[1.7]">
          Or go back to the <Link href="/" className="underline underline-offset-2 hover:text-ink">front page</Link>,
          or read the <Link href="/terms" className="underline underline-offset-2 hover:text-ink">Community Standard &amp; Terms</Link>.
        </p>
      </PageMain>
    </>
  );
}
