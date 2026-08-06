'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import PageMain from '@/components/PageMain';
import Avatar from '@/components/Avatar';
import SafetyCard from '@/components/SafetyCard';
import RequesterCard from '@/components/RequesterCard';
import ConfirmedRoster from '@/components/ConfirmedRoster';
import { createClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/utils';
import { stateCopy } from '@/lib/conversation-lifecycle';
import type { RequesterPreview } from '@/lib/participants';

export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const convId = params.id as string;
  const supabase = createClient();

  const [conv, setConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState(false);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [requester, setRequester] = useState<RequesterPreview | null>(null);
  const [actionError, setActionError] = useState('');

  async function blockUser() {
    if (!conv) return;
    const isPoster = conv.poster_id === currentUser;
    const otherId = isPoster ? conv.joiner_id : conv.poster_id;
    const otherName = (isPoster ? conv.joiner : conv.poster)?.name ?? 'this person';
    if (!confirm(`Block ${otherName}? They won't see your plans or be able to message you, and you won't see theirs. They won't be told.`)) return;
    setBlocking(true);
    const res = await fetch('/api/block', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockedId: otherId })
    });
    setBlocking(false);
    if (res.ok) {
      router.push('/inbox');
    } else {
      alert('Could not block. Try again.');
    }
  }
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }
      setCurrentUser(user.id);

      const { data } = await supabase
        .from('conversations')
        .select(`
          *,
          plan:plans(id, slug, text, when_day, when_time, spot, status),
          poster:profiles!conversations_poster_id_fkey(id, name:display_name, initials, avatar_bg, avatar_fg),
          joiner:profiles!conversations_joiner_id_fkey(id, name:display_name, initials, avatar_bg, avatar_fg)
        `)
        .eq('id', convId)
        .single();

      if (!data) { router.push('/inbox'); return; }
      setConv(data);

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });
        setMessages(msgs || []);

        // The private requester card. The endpoint only answers with it when
        // the caller is the host of this conversation.
        fetch(`/api/conversations?conversationId=${convId}`)
          .then(r => (r.ok ? r.json() : null))
          .then(d => { if (d?.requester) setRequester(d.requester as RequesterPreview); })
          .catch(() => {});

        // Mark this conversation as seen
        fetch('/api/unread/seen', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: convId })
        }).catch(() => {});
    }
    load();

    // Realtime subscription
    const channel = supabase
      .channel(`conv:${convId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
        (payload) => {
          setMessages(m => {
            // Avoid duplicate if we just inserted locally
            if (m.find(x => x.id === payload.new.id)) return m;
            return [...m, payload.new];
          });
          fetch('/api/unread/seen', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId: convId })
          }).catch(() => {});
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${convId}` },
        (payload) => setConv((c: any) => ({ ...c, status: payload.new.status }))
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [convId]);

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);

    const res = await fetch('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: convId, text: t })
    });
    const data = await res.json();
    if (res.ok) {
      setMessages(m => [...m, data.message]);
      setText('');
    }
    setSending(false);
  }

  async function act(action: 'confirm' | 'decline' | 'withdraw') {
    if (acting) return;
    if (action === 'withdraw' && !confirm('Leave this plan? Your spot goes back to the host.')) return;
    setActing(true);
    setActionError('');
    const res = await fetch('/api/conversations', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: convId, action })
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      const next = data?.status ?? (action === 'confirm' ? 'confirmed' : action === 'decline' ? 'declined' : 'withdrawn');
      setConv((c: any) => ({ ...c, status: next }));
      if (action !== 'withdraw') setRequester(r => (r ? { ...r, status: next } : r));
    } else {
      setActionError(data?.error ?? 'Could not do that. Try again.');
    }
    setActing(false);
  }

  if (!conv || !currentUser) {
    return (
      <>
        <Nav />
        <PageMain className="max-w-[640px] mx-auto px-6 py-20 text-center text-muted text-sm">Loading…</PageMain>
      </>
    );
  }

  const isPoster = conv.poster_id === currentUser;
  const other = isPoster ? conv.joiner : conv.poster;
  const showAcceptBar = isPoster && conv.status === 'pending' && messages.length > 0;
  const state = stateCopy(conv.status);
  // The requester, and only the requester, can leave. A host declines instead.
  const canWithdraw = !isPoster && (conv.status === 'pending' || conv.status === 'confirmed');

  return (
    <div className="flex flex-col h-screen">
      <Nav />
      <PageMain className="flex-1 flex flex-col max-w-[640px] mx-auto w-full">
        {/* Header */}
        <div className="border-b border-[var(--border)] px-5 py-3.5 flex items-center gap-3.5 bg-cream sticky top-[58px] z-10">
          <Link href="/inbox" className="text-[13px] text-muted hover:text-ink">←</Link>
          <Avatar
            userId={other.id}
            name={other.name}
            initials={other.initials}
            bg={other.avatar_bg}
            fg={other.avatar_fg}
            size={36}
            radius={10}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-medium text-ink">{other.name}</div>
            <Link href={`/plan/${conv.plan?.slug}`} className="text-[12px] text-muted hover:text-ink truncate block">
              {conv.plan?.text?.substring(0, 60)}{conv.plan?.text?.length > 60 ? '…' : ''}
            </Link>
          </div>
          <span className={`text-[11px] px-2.5 py-1 rounded-full font-mono flex-shrink-0 ${
            conv.status === 'confirmed' ? 'bg-[rgba(42,66,50,0.1)] text-sage' :
            conv.status === 'declined' || conv.status === 'withdrawn' ? 'bg-[rgba(20,17,13,0.07)] text-muted' :
            'bg-[rgba(138,104,30,0.12)] text-gold-2'
          }`}>
            <span className="sr-only">Status: </span>{state.label}
          </span>
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setMenuOpen(v => !v)} aria-expanded={menuOpen}
              aria-label="More options for this conversation"
              className="text-muted hover:text-ink px-2 py-1 text-lg leading-none">
              <span aria-hidden="true">⋯</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-card border border-[var(--border2)] rounded-lg shadow-lg py-1 min-w-[160px] z-50">
                <button type="button" onClick={() => { setMenuOpen(false); blockUser(); }} disabled={blocking}
                  className="block w-full text-left px-3 py-2 text-[13px] text-ink hover:bg-cream-2">
                  Block this person
                </button>
                <button type="button" onClick={() => { setMenuOpen(false); router.push(`/report?conversation=${convId}`); }}
                  className="block w-full text-left px-3 py-2 text-[13px] text-accent hover:bg-cream-2">
                  Report
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-2.5">
          {/* The same four words everywhere: what this state means for the spot. */}
          <p className="text-[12.5px] text-muted leading-relaxed" role="status">
            <span className="font-medium text-ink-2">{state.label}.</span> {state.line}
            {/* The thread ends here, but the plan is where asking again lives,
                because it needs a new opener and the host's decision. */}
            {!isPoster && conv.status === 'withdrawn' && conv.plan?.slug && (
              <>
                {' '}
                <Link href={`/plan/${conv.plan.slug}`} className="text-accent font-medium hover:underline">
                  Ask to join again on the plan
                </Link>
                .
              </>
            )}
          </p>
          {requester && conv.status === 'pending' && <RequesterCard requester={requester} />}
          {conv.status === 'confirmed' && conv.plan?.id && <ConfirmedRoster planId={conv.plan.id} />}
          {conv.status === 'confirmed' && (
            <SafetyCard plan={conv.plan} otherName={other.name} />
          )}
          {messages.length === 0 ? (
            <div className="text-center text-muted text-sm py-6">Start the conversation ↓</div>
          ) : messages.map(m => {
            const isMe = m.from_user_id === currentUser;
            return (
              <div key={m.id} className={`flex flex-col max-w-[78%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                <div className={`px-3.5 py-2.5 rounded-[14px] text-[13.5px] leading-[1.55] ${
                  isMe ? 'bg-ink text-cream rounded-br-[4px]' : 'bg-card border border-[var(--border)] text-ink rounded-bl-[4px]'
                }`}>{m.text}</div>
                <div className="text-[10px] text-muted font-mono mt-1 px-0.5">{timeAgo(m.created_at)}</div>
              </div>
            );
          })}
          <div ref={msgsEndRef} />
        </div>

        {actionError && (
          <div className="bg-danger/10 border-t border-danger/25 text-danger text-[13px] px-5 py-3" role="alert">
            {actionError}
          </div>
        )}

        {/* Accept bar (host only). Two separate, explicit decisions. */}
        {showAcceptBar && (
          <div className="bg-[rgba(42,66,50,0.08)] border-t border-[rgba(42,66,50,0.15)] px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[13px] text-sage">Confirm this person, or decline</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => act('decline')} disabled={acting} aria-busy={acting}
                className="btn btn-sm btn-ghost">Decline</button>
              <button type="button" onClick={() => act('confirm')} disabled={acting} aria-busy={acting}
                className="btn btn-sm" style={{ background: '#2A4232', color: '#fff' }}>
                {acting && <span className="spinner" aria-hidden="true" />}
                Accept
              </button>
            </div>
          </div>
        )}

        {/* Leaving is the requester's own decision, and it hands the spot back. */}
        {canWithdraw && (
          <div className="border-t border-[var(--border)] px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[12.5px] text-muted">
              {conv.status === 'confirmed'
                ? 'Week changed? You can leave before the plan happens.'
                : 'Changed your mind? You can withdraw this request.'}
            </span>
            <button type="button" onClick={() => act('withdraw')} disabled={acting} aria-busy={acting}
              className="text-[12.5px] px-3 py-1.5 rounded-full border border-danger/30 text-danger hover:bg-danger/5 inline-flex items-center gap-1.5">
              {acting && <span className="spinner" aria-hidden="true" />}
              {conv.status === 'confirmed' ? 'Leave the plan' : 'Withdraw'}
            </button>
          </div>
        )}

        {/* Input */}
        {conv.status !== 'declined' && conv.status !== 'withdrawn' && (
          <div className="border-t border-[var(--border)] px-5 py-3 flex items-end gap-2 bg-cream">
            <label htmlFor="chat-message" className="sr-only">Message {other.name}</label>
            {/* 16px below sm so mobile Safari does not zoom the page on focus and
                leave the thread scrolled sideways; the design's 13.5px from sm up. */}
            <textarea
              id="chat-message"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              placeholder="Say something…"
              className="flex-1 bg-card border border-[var(--border2)] rounded-[12px] px-3.5 py-2.5 text-[16px] sm:text-[13.5px] text-ink resize-none outline-none focus:border-accent/40 max-h-[120px]"
            />
            <button type="button" onClick={send} disabled={!text.trim() || sending} aria-label="Send message"
              className="w-[38px] h-[38px] rounded-[11px] bg-ink text-cream flex items-center justify-center hover:bg-accent disabled:opacity-40">
              <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </PageMain>
    </div>
  );
}
