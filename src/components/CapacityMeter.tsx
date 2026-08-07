/**
 * How much room is left, as a picture and as a sentence.
 *
 * One segment per spot the host offered: filled in accent where a spot is still
 * open, dimmed where it is taken. The segments are decoration and are marked as
 * such; the sentence beside them carries the fact, so nobody has to count
 * coloured bars, and the meaning survives a screen reader, a high contrast mode
 * and a printout.
 *
 * The wording is deliberately the wording the plan page already used.
 */

/**
 * The product cap: a Stoop group is the organizer plus one to three joiners, so
 * a plan never offers more than three spots. The composer and /api/plans both
 * refuse anything else, which makes this a second line rather than the only
 * one; a row that has somehow stored 9 should still not promise nine seats.
 */
export const GROUP_SPOTS_MAX = 3;

const FULL_LABEL = 'This plan is full';

/** Both readings clamp the same way, so the sentence and the picture agree. */
function clampTotal(spotsTotal: number): number {
  return Math.max(0, Math.min(Number.isFinite(spotsTotal) ? spotsTotal : 0, GROUP_SPOTS_MAX));
}

export function capacityLabel(spotsLeft: number, spotsTotal: number): string {
  const total = clampTotal(spotsTotal);
  const left = Number.isFinite(spotsLeft) ? Math.max(0, Math.min(spotsLeft, total)) : 0;
  if (total <= 0 || left <= 0) return FULL_LABEL;
  return `${left} of ${total} spot${total > 1 ? 's' : ''} open`;
}

/**
 * The segments on their own, for a row that already writes the number out in
 * its own words. Always decorative: it never carries the only copy of the fact.
 */
export function CapacitySegments({
  spotsLeft,
  spotsTotal,
  compact = false,
  className
}: {
  spotsLeft: number;
  spotsTotal: number;
  compact?: boolean;
  className?: string;
}) {
  const total = clampTotal(spotsTotal);
  const left = Math.max(0, Math.min(Number.isFinite(spotsLeft) ? spotsLeft : 0, total));

  return (
    <span className={`meter${compact ? ' meter-sm' : ''} ${className ?? ''}`} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`meter-seg ${i < left ? 'meter-seg-open' : 'meter-seg-taken'}`} />
      ))}
    </span>
  );
}

export default function CapacityMeter({
  spotsLeft,
  spotsTotal,
  className,
  labelClassName
}: {
  spotsLeft: number;
  spotsTotal: number;
  className?: string;
  labelClassName?: string;
}) {
  const label = capacityLabel(spotsLeft, spotsTotal);
  const full = label === FULL_LABEL;

  return (
    <div className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <CapacitySegments spotsLeft={spotsLeft} spotsTotal={spotsTotal} />
      <span className={labelClassName ?? `text-[15px] font-semibold ${full ? 'text-muted' : 'text-accent'}`}>
        {label}
      </span>
    </div>
  );
}
