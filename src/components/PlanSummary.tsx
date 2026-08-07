'use client';

import CategoryArt, { categoryLabelOf } from '@/components/CategoryArt';
import { CapacitySegments } from '@/components/CapacityMeter';
import {
  NoteIcon,
  CalendarIcon,
  PinIcon,
  CoinIcon,
  UsersIcon,
  TagIcon,
  EyeIcon
} from '@/components/icons';
import { planSummaryRows, type PlanSummaryInput } from '@/lib/plan-contract';

/**
 * The last thing a host sees before publishing: exactly what a neighbor will
 * see, in the same order the plan page shows it. Anything still missing is
 * named rather than quietly left out, and the button next to it moves focus to
 * that field.
 *
 * The marks are there to make the rows scannable, not to say anything new. Each
 * one repeats its own row label and the segments repeat the number written
 * beside them, so no value is printed twice.
 *
 * The one exception is the category. There is no Category row (the rows mirror
 * the plan page, which shows the kind as a pill), so in this panel the drawing
 * is the only thing carrying it. It therefore gets an accessible name rather
 * than being hidden, and the host hears the kind of plan they picked once.
 */

const ROW_ICON: Record<string, typeof NoteIcon> = {
  What: NoteIcon,
  When: CalendarIcon,
  Where: PinIcon,
  Cost: CoinIcon,
  Spots: UsersIcon,
  Expectations: TagIcon,
  'Who sees this': EyeIcon
};

export default function PlanSummary({
  input,
  missing,
  category,
  onFix
}: {
  input: PlanSummaryInput;
  missing: { field: string; label: string }[];
  /** The category the composer has selected, drawn in the panel header. */
  category?: string;
  onFix?: (field: string) => void;
}) {
  const rows = planSummaryRows(input);
  const missingLabels = missing.map(m => m.label);
  const spotsPicked = [1, 2, 3].includes(input.spots);

  return (
    <section aria-labelledby="plan-summary-heading" className="border border-[var(--border2)] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2.5 bg-cream-2 px-4 sm:px-5 py-2.5 border-b border-[var(--border)]">
        {category && (
          <CategoryArt category={category} size={26} label={categoryLabelOf(category) ?? undefined} />
        )}
        <h2 id="plan-summary-heading" className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted">
          What neighbors will see
        </h2>
      </div>

      <dl className="divide-y divide-[var(--border)]">
        {rows.map(row => {
          const Icon = ROW_ICON[row.label];
          const needed = row.value === 'Still needed';
          return (
            <div key={row.label} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:gap-4">
              <dt className="text-[11.5px] font-mono uppercase tracking-wide text-muted sm:w-[104px] sm:flex-shrink-0 sm:pt-[3px] flex items-center gap-1.5">
                {Icon && <Icon size={13} className={needed ? 'text-danger' : 'text-muted'} />}
                {row.label}
              </dt>
              <dd
                className={`text-[13.5px] leading-[1.5] break-words min-w-0 flex items-center gap-2 ${
                  needed ? 'text-danger' : 'text-ink'
                }`}
              >
                {row.label === 'Spots' && spotsPicked && (
                  <CapacitySegments spotsLeft={input.spots} spotsTotal={input.spots} compact />
                )}
                {row.value}
              </dd>
            </div>
          );
        })}
      </dl>

      {missing.length > 0 && (
        <div className="px-4 sm:px-5 py-3 bg-cream-2 border-t border-[var(--border)]">
          <p className="text-[12.5px] text-ink-2 leading-relaxed" role="status">
            Still needed before this can go up: {missingLabels.join(', ')}.
          </p>
          {onFix && (
            <button
              type="button"
              onClick={() => onFix(missing[0].field)}
              className="btn btn-ghost btn-sm mt-2"
            >
              Go to {missingLabels[0]}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
