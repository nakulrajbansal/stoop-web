'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { createClient } from '@/lib/supabase/client';

const REASONS = [
  { id: 'harassment', label: 'Harassment or threats' },
  { id: 'inappropriate_messages', label: 'Inappropriate messages' },
  { id: 'unsafe_behavior', label: 'No-show or unsafe behavior' },
  { id: 'fake_profile', label: 'Fake profile' },
  { id: 'other', label: 'Something else' }
];

function ReportForm() {
  const router = useRouter();
  const params = useSearchParams();
  const conversationId = params.get('conversation');
  const supabase = createClient();

  const [otherName, setOtherName] = useState('this person');
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  /** What the server actually did, not what was asked for. */
  const [blockConfirmed, setBlockConfirmed] = useState(false);

  useEffect(() => {
    const convId = conversationId;
    if (!convId) return;
    // An arrow function defined after the guard keeps convId narrowed to
    // string; a hoisted `function load()` does not.
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }
      const { data } = await supabase
        .from('conversations')
        .select(`
          poster_id, joiner_id,
          poster:profiles!conversations_poster_id_fkey(id, name),
          joiner:profiles!conversations_joiner_id_fkey(id, name)
        `)
        .eq('id', convId)
        .single();
      if (!data) return;
      const isPoster = data.poster_id === user.id;
      const other = isPoster ? data.joiner : data.poster;
      setOtherName(other?.name ?? 'this person');
    };
    void load();
  }, [conversationId]);

  async function submit() {
    if (!reason || submitting) return;
    setSubmitting(true);

    // One call does both legs. It used to be two, with the block's failure
    // swallowed by .catch(() => {}) while the confirmation still told the
    // reporter the person was blocked. Now the server reports what happened
    // and the screen says only that.
    let blocked = false;
    let ok = false;
    try {
      const res = await fetch('/api/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, reason, details: details.trim() || null, alsoBlock })
      });
      ok = res.ok;
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        blocked = body?.blocked === true;
      }
    } catch {
      ok = false;
    }

    setSubmitting(false);
    if (ok) {
      setBlockConfirmed(blocked);
      setDone(true);
    } else {
      alert('Could not send the report. Try again.');
    }
  }

  if (done) {
    return (
      <>
        <Nav />
        <div className="max-w-[560px] mx-auto px-6 py-16 text-center">
          <div className="text-[15px] font-medium text-ink mb-2">Thank you. We&apos;ve got it.</div>
          <p className="text-[13.5px] text-muted leading-[1.6] mb-6">
            Our team reviews reports within 24 hours.{' '}
            {blockConfirmed
              ? `${otherName} is blocked, so you will not see or hear from them.`
              : alsoBlock
                ? `We could not block ${otherName} just now. Your report is filed — you can block them from the conversation.`
                : ''}
          </p>
          <button onClick={() => router.push('/inbox')} className="btn btn-sm">Back to inbox</button>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />
      <div className="max-w-[560px] mx-auto px-6 py-10">
        <h1 className="text-[18px] font-semibold text-ink mb-1">Report {otherName}</h1>
        <p className="text-[13px] text-muted leading-[1.6] mb-6">
          Tell us what happened. Reports are private; the other person isn&apos;t told who reported them.
        </p>

        <div className="flex flex-col gap-2 mb-6">
          {REASONS.map(r => (
            <button
              key={r.id}
              onClick={() => setReason(r.id)}
              className={`text-left px-4 py-3 rounded-[12px] border text-[14px] transition-colors ${
                reason === r.id
                  ? 'border-danger bg-danger/5 text-ink'
                  : 'border-[var(--border2)] bg-card text-ink hover:border-danger/40'
              }`}>
              {r.label}
            </button>
          ))}
        </div>

        <label className="block text-[12.5px] text-muted mb-1.5">Anything else? (optional)</label>
        <textarea
          value={details}
          onChange={e => setDetails(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="A few words of context helps us review faster."
          className="w-full bg-card border border-[var(--border2)] rounded-[12px] px-3.5 py-2.5 text-[13.5px] text-ink resize-none outline-none focus:border-accent/40 mb-5"
        />

        <label className="flex items-center gap-2.5 mb-7 cursor-pointer">
          <input type="checkbox" checked={alsoBlock} onChange={e => setAlsoBlock(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)]" />
          <span className="text-[13.5px] text-ink">Also block {otherName}</span>
        </label>

        <div className="flex gap-2.5">
          <button onClick={() => router.back()} className="btn btn-sm btn-ghost">Cancel</button>
          <button onClick={submit} disabled={!reason || submitting} className="btn btn-sm">
            {submitting ? <span className="spinner" /> : 'Send report'}
          </button>
        </div>

        <p className="text-[11.5px] text-muted mt-6 leading-[1.6]">
          We review every report within 24 hours. See our{' '}
          <Link href="/terms" className="underline underline-offset-2 hover:text-ink">Community Standard &amp; Terms</Link>.
        </p>
      </div>
    </>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="max-w-[560px] mx-auto px-6 py-20 text-center text-muted text-sm">Loading…</div>}>
      <ReportForm />
    </Suspense>
  );
}
