'use client';

import Link from 'next/link';
import { intentTagLabel } from '@/lib/utils';

type Plan = {
  id: string;
  slug: string;
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

export default function PlanCard({ plan }: { plan: Plan }) {
  const isFull = plan.spots_left === 0 || plan.status === 'full';
  const tagClass = `tag tag-${plan.category}`;
  const tags = plan.intent_tags ?? [];

  return (
    <Link href={`/plan/${plan.slug}`} className="plan-card block no-underline">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={tagClass}>{plan.category}</span>
        {tags.slice(0, 2).map(t => (
          <span key={t} className="text-[10px] font-medium tracking-wide text-ink-2 bg-cream-2 px-2 py-[3px] rounded-full">
            {intentTagLabel(t)}
          </span>
        ))}
      </div>

      <p className="text-[14px] leading-[1.6] text-ink mt-3 mb-3 italic">
        {plan.text.length > 120 ? plan.text.substring(0, 120) + '…' : plan.text}
      </p>

      <div className="flex items-center gap-1.5 text-[11.5px] text-muted mb-3 flex-wrap">
        <span>{plan.when_day}</span>
        {plan.when_time_specific && (<><span className="opacity-30">·</span><span>{plan.when_time_specific}</span></>)}
        {!plan.when_time_specific && plan.when_time && (<><span className="opacity-30">·</span><span>{plan.when_time}</span></>)}
        {plan.neighborhood?.name && (<><span className="opacity-30">·</span><span>{plan.neighborhood.name}</span></>)}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span
            className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center text-[10px] font-semibold"
            style={{ background: plan.poster?.avatar_bg ?? '#eee', color: plan.poster?.avatar_fg ?? '#666' }}
          >
            {plan.poster?.initials || '?'}
          </span>
          <span className="text-[12px] font-medium text-ink-2">{plan.poster?.name ?? '—'}</span>
        </div>
        <span
          className={`text-[10px] font-medium px-2 py-[3px] rounded-full ${
            isFull ? 'text-muted bg-[rgba(20,17,13,0.05)]' : 'text-accent bg-[rgba(200,71,42,0.09)]'
          }`}
        >
          {isFull ? 'Full' : `${plan.spots_left} spot${plan.spots_left > 1 ? 's' : ''}`}
        </span>
      </div>
    </Link>
  );
}