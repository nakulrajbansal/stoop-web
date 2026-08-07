'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import ConfirmedRoster from '@/components/ConfirmedRoster';
import CategoryArt, { isCategory } from '@/components/CategoryArt';
import CapacityMeter from '@/components/CapacityMeter';
import { CalendarIcon, ClockIcon, PinIcon, CoinIcon, ShareIcon, CheckCircleIcon, NoteIcon } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { intentTagLabel } from '@/lib/utils';
import { costExpectationLabel, COST_EXPECTATION_HINTS } from '@/lib/plan-contract';
import { stateCopy } from '@/lib/conversation-lifecycle';
import { firstNameOf, priorPlanLabel } from '@/lib/participants';
import { planMessageCta, MESSAGING_NOT_A_RESERVATION, HOST_REVIEWS_REQUESTS } from '@/lib/product-copy';

export default function PlanDetailClient({
  initialPlan,
  hostPlanCount = 0,
  hostNeighborhood = null
}: {
  initialPlan: any;
  hostPlanCount?: number;
  hostNeighborhood?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const justPosted = searchParams.get('posted') === '1';
  const justBecameFounding = searchParams.get('founding') === '1';

  const [plan] = useState<any>(initialPlan);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [existingConv, setExistingConv] = useState<{ id: string; status: string } | null>(null);
  const [messaging, setMessaging] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [showMessageBox, setShowMessageBox] = useState(false);
  // Asking again after leaving is a separate, explicit act, and it needs its
  // own opener rather than reviving a thread that ended.
  const [askingAgain, setAskingAgain] = useState(false);
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
          .select('id, status')
          .eq('plan_id', plan.id)
          .eq('joiner_id', user.id)
          .maybeSingle();
        const convRow = conv as { id: string; status: string } | null;
        if (convRow) setExistingConv({ id: convRow.id, status: convRow.status });
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
      // requestAgain is the deliberate part. Without it the server refuses to
      // restart something this person chose to leave.
      body: JSON.stringify({ planId: plan.id, firstMessage: messageText, requestAgain: askingAgain })
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
      <div className="py-10 text-center">
        <p className="text-sm text-muted mb-4">This plan no longer exists.</p>
        <Link href="/feed" className="btn btn-primary btn-sm">Back to feed</Link>
      </div>
    );
  }

  const isOwn = currentUser === plan.user_id;
  const isFull = plan.spots_left === 0 || plan.status === 'full';
  // A plan stored with a category we no longer draw still gets a header; it
  // falls back to the coffee tokens rather than rendering an untinted band.
  const categoryKey = isCategory(plan.category) ? plan.category : 'coffee';
  const u = plan.poster;
  const tags = plan.intent_tags ?? [];
  const hostFirstName = firstNameOf(u?.name);
  const hostPlans = priorPlanLabel(hostPlanCount);
  const costLabel = costExpectationLabel(plan.cost_expectation);
  const costHint = plan.cost_expectation
    ? COST_EXPECTATION_HINTS[plan.cost_expectation as keyof typeof COST_EXPECTATION_HINTS]
    : null;
  const requestState = existingConv ? stateCopy(existingConv.status) : null;

  // Nav, the main landmark and the footer are rendered by the page around this
  // component's Suspense boundary, so the server-rendered fallback already has
  // exactly one <main id="main"> for the skip link to target.
  return (
    <>
      {justPosted && (
        <div className="bg-[rgba(42,66,50,0.08)] border border-[rgba(42,66,50,0.3)] text-sage rounded-xl px-4 py-3 mb-6 text-[13.5px] flex items-center gap-2">
          <CheckCircleIcon className="flex-shrink-0" />
          <span>
            {justBecameFounding
              ? 'Your plan is live, and that made you a Founding member. The badge is yours for good.'
              : "You're out there. Your plan is live and someone in your city is going to see this."}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between mb-8">
        <Link href="/feed" className="text-[13px] text-muted hover:text-ink">← Back to plans</Link>
        <button type="button" onClick={share} className="text-[12px] text-muted hover:text-ink flex items-center gap-1.5">
          <ShareIcon /> Share
        </button>
      </div>

      {/* Category header. The drawing is the only new thing above the plan
          text, and the logistics chips stay exactly where they were: directly
          under the title, above anything else. */}
      <div className={`cat-${categoryKey} rise-art flex items-center gap-3.5 rounded-2xl border border-[var(--border)] px-4 py-3 mb-5`}
        style={{ background: 'var(--cat-wash)' }}>
        <CategoryArt category={plan.category} size={44} tile={false} />
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className={`tag tag-${plan.category}`}>{plan.category}</span>
          {tags.map((t: string) => (
            <span key={t} className="text-[10.5px] font-medium tracking-wide text-ink-2 bg-cream/70 px-2 py-[3px] rounded-full">
              {intentTagLabel(t)}
            </span>
          ))}
        </div>
      </div>

      <h1 className="font-serif text-[clamp(22px,3.5vw,32px)] font-normal italic leading-snug mb-7">
        {plan.text}
      </h1>

      <div className="flex gap-2.5 flex-wrap mb-7">
        <div className="flex items-center gap-1.5 text-[13px] text-ink-2 bg-cream-2 px-3 py-1.5 rounded-lg border border-[var(--border)]">
          <CalendarIcon className="text-muted flex-shrink-0" />
          {plan.when_day}
        </div>
        {(plan.when_time_specific || plan.when_time) && (
          <div className="flex items-center gap-1.5 text-[13px] text-ink-2 bg-cream-2 px-3 py-1.5 rounded-lg border border-[var(--border)]">
            <ClockIcon className="text-muted flex-shrink-0" />
            <span className="sr-only">Time: </span>
            {plan.when_time_specific ? plan.when_time_specific : plan.when_time}
          </div>
        )}
        {plan.spot ? (
          <div className="flex items-center gap-1.5 text-[13px] text-ink-2 bg-cream-2 px-3 py-1.5 rounded-lg border border-[var(--border)]">
            <PinIcon className="text-muted flex-shrink-0" />{plan.spot}{plan.neighborhood && `, ${plan.neighborhood.name}`}
          </div>
        ) : (
          // Posted before a meeting point was required. Say so rather than
          // leaving a gap the reader has to notice on their own.
          <div className="flex items-center gap-1.5 text-[13px] text-muted bg-cream-2 px-3 py-1.5 rounded-lg border border-dashed border-[var(--border2)]">
            <PinIcon className="flex-shrink-0" />
            No meeting point yet{plan.neighborhood && `, somewhere in ${plan.neighborhood.name}`}. Ask before you go.
          </div>
        )}
        {costLabel && (
          <div className="flex items-center gap-1.5 text-[13px] text-ink-2 bg-cream-2 px-3 py-1.5 rounded-lg border border-[var(--border)]">
            <CoinIcon className="text-muted flex-shrink-0" />
            <span className="sr-only">Cost: </span>{costLabel}
          </div>
        )}
      </div>

      {costHint && <p className="text-[12px] text-muted -mt-4 mb-7">{costHint}</p>}

      <div className="h-px bg-[var(--border)] my-7"></div>

      {/* The public host card. First name, photo, neighborhood, their own line,
          and an honest hosting record. Nothing here is private, and there is no
          way from it to a profile page: identity lives inside this plan. */}
      <section aria-labelledby="host-card-heading" className="mb-6">
        <h2 id="host-card-heading" className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-3">
          Who is hosting
        </h2>
        <div className="flex items-start gap-3.5">
          {/* First name only, like every other public surface. The alt text
              this becomes is public HTML, so the full display name must not
              reach it: the private roster below is the only place a last name
              is ever allowed to appear. */}
          <Avatar
            userId={u.id ?? plan.user_id}
            name={hostFirstName}
            initials={u.initials}
            bg={u.avatar_bg}
            fg={u.avatar_fg}
            size={44}
            radius={13}
          />
          <div className="min-w-0">
            <div className="text-[15px] font-medium text-ink flex items-center gap-2 flex-wrap">
              {hostFirstName}
              {u.is_founding_member && <span className="text-[10px] font-mono uppercase tracking-wider bg-accent text-white px-2 py-0.5 rounded-full">Founding</span>}
            </div>
            <div className="text-[13px] text-muted">
              {[hostNeighborhood, hostPlans].filter(Boolean).join(' · ') || 'Neighbor'}
            </div>
            {u.about && <p className="text-[13px] text-ink-2 leading-[1.55] mt-1 break-words">{u.about}</p>}
          </div>
        </div>
        <p className="text-[12px] text-muted mt-3 leading-relaxed">{HOST_REVIEWS_REQUESTS}</p>
      </section>

      {/* Fails closed: renders nothing unless the endpoint says this viewer is
          the host or a confirmed participant. Signed-out visitors do not ask at
          all, since the answer is always 401. */}
      <ConfirmedRoster planId={plan.id} enabled={Boolean(currentUser)} />

      {/* Capacity, drawn and written. One segment per spot the host offered,
          filled where it is still open; the sentence beside it is the fact. */}
      <div className="bg-cream-2 border border-[var(--border)] rounded-xl px-5 py-4 mb-6">
        <div className="text-[12px] text-muted mb-2">Spots available</div>
        <CapacityMeter
          spotsLeft={isFull ? 0 : plan.spots_left}
          spotsTotal={plan.spots_total}
        />
      </div>

      {error && <div className="bg-danger/10 border border-danger/25 text-danger text-[13px] rounded-xl px-4 py-3 mb-4" role="alert">{error}</div>}

      {isOwn ? (
        <div className="flex flex-col gap-2.5">
          <div className="bg-cream-2 border border-[var(--border)] rounded-xl px-5 py-3.5 text-[13px] text-muted flex items-center gap-2">
            <NoteIcon className="flex-shrink-0" />
            <span>This is your plan. When someone messages, you see who they are and decide.</span>
          </div>
          <div className="flex gap-2">
            <Link href={`/plan/${plan.slug}/edit`} className="btn btn-ghost flex-1">Edit plan</Link>
            <button type="button" onClick={deletePlan} disabled={deleting}
              className="flex-1 px-4 py-2 rounded-full border border-danger/30 text-danger text-[13px] hover:bg-danger/5">
              {deleting ? 'Deleting…' : 'Delete plan'}
            </button>
          </div>
        </div>
      ) : existingConv && !showMessageBox ? (
        // Before the full-plan branch on purpose: the person whose confirmation
        // took the last spot is not a latecomer, and telling them to post their
        // own plan would be both wrong and cold.

        <>
          <Link href={`/inbox/${existingConv.id}`} className="btn btn-accent btn-full btn-lg">Open conversation →</Link>
          {requestState && (
            <p className="text-[12px] text-muted text-center mt-2" role="status">
              <span className="font-medium text-ink-2">{requestState.label}.</span> {requestState.line}
            </p>
          )}
          {/* Leaving is not a trap. Asking again is one deliberate tap, with a
              new opener, and the host decides again from scratch. */}
          {existingConv.status === 'withdrawn' && (
            <button type="button"
              onClick={() => { setAskingAgain(true); setShowMessageBox(true); }}
              className="btn btn-ghost btn-full mt-2">
              Ask {hostFirstName} to join again
            </button>
          )}
          {existingConv.status === 'declined' && (
            <p className="text-[12px] text-muted text-center mt-2">
              That decision stands for this plan. You can still{' '}
              <Link href="/feed" className="text-accent font-medium hover:underline">browse other plans</Link>.
            </p>
          )}
        </>
      ) : isFull ? (
        <div className="bg-cream-2 border border-[var(--border)] rounded-xl px-5 py-3.5 text-[13px] text-muted">
          This plan is full, but you can <Link href="/post" className="text-accent font-medium hover:underline">post your own</Link>
        </div>
      ) : !currentUser ? (
        <>
          <Link href={`/auth?next=/plan/${plan.slug}`} className="btn btn-accent btn-full btn-lg">
            Create an account to message {hostFirstName} →
          </Link>
          <p className="text-[12px] text-muted text-center mt-2">{planMessageCta(hostFirstName)}</p>
        </>
      ) : showMessageBox ? (
        <div className="flex flex-col gap-3">
          <label htmlFor="plan-opener" className="text-[12px] text-ink-2">
            {askingAgain
              ? `You left this plan earlier. Say why you would like back in, and ${hostFirstName} decides again.`
              : 'Say what brings you to this one. A line or two is plenty.'}
          </label>
          <textarea id="plan-opener" value={messageText} onChange={e => setMessageText(e.target.value)}
            rows={4} maxLength={2000} placeholder={`e.g. I'm around that morning and have been meaning to try it. Mind if I come?`}
            className="input resize-none" autoFocus />
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowMessageBox(false); setAskingAgain(false); }}
              className="btn btn-ghost flex-1">Cancel</button>
            <button type="button" onClick={sendOpener} disabled={messaging} aria-busy={messaging}
              className="btn btn-accent flex-1">
              {messaging && <span className="spinner" aria-hidden="true" />}
              Send →
            </button>
          </div>
          <p className="text-[11px] text-muted text-center">{MESSAGING_NOT_A_RESERVATION}</p>
        </div>
      ) : (
        <>
          <button type="button" onClick={() => setShowMessageBox(true)} className="btn btn-accent btn-full btn-lg">
            Message {hostFirstName} →
          </button>
          <p className="text-[12px] text-muted text-center mt-2">{MESSAGING_NOT_A_RESERVATION}</p>
        </>
      )}
      {showShareToast && <div className="toast show">Link copied</div>}
    </>
  );
}