'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { createClient } from '@/lib/supabase/client';

export default function MyPlansPage() {
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<'posted' | 'joined'>('posted');
  const [posted, setPosted] = useState<any[]>([]);
  const [joined, setJoined] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }

      const [postedRes, convsRes] = await Promise.all([
        supabase.from('plans').select(`
          *,
          neighborhood:neighborhoods(name)
        `).eq('user_id', user.id).order('created_at', { ascending: false }),
        fetch('/api/conversations').then(r => r.json())
      ]);

      setPosted(postedRes.data || []);
      const joinedConvs = (convsRes.conversations || []).filter((c: any) => c.joiner_id === user.id);
      setJoined(joinedConvs);
      setLoading(false);
    }
    load();
  }, []);

  // Split posted plans by status
  const postedActive = posted.filter(p => p.status === 'open' || p.status === 'full');
  const postedPast = posted.filter(p => p.status === 'expired' || p.status === 'removed');

  // Split joined conversations: past = plan ended OR conversation declined
  const joinedActive = joined.filter((c: any) =>
    (c.plan?.status === 'open' || c.plan?.status === 'full') && c.status !== 'declined'
  );
  const joinedPast = joined.filter((c: any) =>
    c.plan?.status === 'expired' || c.plan?.status === 'removed' || c.status === 'declined'
  );

  function sectionHeader(label: string, count: number) {
    return (
      <div className="flex items-center gap-3 mb-3 mt-7 first:mt-0">
        <h3 className="text-[11px] font-mono uppercase tracking-wider text-muted">{label}</h3>
        <div className="flex-1 h-px bg-[var(--border)]"></div>
        <span className="text-[11px] text-muted font-mono">{count}</span>
      </div>
    );
  }

  function renderPostedCard(p: any, isPast: boolean) {
    const statusCls = isPast
      ? 'bg-[rgba(20,17,13,0.07)] text-muted'
      : p.status === 'full'
        ? 'bg-[rgba(20,17,13,0.07)] text-muted'
        : 'bg-[rgba(47,107,63,0.09)] text-accent';
    const statusTxt =
      p.status === 'open' ? 'Open' :
      p.status === 'full' ? 'Full' :
      p.status === 'expired' ? 'Expired' :
      p.status === 'removed' ? 'Removed' : p.status;

    return (
      <Link key={p.id} href={`/plan/${p.slug}`}
        className={`bg-card border border-[var(--border)] rounded-2xl px-5 py-4 hover:border-accent/25 hover:shadow-sm transition-all ${isPast ? 'opacity-65' : ''}`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="text-[14px] italic text-ink leading-snug flex-1">
            {p.text.substring(0, 90)}{p.text.length > 90 ? '…' : ''}
          </div>
          <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${statusCls}`}>{statusTxt}</span>
        </div>
        <div className="text-[11.5px] text-muted flex items-center gap-1.5">
          <span>{p.when_day}{p.when_time_specific ? ` · ${p.when_time_specific}` : p.when_time ? ` · ${p.when_time}` : ''}</span>
          <span className="opacity-30">·</span>
          <span>{p.neighborhood?.name}</span>
        </div>
      </Link>
    );
  }

  function renderJoinedCard(c: any, isPast: boolean) {
    const statusCls = c.status === 'confirmed' ? 'bg-[rgba(42,66,50,0.09)] text-sage'
      : c.status === 'declined' ? 'bg-[rgba(20,17,13,0.07)] text-muted'
      : 'bg-[rgba(138,104,30,0.12)] text-gold';
    const statusTxt = c.status === 'confirmed' ? 'Confirmed' : c.status === 'declined' ? 'Declined' : 'Pending';

    return (
      <Link key={c.id} href={`/inbox/${c.id}`}
        className={`bg-card border border-[var(--border)] rounded-2xl px-5 py-4 hover:border-accent/25 hover:shadow-sm transition-all ${isPast ? 'opacity-65' : ''}`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="text-[14px] italic text-ink leading-snug flex-1">
            {c.plan?.text?.substring(0, 90)}{c.plan?.text?.length > 90 ? '…' : ''}
          </div>
          <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${statusCls}`}>{statusTxt}</span>
        </div>
        <div className="text-[11.5px] text-muted">
          with {c.poster?.name} · {c.plan?.when_day}
        </div>
      </Link>
    );
  }

  return (
    <>
      <Nav />
      <div className="max-w-[720px] mx-auto px-6 py-10 pb-20">
        <h2 className="font-serif text-[32px] font-bold tracking-tight mb-5">My Plans</h2>

        <div className="flex border-b border-[var(--border)] mb-6">
          <button onClick={() => setTab('posted')}
            className={`px-5 py-2.5 text-[13px] font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
              tab === 'posted' ? 'text-ink border-accent' : 'text-muted border-transparent'
            }`}>
            Posted
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
              tab === 'posted' ? 'bg-accent/10 text-accent' : 'bg-cream-2 text-muted'
            }`}>{posted.length}</span>
          </button>
          <button onClick={() => setTab('joined')}
            className={`px-5 py-2.5 text-[13px] font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
              tab === 'joined' ? 'text-ink border-accent' : 'text-muted border-transparent'
            }`}>
            Joined
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
              tab === 'joined' ? 'bg-accent/10 text-accent' : 'bg-cream-2 text-muted'
            }`}>{joined.length}</span>
          </button>
        </div>

        {loading ? (
          <div className="text-center text-muted text-sm py-12">Loading…</div>
        ) : tab === 'posted' ? (
          posted.length === 0 ? (
            <div className="text-center py-12 text-muted">
              <p className="text-sm mb-4">No plans posted yet.</p>
              <Link href="/post" className="btn btn-accent btn-sm">Post your first plan</Link>
            </div>
          ) : (
            <>
              {postedActive.length > 0 && (
                <>
                  {sectionHeader('Active', postedActive.length)}
                  <div className="flex flex-col gap-2">
                    {postedActive.map(p => renderPostedCard(p, false))}
                  </div>
                </>
              )}
              {postedPast.length > 0 && (
                <>
                  {sectionHeader('Past', postedPast.length)}
                  <div className="flex flex-col gap-2">
                    {postedPast.map(p => renderPostedCard(p, true))}
                  </div>
                </>
              )}
              {postedActive.length === 0 && postedPast.length > 0 && (
                <div className="text-center py-6 text-muted mt-4">
                  <p className="text-[13px]">No active plans right now.</p>
                  <Link href="/post" className="btn btn-accent btn-sm mt-3 inline-flex">Post a new plan</Link>
                </div>
              )}
            </>
          )
        ) : (
          joined.length === 0 ? (
            <div className="text-center py-12 text-muted">
              <div className="text-3xl opacity-20 mb-3">🤝</div>
              <p className="text-sm mb-4">No plans joined yet.</p>
              <Link href="/feed" className="btn btn-accent btn-sm">Browse plans</Link>
            </div>
          ) : (
            <>
              {joinedActive.length > 0 && (
                <>
                  {sectionHeader('Active', joinedActive.length)}
                  <div className="flex flex-col gap-2">
                    {joinedActive.map((c: any) => renderJoinedCard(c, false))}
                  </div>
                </>
              )}
              {joinedPast.length > 0 && (
                <>
                  {sectionHeader('Past', joinedPast.length)}
                  <div className="flex flex-col gap-2">
                    {joinedPast.map((c: any) => renderJoinedCard(c, true))}
                  </div>
                </>
              )}
            </>
          )
        )}
      </div>
    </>
  );
}