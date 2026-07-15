'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';

const OPTIONS = [
  { rating: 'great', label: 'Great', sub: 'Would do it again' },
  { rating: 'fine', label: 'Fine', sub: 'It was okay' },
  { rating: 'noshow', label: 'No-show', sub: "They didn't turn up" }
] as const;

function FollowupContent() {
  const searchParams = useSearchParams();
  const conversationId = searchParams.get('c') ?? '';
  const userId = searchParams.get('u') ?? '';

  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [picked, setPicked] = useState<string | null>(null);

  async function answer(rating: string) {
    setPicked(rating);
    setState('busy');
    const res = await fetch('/api/followup/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, userId, rating })
    });
    setState(res.ok ? 'done' : 'error');
  }

  return (
    <>
      <Nav />
      <div className="max-w-[440px] mx-auto px-6 py-16 text-center">
        {state === 'done' ? (
          <>
            <h1 className="font-serif text-[30px] font-bold tracking-tight mb-3">
              Noted. <em className="italic text-gold">Thanks.</em>
            </h1>
            <p className="text-[13.5px] text-muted leading-relaxed mb-7">
              {picked === 'noshow'
                ? 'Sorry that happened. If something felt off beyond a no-show, tell us and we will look at it.'
                : 'That is all we needed. See you out there.'}
            </p>
            <div className="flex flex-col gap-2.5 items-center">
              <Link href="/post" className="btn btn-accent">Post your next plan →</Link>
              <Link href="/report" className="text-[12.5px] text-muted hover:text-ink underline underline-offset-2">
                Report a problem
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="font-serif text-[30px] font-bold tracking-tight mb-3">
              How was <em className="italic text-gold">it?</em>
            </h1>
            <p className="text-[13.5px] text-muted leading-relaxed mb-8">
              One tap. It helps keep Stoop full of people who actually show up.
            </p>
            {state === 'error' && (
              <p className="text-[13px] text-danger mb-4">
                That did not work. The link may be old or already used; try tapping the email link again.
              </p>
            )}
            <div className="flex flex-col gap-2.5">
              {OPTIONS.map(o => (
                <button
                  key={o.rating}
                  onClick={() => answer(o.rating)}
                  disabled={state === 'busy'}
                  className="w-full bg-card border border-[var(--border2)] rounded-xl px-5 py-3.5 text-left hover:border-accent/50 disabled:opacity-50 transition-colors"
                >
                  <span className="text-[14.5px] font-medium text-ink block">
                    {state === 'busy' && picked === o.rating ? 'Saving…' : o.label}
                  </span>
                  <span className="text-[12px] text-muted">{o.sub}</span>
                </button>
              ))}
            </div>
            <p className="text-[12px] text-muted mt-6">
              Something more serious?{' '}
              <Link href="/report" className="underline underline-offset-2 hover:text-ink">Report a problem</Link>
            </p>
          </>
        )}
      </div>
    </>
  );
}

export default function FollowupPage() {
  return (
    <Suspense fallback={<div className="max-w-[440px] mx-auto px-6 py-16 text-center text-muted text-sm">Loading…</div>}>
      <FollowupContent />
    </Suspense>
  );
}
