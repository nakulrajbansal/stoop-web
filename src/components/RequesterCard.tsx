'use client';

import Avatar from '@/components/Avatar';
import type { RequesterPreview } from '@/lib/participants';
import { STATE_COPY, stateCopy } from '@/lib/conversation-lifecycle';

/**
 * What the host sees about one requester, right above Accept and Decline.
 *
 * Private to that conversation. This never appears on a plan page, and a
 * requester's details are never attached to a public plan response.
 */
export default function RequesterCard({ requester }: { requester: RequesterPreview }) {
  const meta = [requester.neighborhood, requester.priorPlans].filter(Boolean).join(' · ');

  return (
    <section
      aria-labelledby="requester-card-heading"
      className="bg-card border border-[var(--border2)] rounded-2xl px-4 py-4 mb-3"
    >
      <h2
        id="requester-card-heading"
        className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-3"
      >
        Who is asking
      </h2>

      <div className="flex items-start gap-3">
        <Avatar userId={requester.userId} name={requester.firstName} size={44} radius={13} />
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-ink leading-tight">{requester.firstName}</p>
          {meta && <p className="text-[12.5px] text-muted mt-0.5">{meta}</p>}
          {requester.about && (
            <p className="text-[13px] text-ink-2 leading-[1.55] mt-1.5 break-words">{requester.about}</p>
          )}
        </div>
      </div>

      {requester.opener && (
        <blockquote className="mt-3 pl-3 border-l-[3px] border-[var(--border2)] text-[13.5px] text-ink-2 leading-[1.6] break-words">
          {requester.opener}
        </blockquote>
      )}

      <p className="text-[12px] text-muted mt-3 leading-relaxed">
        {requester.status === 'pending'
          ? `${STATE_COPY.pending.line} You decide whether to confirm.`
          : stateCopy(requester.status).line}
      </p>
    </section>
  );
}
