'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Profile = {
  id: string;
  name: string;
  initials: string | null;
  avatar_bg: string;
  avatar_fg: string;
};

export default function Nav() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('id, name, initials, avatar_bg, avatar_fg')
        .eq('id', user.id)
        .single();
      if (mounted && data) setProfile(data);
    }
    load();
    async function loadUnread() {
      try {
        const res = await fetch('/api/unread');
        const data = await res.json();
        setUnreadCount(data.count ?? 0);
      } catch {}
    }
    loadUnread();
    const interval = setInterval(loadUnread, 30000); // refresh every 30s
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) setProfile(null); else load();
    });
    return () => { mounted = false; subscription.unsubscribe(); clearInterval(interval); };
  }, []);

  return (
    <nav className="sticky top-0 z-50 flex items-center gap-3 px-6 sm:px-9 h-[58px] bg-cream/90 backdrop-blur border-b border-[var(--border)]">
      <Link href="/" className="font-serif text-[20px] font-bold tracking-tight">
        St<em className="not-italic text-accent italic">oo</em>p
      </Link>

      <div className="flex-1" />

      {profile ? (
        <>
          <Link href="/feed" className="text-sm text-ink-2 hover:text-ink hidden sm:block">Browse</Link>
          <Link href="/my-plans" className="text-sm text-ink-2 hover:text-ink hidden sm:block">My Plans</Link>
          <Link href="/inbox" className="text-sm text-ink-2 hover:text-ink relative">
            Inbox
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-3 w-4 h-4 rounded-full bg-accent text-white text-[9px] font-mono flex items-center justify-center">{unreadCount}</span>
            )}
          </Link>
          <Link href="/post" className="btn btn-accent btn-sm">
            <span className="hidden sm:inline">+ Post a plan</span>
            <span className="sm:hidden">+</span>
          </Link>
          <Link
            href="/profile"
            className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-[11px] font-semibold"
            style={{ background: profile.avatar_bg, color: profile.avatar_fg }}
          >
            {profile.initials || profile.name[0]?.toUpperCase()}
          </Link>
        </>
      ) : (
        <>
          <Link href="/feed" className="btn btn-ghost btn-sm">Browse</Link>
          <Link href="/auth" className="btn btn-primary btn-sm">Sign in</Link>
        </>
      )}
    </nav>
  );
}