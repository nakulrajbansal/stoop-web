/**
 * The common questions, as native disclosures.
 *
 * Eight answers stacked open is a wall of text nobody reads; eight questions a
 * visitor can open one at a time is a page they can scan. This uses
 * details/summary rather than a JavaScript accordion, which buys three things
 * we would otherwise have to build and could get wrong: keyboard and screen
 * reader behaviour for free, in-page find that opens the match, and answers
 * that are in the DOM whether or not they are on screen, so the FAQPage
 * structured data on the homepage still describes what is actually there.
 *
 * The heading, and why it is where it is. The question is an h3 inside the
 * summary. That is not perfect and the alternatives are worse:
 *
 *   * A summary maps to a button, and ARIA says a button's children are
 *     presentational, so some browsers drop this h3 from the heading outline.
 *     Firefox exposes it; Chrome and Safari have both gone either way. The
 *     accessible name is computed from the text regardless, so the summary
 *     always announces the whole question and always operates from the
 *     keyboard. What varies is only whether the question also appears in a
 *     screen reader's list of headings.
 *   * Wrapping the details in the h3 puts the answer inside the heading.
 *     Putting the h3 around the summary is invalid: a details element's first
 *     child has to be the summary.
 *   * A visually hidden heading next to the summary restores the outline by
 *     making every screen reader read each question twice, which is a worse
 *     experience than losing an outline entry.
 *
 * So: the outline entry is best effort, the name and the keyboard are not.
 * FaqList.test.tsx pins the structure and jsdom's own role mapping, and says
 * plainly that it cannot speak for Chrome. Do not "fix" this by adding a second
 * copy of the question.
 */

export type FaqItem = { q: string; a: string };

export default function FaqList({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <div className={`grid sm:grid-cols-2 gap-x-12 ${className ?? ''}`}>
      {items.map(item => (
        <details key={item.q} className="disclosure group border-b border-[var(--border)]">
          <summary>
            <svg
              className="disclosure-mark"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="m4 2 4 4-4 4" />
            </svg>
            {/* 14.5px at 320px, where 17px wrapped most of these to two lines
                and turned eight closed questions into a 580px block. */}
            <h3 className="font-serif text-[14.5px] sm:text-[18px] font-bold tracking-tight leading-snug">
              {item.q}
            </h3>
          </summary>
          <p className="text-[13.5px] text-ink-2 leading-[1.7] font-light pl-6 pr-2 pb-4 -mt-1">
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}
