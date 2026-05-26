'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Nav from '@/components/Nav';

function PlanDetailContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const planId = params.id as string;
  const justPosted = searchParams.get('posted') === '1';

  const supabase = createClient();
  const [plan, setPlan] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [existingConv, setExistingConv] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [showMessageBox, setShowMessageBox] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user?.id ?? null);

      const { data } = await supabase
        .from('plans')
        .select(`*, poster:profiles!plans_user_id_fkey(id, name, initials, avatar_bg, avatar_fg, about, is_founding_member), neighborhood:neighborhoods(name)`)
        .eq('id', planId)
        .single();

      setPlan(data);

      if (user && data && data.user_id !== user.id) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('plan_id', planId)
          .eq('joiner_id', user.id)
          .maybeSingle();
        if (conv) setExistingConv(conv.id);
      }

      setLoading(false);
    }
    load();
  }, [planId]);

  async function sendOpener() {
    setError('');
    if (messageText.length < 5) { setError('Write a bit more — at least 5 characters'); return; }
    setMessaging(true);

    const res = await fetch('/api/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, firstMessage: messageText })
    });
    const data = await res.json();
    setMessaging(false);

    if (!res.ok) { setError(data.error || 'Could not send'); return; }
    router.push(`/inbox/${data.conversationId}`);
  }

  if (loading) {
    return (
      <>
        <Nav />
        <div className="max-w-[720px] mx-auto px-6 py-20 text-center text-muted text-sm">Loading…</div>
      </>
    );
  }

  if (!plan) {
    return (
      <>
        <Nav />
        <div className="max-w-[720px] mx-auto px-6 py-20 text-center">
          <p className="text-sm text-muted mb-4">This plan no longer exists.</p>
          <Link href="/feed" className="btn btn-primary btn-sm">Back to feed</Link>
        </div>
      </>
    );
  }

  const isOwn = currentUser === plan.user_id;
  const isFull = plan.spots_left === 0 || plan.status === 'full';
  const u = plan.poster;

  return (
    <>
      <Nav />
      <div className="max-w-[720px] mx-auto px-6 py-10 pb-20">
        {justPosted && (
          <div className="bg-[#F0FDF4] border border-[#16A34A] text-[#15803D] rounded-xl px-4 py-3 mb-6 text-[13.5px]">
            🌃 You&apos;re out there. Your plan is live and someone in your city is going to see this.
          </div>
        )}

        <Link href="/feed" className="text-[13px] text-muted hover:text-ink inline-block mb-8">← Back to plans</Link>

        <span className={`tag tag-${plan.category} mb-4 inline-block`}>{plan.category}</span>

        <h1 className="font-serif text-[clamp(22px,3.5vw,32px)] font-normal italic leading-snug mb-8">
          {plan.text}
        </h1>

        <div className="flex gap-2.5 flex-wrap mb-7">
          <div className="flex items-center gap-1.5 text-[13px] text-ink-2 bg-cream-2 px-3 py-1.5 rounded-lg border border-[var(--border)]">
            <span>📅</span>{plan.when_day}{plan.when_time && ` · ${plan.when_time}`}
          </div>
          {plan.spot && (
            <div className="flex items-center gap-1.5 text-[13px] text-ink-2 bg-cream-2 px-3 py-1.5 rounded-lg border border-[var(--border)]">
              <span>📍</span>{plan.spot}{plan.neighborhood && `, ${plan.neighborhood.name}`}
            </div>
          )}
        </div>

        <div className="h-px bg-[var(--border)] my-7"></div>

        <div className="flex items-center gap-3.5 mb-7">
          <div className="w-11 h-11 rounded-[13px] flex items-center justify-center text-[14px] font-semibold"
            style={{ background: u.avatar_bg, color: u.avatar_fg }}>
            {u.initials || u.name[0]}
          </div>
          <div>
            <div className="text-[15px] font-medium text-ink flex items-center gap-2">
              {u.name}
              {u.is_founding_member && <span className="text-[10px] font-mono uppercase tracking-wider bg-accent text-white px-2 py-0.5 rounded-full">Founding</span>}
            </div>
            <div className="text-[13px] text-muted">{u.about || 'Neighbor'}</div>
          </div>
        </div>

        <div className="bg-cream-2 border border-[var(--border)] rounded-xl px-5 py-4 flex items-center justify-between mb-6">
          <div>
            <div className="text-[12px] text-muted">Spots available</div>
            <div className={`text-[15px] font-semibold ${isFull ? 'text-muted' : 'text-accent'}`}>
              {isFull ? 'This plan is full' : `${plan.spots_left} of ${plan.spots_total} spot${plan.spots_total > 1 ? 's' : ''} open`}
            </div>
          </div>
        </div>

        {isOwn ? (
          <div className="bg-cream-2 border border-[var(--border)] rounded-xl px-5 py-3.5 text-[13px] text-muted flex items-center gap-2">
            <span>📋</span>
            <span>This is your plan. Wait for someone to message.</span>
          </div>
        ) : isFull ? (
          <div className="bg-cream-2 border border-[var(--border)] rounded-xl px-5 py-3.5 text-[13px] text-muted">
            This plan is full — but you can <Link href="/post" className="text-accent font-medium hover:underline">post your own</Link>
          </div>
        ) : existingConv ? (
          <Link href={`/inbox/${existingConv}`} className="btn btn-accent btn-full btn-lg">Open conversation →</Link>
        ) : !currentUser ? (
          <Link href="/auth" className="btn btn-accent btn-full btn-lg">Sign in to message {u.name} →</Link>
        ) : showMessageBox ? (
          <div className="flex flex-col gap-3">
            <textarea value={messageText} onChange={e => setMessageText(e.target.value)}
              rows={4} maxLength={2000} placeholder={`Send ${u.name} a short message about the plan…`}
              className="input resize-none" autoFocus />
            {error && <p className="text-[12px] text-accent">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setShowMessageBox(false)} className="btn btn-ghost flex-1">Cancel</button>
              <button onClick={sendOpener} disabled={messaging} className="btn btn-accent flex-1">
                {messaging ? <span className="spinner" /> : 'Send →'}
              </button>
            </div>
            <p className="text-[11px] text-muted text-center">No formal request. Just a message.</p>
          </div>
        ) : (
          <>
            <button onClick={() => setShowMessageBox(true)} className="btn btn-accent btn-full btn-lg">
              Message {u.name} →
            </button>
            <p className="text-[12px] text-muted text-center mt-2">Not a request — just a message. Short conversation, then you decide.</p>
          </>
        )}
      </div>
    </>
  );
}

export default function PlanDetailPage() {
  return (
    <Suspense fallback={<div className="max-w-[720px] mx-auto px-6 py-20 text-center text-muted text-sm">Loading…</div>}>
      <PlanDetailContent />
    </Suspense>
  );
}