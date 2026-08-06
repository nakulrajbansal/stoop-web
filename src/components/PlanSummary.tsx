'use client';

import { planSummaryRows, type PlanSummaryInput } from '@/lib/plan-contract';

/**
 * The last thing a host sees before publishing: exactly what a neighbor will
 * see, in the same order the plan page shows it. Anything still missing is
 * named rather than quietly left out, and the button next to it moves focus to
 * that field.
 */
export default function PlanSummary({
  input,
  missing,
  onFix
}: {
  input: PlanSummaryInput;
  missing: { field: string; label: string }[];
  onFix?: (field: string) => void;
}) {
  const rows = planSummaryRows(input);
  const missingLabels = missing.map(m => m.label);

  return (
    <section aria-labelledby="plan-summary-heading" className="border border-[var(--border2)] rounded-2xl overflow-hidden">
      <h2
        id="plan-summary-heading"
        className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted bg-cream-2 px-4 sm:px-5 py-2.5 border-b border-[var(--border)]"
      >
        What neighbors will see
      </h2>

      <dl className="divide-y divide-[var(--border)]">
        {rows.map(row => (
          <div key={row.label} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:gap-4">
            <dt className="text-[11.5px] font-mono uppercase tracking-wide text-muted sm:w-[104px] sm:flex-shrink-0 sm:pt-[3px]">
              {row.label}
            </dt>
            <dd
              className={`text-[13.5px] leading-[1.5] break-words min-w-0 ${
                row.value === 'Still needed' ? 'text-danger' : 'text-ink'
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
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
