'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Avatar from '@/components/Avatar';
import { createClient } from '@/lib/supabase/client';
import { intentTagLabel } from '@/lib/utils';

export default function PlanDetailClient({ initialPlan }: { initialPlan: any }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const justPosted = searchParams.get('posted') === '1';

  const [plan] = useState<any>(initialPlan);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [existingConv, setExistingConv] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [showMessageBox, setShowMessageBox] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user?.id ?? null);
      if (user && plan && plan.user_id !== user.id) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('plan_id', plan.id)
          .eq('joiner_id', user.id)
          .maybeSingle();
        if (conv) setExistingConv(conv.id);
      }
    }
    load();
  }, []);

  async function sendOpener() {
    setError('');
    if (messageText.length < 5) { setError('Write a bit more, at least 5 characters'); return; }
    setMessaging(true);
    const res = await fetch('/api/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: plan.id, firstMessage: messageText })
    });
    const data = await res.json();
    setMessaging(false);
    if (!res.ok) { setError(data.error || 'Could not send'); return; }
    router.push(`/inbox/${data.conversationId}`);
  }

  async function deletePlan() {
    if (!confirm('Delete this plan? This cannot be undone.')) return;
    setDeleting(true);
    const res = await fetch(`/api/plans?planId=${plan.id}`, { method: 'DELETE' });
    if (res.ok) router.push('/my-plans');
    else { setError('Could not delete'); setDeleting(false); }
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: 'Stoop', text: plan.text, url }); return; } catch {}
    }
    await navigator.clipboard.writeText(url);
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 2500);
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
  const tags = plan.intent_tags ?? [];

  return (
    <>
      <Nav />
      <div className="max-w-[720px] mx-auto px-6 py-10 pb-20">
        {justPosted && (
          <div className="bg-[rgba(42,66,50,0.08)] border border-[rgba(42,66,50,0.3)] text-sage rounded-xl px-4 py-3 mb-6 text-[13.5px]">
            🌃 You&apos;re out there. Your plan is live and someone in your city is going to see this.
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <Link href="/feed" className="text-[13px] text-muted hover:text-ink">← Back to plans</Link>
          <button onClick={share} className="text-[12px] text-muted hover:text-ink flex items-center gap-1.5">
            <span>↗</span> Share
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          <span className={`tag tag-${plan.category}`}>{plan.category}</span>
          {tags.map((t: string) => (
            <span key={t} className="text-[10.5px] font-medium tracking-wide text-ink-2 bg-cream-2 px-2 py-[3px] rounded-full">
              {intentTagLabel(t)}
            </span>
          ))}
        </div>

        <h1 className="font-serif text-[clamp(22px,3.5vw,32px)] font-normal italic leading-snug mb-8">
          {plan.text}
        </h1>

        <div className="flex gap-2.5 flex-wrap mb-7">
          <div className="flex items-center gap-1.5 text-[13px] text-ink-2 bg-cream-2 px-3 py-1.5 rounded-lg border border-[var(--border)]">
            <span>📅</span>
            {plan.when_day}
            {plan.when_time_specific ? ` · ${plan.when_time_specific}` : plan.when_time ? ` · ${plan.when_time}` : ''}
          </div>
          {plan.spot && (
            <div className="flex items-center gap-1.5 text-[13px] text-ink-2 bg-cream-2 px-3 py-1.5 rounded-lg border border-[var(--border)]">
              <span>📍</span>{plan.spot}{plan.neighborhood && `, ${plan.neighborhood.name}`}
            </div>
          )}
        </div>

        <div className="h-px bg-[var(--border)] my-7"></div>

        <div className="flex items-center gap-3.5 mb-7">
          <Avatar
            userId={u.id ?? plan.user_id}
            name={u.name}
            initials={u.initials}
            bg={u.avatar_bg}
            fg={u.avatar_fg}
            size={44}
            radius={13}
          />
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

        {error && <div className="bg-accent/10 border border-accent/25 text-accent text-[13px] rounded-xl px-4 py-3 mb-4">{error}</div>}

        {isOwn ? (
          <div className="flex flex-col gap-2.5">
            <div className="bg-cream-2 border border-[var(--border)] rounded-xl px-5 py-3.5 text-[13px] text-muted flex items-center gap-2">
              <span>📋</span>
              <span>This is your plan. Wait for someone to message.</span>
            </div>
            <div className="flex gap-2">
              <Link href={`/plan/${plan.slug}/edit`} className="btn btn-ghost flex-1">Edit plan</Link>
              <button onClick={deletePlan} disabled={deleting}
                className="flex-1 px-4 py-2 rounded-full border border-accent/30 text-accent text-[13px] hover:bg-accent/5">
                {deleting ? 'Deleting…' : 'Delete plan'}
              </button>
            </div>
          </div>
        ) : isFull ? (
          <div className="bg-cream-2 border border-[var(--border)] rounded-xl px-5 py-3.5 text-[13px] text-muted">
            This plan is full, but you can <Link href="/post" className="text-accent font-medium hover:underline">post your own</Link>
          </div>
        ) : existingConv ? (
          <Link href={`/inbox/${existingConv}`} className="btn btn-accent btn-full btn-lg">Open conversation →</Link>
        ) : !currentUser ? (
          <>
            <Link href={`/auth?next=/plan/${plan.slug}`} className="btn btn-accent btn-full btn-lg">Sign up to message {u.name} →</Link>
            <p className="text-[12px] text-muted text-center mt-2">Takes about a minute. You&apos;ll come right back to this plan.</p>
          </>
        ) : showMessageBox ? (
          <div className="flex flex-col gap-3">
            <textarea value={messageText} onChange={e => setMessageText(e.target.value)}
              rows={4} maxLength={2000} placeholder={`Send ${u.name} a short message about the plan…`}
              className="input resize-none" autoFocus />
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
            <p className="text-[12px] text-muted text-center mt-2">Not a request, just a message. Short conversation, then you decide.</p>
          </>
        )}
      </div>
      {showShareToast && <div className="toast show">Link copied</div>}
    </>
  );
}