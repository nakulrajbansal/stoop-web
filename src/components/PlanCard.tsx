'use client';

import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { intentTagLabel } from '@/lib/utils';

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
  neighborhood?: { name: string } | null;
  city?: { name: string; slug: string } | null;
  poster?: {
    name: string;
    initials: string | null;
    avatar_bg: string;
    avatar_fg: string;
  } | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  coffee: 'Coffee',
  outdoors: 'Outdoors',
  sports: 'Sports',
  arts: 'Arts',
  food: 'Food',
  books: 'Books',
  music: 'Music'
};

export default function PlanCard({ plan }: { plan: Plan }) {
  const isFull = plan.spots_left === 0 || plan.status === 'full';
  const tags = plan.intent_tags ?? [];

  // Build the time/location line: "Today, 9–11am · South Congress"
  let timeLine = plan.when_day;
  if (plan.when_time_specific) {
    timeLine += `, ${plan.when_time_specific}`;
  } else if (plan.when_time) {
    timeLine += `, ${plan.when_time.toLowerCase()}`;
  }

  return (
    <Link href={`/plan/${plan.slug}`} className="plan-card block no-underline">
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <span className="text-[11px] font-medium text-accent bg-[rgba(200,71,42,0.09)] px-2.5 py-[3px] rounded-full">
          {CATEGORY_LABEL[plan.category] ?? plan.category}
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

      <div className="text-[12px] text-muted mb-4">
        {timeLine}
        {plan.neighborhood?.name && (
          <>
            <span className="opacity-40 mx-1.5">·</span>
            {plan.neighborhood.name}
          </>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <Avatar
            userId={plan.user_id}
            name={plan.poster?.name}
            initials={plan.poster?.initials}
            bg={plan.poster?.avatar_bg}
            fg={plan.poster?.avatar_fg}
            size={28}
            radius={8}
          />
          <div>
            <div className="text-[12.5px] font-semibold text-ink leading-tight">{plan.poster?.name ?? 'A neighbor'}</div>
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
          {!isFull && <span className="w-1.5 h-1.5 rounded-full bg-sage inline-block"></span>}
          {isFull ? 'Full' : `${plan.spots_left} ${plan.spots_left === 1 ? 'spot' : 'spots'} open`}
        </span>
      </div>
    </Link>
  );
}