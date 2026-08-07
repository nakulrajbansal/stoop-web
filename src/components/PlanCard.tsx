'use client';

import Link from 'next/link';
import Avatar from '@/components/Avatar';
import CategoryArt, { CATEGORY_LABELS } from '@/components/CategoryArt';
import { CapacitySegments } from '@/components/CapacityMeter';
import { CalendarIcon, PinIcon, CoinIcon } from '@/components/icons';
import { intentTagLabel } from '@/lib/utils';
import { costExpectationLabel } from '@/lib/plan-contract';
import { firstNameOf } from '@/lib/participants';

type Plan = {
  id: string;
  slug: string;
  user_id?: string;
  text: string;
  category: string;
  when_day: string;
  when_time: string | null;
  when_time_specific: string | null;
  spots_left: number;
  spots_total: number;
  status: string;
  spot: string | null;
  intent_tags?: string[];
  cost_expectation?: string | null;
  neighborhood?: { name: string } | null;
  city?: { name: string; slug: string } | null;
  poster?: {
    name: string;
    initials: string | null;
    avatar_bg: string;
    avatar_fg: string;
  } | null;
};

export default function PlanCard({ plan }: { plan: Plan }) {
  const isFull = plan.spots_left === 0 || plan.status === 'full';
  const tags = plan.intent_tags ?? [];
  const costLabel = costExpectationLabel(plan.cost_expectation);

  // Build the time/location line: "Today, 9–11am · South Congress"
  let timeLine = plan.when_day;
  if (plan.when_time_specific) {
    timeLine += `, ${plan.when_time_specific}`;
  } else if (plan.when_time) {
    timeLine += `, ${plan.when_time.toLowerCase()}`;
  }

  return (
    <Link href={`/plan/${plan.slug}`} className="plan-card block no-underline">
      {/* The drawing repeats the category pill next to it, so it is decorative. */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <CategoryArt category={plan.category} size={34} />
        <span className={`tag tag-${plan.category}`}>
          {CATEGORY_LABELS[plan.category as keyof typeof CATEGORY_LABELS] ?? plan.category}
        </span>
        {tags.slice(0, 2).map(t => (
          <span key={t} className="text-[11px] font-medium text-ink-2 bg-cream-2 px-2.5 py-[3px] rounded-full">
            {intentTagLabel(t)}
          </span>
        ))}
      </div>

      <p className="font-serif text-[17px] leading-[1.35] text-ink font-bold mb-3 tracking-[-0.2px]">
        {plan.text.length > 90 ? plan.text.substring(0, 90) + '…' : plan.text}
      </p>

      {/* One line per fact, each with its own mark, so day, place and cost can
          be found without reading the whole line. */}
      <div className="text-[12px] text-muted mb-4 flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5">
          <CalendarIcon size={12} className="flex-shrink-0" />
          {timeLine}
        </span>
        {(plan.spot || plan.neighborhood?.name) && (
          <span className="flex items-start gap-1.5">
            <PinIcon size={12} className="flex-shrink-0 mt-[3px]" />
            <span className="min-w-0">
              {[plan.spot, plan.neighborhood?.name].filter(Boolean).join(', ')}
            </span>
          </span>
        )}
        {costLabel && (
          <span className="flex items-center gap-1.5">
            <CoinIcon size={12} className="flex-shrink-0" />
            {costLabel}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <Avatar
            userId={plan.user_id}
            name={firstNameOf(plan.poster?.name)}
            initials={plan.poster?.initials}
            bg={plan.poster?.avatar_bg}
            fg={plan.poster?.avatar_fg}
            size={28}
            radius={8}
          />
          <div>
            <div className="text-[12.5px] font-semibold text-ink leading-tight">{firstNameOf(plan.poster?.name)}</div>
            <div className="text-[10.5px] text-muted leading-tight">hosting</div>
          </div>
        </div>
        <span
          className={`text-[11px] font-medium px-2.5 py-[3px] rounded-full flex items-center gap-1.5 ${
            isFull
              ? 'text-muted bg-[rgba(20,17,13,0.05)]'
              : 'text-sage bg-[rgba(42,66,50,0.08)]'
          }`}
        >
          {!isFull && (
            <CapacitySegments spotsLeft={plan.spots_left} spotsTotal={plan.spots_total} compact />
          )}
          {isFull ? 'Full' : `${plan.spots_left} ${plan.spots_left === 1 ? 'spot' : 'spots'} open`}
        </span>
      </div>
    </Link>
  );
}