'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Avatar from '@/components/Avatar';
import { createClient } from '@/lib/supabase/client';
import { timeAgo } from '@/lib/utils';

export default function InboxPage() {
  const router = useRouter();
  const supabase = createClient();
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }
      setCurrentUser(user.id);

      const res = await fetch('/api/conversations');
      const data = await res.json();
      setConversations(data.conversations || []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <>
      <Nav />
      <div className="max-w-[640px] mx-auto px-6 py-10 pb-20">
        <h2 className="font-serif text-[32px] font-bold tracking-tight mb-6">Inbox</h2>

        {loading ? (
          <div className="text-center text-muted text-sm py-12">Loading…</div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-16 text-muted">
            <div className="text-4xl opacity-20 mb-3">💬</div>
            <p className="text-sm">No conversations yet.<br />Message someone&apos;s plan to get started.</p>
            <Link href="/feed" className="btn btn-primary btn-sm mt-4 inline-flex">Browse plans</Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {conversations.map(c => {
              const isPoster = c.poster_id === currentUser;
              const other = isPoster ? c.joiner : c.poster;
              const lastMsg = c.messages?.[c.messages.length - 1];
              const isClosed = c.status === 'confirmed' || c.status === 'declined';
              const unread = lastMsg && lastMsg.from_user_id !== currentUser && !isClosed;

              const statusLabel =
                c.status === 'confirmed' ? 'Confirmed' :
                c.status === 'declined' ? 'Declined' : null;
              const statusClass =
                c.status === 'confirmed' ? 'text-sage bg-[rgba(42,66,50,0.08)]' :
                'text-muted bg-[rgba(20,17,13,0.06)]';

              return (
                <Link key={c.id} href={`/inbox/${c.id}`}
                  className={`bg-card border border-[var(--border)] rounded-2xl px-4 py-3.5 flex items-start gap-3.5 hover:border-accent/25 hover:shadow-sm transition-all ${c.status === 'declined' ? 'opacity-60' : ''}`}>
                  <Avatar
                    userId={other.id}
                    name={other.name}
                    initials={other.initials}
                    bg={other.avatar_bg}
                    fg={other.avatar_fg}
                    size={40}
                    radius={11}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[13.5px] font-medium text-ink flex items-center gap-2">
                        {other.name}
                        {statusLabel && (
                          <span className={`text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded-full ${statusClass}`}>
                            {statusLabel}
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-muted font-mono">
                        {lastMsg ? timeAgo(lastMsg.created_at) : 'New'}
                      </span>
                    </div>
                    <div className="text-[12px] text-accent truncate mb-1">
                      {c.plan?.text?.substring(0, 55)}{c.plan?.text?.length > 55 ? '…' : ''}
                    </div>
                    <div className="text-[12.5px] text-muted truncate">
                      {lastMsg ? lastMsg.text.substring(0, 60) : 'Say hello →'}
                    </div>
                  </div>
                  {unread && <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mt-2" />}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
