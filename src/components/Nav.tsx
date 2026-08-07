'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Avatar from '@/components/Avatar';

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
      // name:display_name, never name. The postdeploy hardening migration
      // revokes profiles.name from the authenticated role, and a denied column
      // here does not fail loudly: the row comes back empty, profile stays
      // null, and the header tells a signed-in person to sign in.
      const { data } = await supabase
        .from('profiles')
        .select('id, name:display_name, initials, avatar_bg, avatar_fg')
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
    <nav aria-label="Main" className="sticky top-0 z-50 flex items-center gap-2 sm:gap-3 px-4 sm:px-9 h-[58px] bg-cream/90 backdrop-blur border-b border-[var(--border)]">
      <Link href="/" className="font-serif text-[20px] font-bold tracking-tight">
        St<em className="not-italic text-accent italic">oo</em>p
      </Link>

      <div className="flex-1" />

      {profile ? (
        <>
          <Link href="/feed" className="text-[13px] sm:text-sm text-ink-2 hover:text-ink">Browse</Link>
          <Link href="/my-plans" className="text-[13px] sm:text-sm text-ink-2 hover:text-ink">My Plans</Link>
          <Link href="/inbox" className="text-sm text-ink-2 hover:text-ink relative">
            Inbox
            {unreadCount > 0 && (
              <>
                <span aria-hidden="true" className="absolute -top-1 -right-3 w-4 h-4 rounded-full bg-accent text-white text-[9px] font-mono flex items-center justify-center">{unreadCount}</span>
                <span className="sr-only">, {unreadCount} unread</span>
              </>
            )}
          </Link>
          <Link href="/post" aria-label="Post a plan" className="btn btn-accent btn-sm">
            <span aria-hidden="true" className="hidden sm:inline">+ Post a plan</span>
            <span aria-hidden="true" className="sm:hidden">+</span>
          </Link>
          <Link href="/profile" aria-label="Your profile" className="flex">
            <Avatar
              userId={profile.id}
              name={profile.name}
              initials={profile.initials}
              bg={profile.avatar_bg}
              fg={profile.avatar_fg}
              size={30}
              radius={9}
            />
          </Link>
        </>
      ) : (
        /* Four ways in, where there used to be two.
           Browse and Sign in were the whole signed-out header, on a site whose
           argument is "post a plan": somebody who had decided to post had to
           work out that Sign in also made accounts, and somebody who just
           wanted an account had no button at all.

           Post a plan points at /post and not at /auth on purpose. The composer
           lets anyone write the plan first, then saves the draft and sends them
           to /auth?next=post itself, so the half-written plan survives the
           detour. Sending them to sign up first would lose it.

           Four actions and a wordmark do not fit across 320px, so Sign in steps
           out of the row below the sm breakpoint. It is the one an existing
           member needs least urgently from here, because both auth doors carry
           the way across to the other, and the two things a first-time visitor
           came to do stay visible at every width. */
        <>
          <Link href="/feed"
            className="inline-flex items-center min-h-[40px] px-1 text-[13px] sm:text-sm text-ink-2 hover:text-ink">
            Browse
          </Link>
          <Link href="/auth?mode=signin"
            className="hidden sm:inline-flex items-center min-h-[40px] px-1 text-sm text-ink-2 hover:text-ink">
            Sign in
          </Link>
          <Link href="/post" className="btn btn-ghost btn-sm btn-nav min-h-[40px]">Post a plan</Link>
          <Link href="/auth?mode=signup" className="btn btn-accent btn-sm btn-nav min-h-[40px]">Sign up</Link>
        </>
      )}
    </nav>
  );
}