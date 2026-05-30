'use client';

import { useState } from 'react';

type PlanLite = {
  slug?: string;
  text?: string;
  when_day?: string;
  when_time?: string;
  spot?: string | null;
};

export default function SafetyCard({ plan, otherName }: { plan: PlanLite; otherName: string }) {
  const [copied, setCopied] = useState(false);

  async function shareDetails() {
    const url = plan.slug ? `${window.location.origin}/plan/${plan.slug}` : window.location.origin;
    const when = [plan.when_day, plan.when_time].filter(Boolean).join(' ');
    const lines = [
      `Letting you know where I'll be: meeting ${otherName} through Stoop.`,
      plan.text ? `Plan: ${plan.text}` : '',
      when ? `When: ${when}` : '',
      plan.spot ? `Where: ${plan.spot}` : '',
      `Details: ${url}`
    ].filter(Boolean);
    const text = lines.join('\n');

    if (navigator.share) {
      try { await navigator.share({ title: 'Where I\'ll be', text, url }); return; } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }

  return (
    <div className="border border-[rgba(42,66,50,0.18)] bg-[rgba(42,66,50,0.05)] rounded-[14px] px-4 py-3.5 mb-3">
      <div className="text-[13px] font-medium text-sage mb-1.5">You're set to meet up.</div>
      <p className="text-[12.5px] text-ink leading-[1.6] mb-3">
        A few gentle reminders: pick a public spot, let a friend know where you're going,
        trust your gut, and know you can cancel anytime.
      </p>
      <button onClick={shareDetails}
        className="text-[12.5px] font-medium text-sage underline underline-offset-2 hover:text-ink">
        {copied ? 'Copied. Send it to a friend.' : 'Send these details to a friend →'}
      </button>
    </div>
  );
}
