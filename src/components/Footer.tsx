import Link from 'next/link';

// Shared site footer. Every public page ends with this instead of stopping
// abruptly; grouped columns instead of one cramped row of links.
//
// Three columns side by side on a phone rather than stacked. Stacked, with the
// brand line above them, this ran to 490px at 320px, which was an eighth of the
// homepage spent on boilerplate. Every link is still here and still a 30px tap
// row; only the air between them is gone.
export default function Footer() {
  return (
    <footer className="border-t border-[var(--border)] mt-8 sm:mt-12">
      <div className="max-w-[1080px] mx-auto gut py-7 sm:py-10">
        <div className="flex flex-wrap justify-between gap-x-8 sm:gap-x-12 gap-y-6">
          <div className="w-full sm:w-auto sm:max-w-[240px]">
            <div className="font-serif text-[17px] sm:text-[19px] font-bold mb-1">
              St<em className="not-italic italic text-accent">oo</em>p
            </div>
            <p className="text-[11.5px] sm:text-[12px] text-muted leading-[1.5]">
              Plans, not profiles. Post what you&apos;re already doing this week; a few neighbors join you.
            </p>
          </div>
          <div className="flex flex-1 flex-wrap justify-between sm:justify-start gap-x-6 sm:gap-x-14 gap-y-6">
            <div>
              <div className="text-[10px] sm:text-[10.5px] font-mono uppercase tracking-[0.1em] text-muted mb-2 sm:mb-3">Stoop</div>
              <div className="flex flex-col gap-0.5 sm:gap-1">
                <Link href="/feed" className="text-[12px] sm:text-[12.5px] text-ink-2 hover:text-ink py-1">Browse plans</Link>
                <Link href="/post" className="text-[12px] sm:text-[12.5px] text-ink-2 hover:text-ink py-1">Post a plan</Link>
                <Link href="/terms" className="text-[12px] sm:text-[12.5px] text-ink-2 hover:text-ink py-1">Terms</Link>
              </div>
            </div>
            <div>
              <div className="text-[10px] sm:text-[10.5px] font-mono uppercase tracking-[0.1em] text-muted mb-2 sm:mb-3">Cities</div>
              <div className="flex flex-col gap-0.5 sm:gap-1">
                <Link href="/nyc" className="text-[12px] sm:text-[12.5px] text-ink-2 hover:text-ink py-1">New York</Link>
                <Link href="/austin" className="text-[12px] sm:text-[12.5px] text-ink-2 hover:text-ink py-1">Austin</Link>
              </div>
            </div>
            <div>
              <div className="text-[10px] sm:text-[10.5px] font-mono uppercase tracking-[0.1em] text-muted mb-2 sm:mb-3">Guides</div>
              <div className="flex flex-col gap-0.5 sm:gap-1">
                <Link href="/guides/how-to-make-friends-in-nyc" className="text-[12px] sm:text-[12.5px] text-ink-2 hover:text-ink py-1">Friends in NYC</Link>
                <Link href="/guides/how-to-make-friends-in-austin" className="text-[12px] sm:text-[12.5px] text-ink-2 hover:text-ink py-1">Friends in Austin</Link>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-[var(--border)] mt-6 sm:mt-9 pt-4 sm:pt-5 flex items-center justify-between flex-wrap gap-x-4 gap-y-1">
          <div className="text-[10.5px] sm:text-[11px] text-muted">NYC + Austin · 2026</div>
          <div className="text-[10.5px] sm:text-[11px] text-muted">Free to browse. Phone-verified members.</div>
        </div>
      </div>
    </footer>
  );
}
