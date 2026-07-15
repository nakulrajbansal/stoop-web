'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';

// Deliberately a confirm-button page (not an instant unsubscribe on load):
// corporate email scanners follow links in emails, and a one-click GET would
// silently unsubscribe people who never asked.
function UnsubscribeContent() {
  const uid = useSearchParams().get('uid');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function confirm() {
    if (!uid || state === 'busy') return;
    setState('busy');
    const res = await fetch('/api/digest/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid })
    });
    setState(res.ok ? 'done' : 'error');
  }

  return (
    <div className="max-w-[440px] mx-auto px-6 py-16 text-center">
      {state === 'done' ? (
        <>
          <h1 className="font-serif text-[28px] font-bold tracking-tight mb-3">Done.</h1>
          <p className="text-[14px] text-ink-2 leading-relaxed mb-6">
            No more weekly digests. You&apos;ll still get emails when someone joins or replies to one of your plans, since that&apos;s how plans actually happen.
          </p>
          <Link href="/feed" className="btn btn-primary btn-sm">Browse plans</Link>
        </>
      ) : !uid ? (
        <>
          <h1 className="font-serif text-[28px] font-bold tracking-tight mb-3">Hmm.</h1>
          <p className="text-[14px] text-muted leading-relaxed">
            This link is missing its ID. Use the unsubscribe link from the bottom of a digest email.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-serif text-[28px] font-bold tracking-tight mb-3">
            Stop the weekly <em className="italic text-accent">digest?</em>
          </h1>
          <p className="text-[14px] text-ink-2 leading-relaxed mb-6">
            You&apos;ll stop getting the Sunday &quot;this week on your stoop&quot; email. Emails about your own plans (joins, replies, confirmations) keep working.
          </p>
          {state === 'error' && (
            <p className="text-[13px] text-accent mb-4">Something went wrong. Try again.</p>
          )}
          <button onClick={confirm} disabled={state === 'busy'} className="btn btn-accent">
            {state === 'busy' ? <span className="spinner" /> : 'Yes, stop the digest'}
          </button>
        </>
      )}
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <>
      <Nav />
      <Suspense fallback={<div className="max-w-[440px] mx-auto px-6 py-20 text-center text-muted text-sm">Loading…</div>}>
        <UnsubscribeContent />
      </Suspense>
    </>
  );
}
