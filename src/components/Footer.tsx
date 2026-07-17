import Link from 'next/link';

// Shared site footer. Every public page ends with this instead of stopping
// abruptly; grouped columns instead of one cramped row of links.
export default function Footer() {
  return (
    <footer className="border-t border-[var(--border)] mt-16">
      <div className="max-w-[1080px] mx-auto px-6 sm:px-9 py-10">
        <div className="flex flex-wrap justify-between gap-x-12 gap-y-8">
          <div className="max-w-[240px]">
            <div className="font-serif text-[19px] font-bold mb-1.5">
              St<em className="not-italic italic text-accent">oo</em>p
            </div>
            <p className="text-[12px] text-muted leading-relaxed">
              Plans, not profiles. Post what you&apos;re already doing this week; a few neighbors join you.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-14 gap-y-8">
            <div>
              <div className="text-[10.5px] font-mono uppercase tracking-[0.1em] text-muted mb-3">Stoop</div>
              <div className="flex flex-col gap-2">
                <Link href="/feed" className="text-[12.5px] text-ink-2 hover:text-ink">Browse plans</Link>
                <Link href="/post" className="text-[12.5px] text-ink-2 hover:text-ink">Post a plan</Link>
                <Link href="/terms" className="text-[12.5px] text-ink-2 hover:text-ink">Terms</Link>
              </div>
            </div>
            <div>
              <div className="text-[10.5px] font-mono uppercase tracking-[0.1em] text-muted mb-3">Cities</div>
              <div className="flex flex-col gap-2">
                <Link href="/nyc" className="text-[12.5px] text-ink-2 hover:text-ink">New York</Link>
                <Link href="/austin" className="text-[12.5px] text-ink-2 hover:text-ink">Austin</Link>
              </div>
            </div>
            <div>
              <div className="text-[10.5px] font-mono uppercase tracking-[0.1em] text-muted mb-3">Guides</div>
              <div className="flex flex-col gap-2">
                <Link href="/guides/how-to-make-friends-in-nyc" className="text-[12.5px] text-ink-2 hover:text-ink">Making friends in NYC</Link>
                <Link href="/guides/how-to-make-friends-in-austin" className="text-[12.5px] text-ink-2 hover:text-ink">Making friends in Austin</Link>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-[var(--border)] mt-9 pt-5 flex items-center justify-between flex-wrap gap-2">
          <div className="text-[11px] text-muted">NYC + Austin · 2026</div>
          <div className="text-[11px] text-muted">Free to browse. Phone-verified members.</div>
        </div>
      </div>
    </footer>
  );
}
