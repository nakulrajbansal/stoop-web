'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useCityPreference, cityLabel, type CityPref } from '@/lib/city-preference';

type Profile = {
  id: string;
  name: string;
  initials: string | null;
  avatar_bg: string;
  avatar_fg: string;
};

export default function Nav() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [unreadCount] = useState(0);
  const [cityPref, setCityPref] = useCityPreference();
  const [pickerOpen, setPickerOpen] = useState(false);
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) setProfile(null); else load();
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  function pickCity(c: CityPref) {
    setCityPref(c);
    setPickerOpen(false);
    if (typeof window !== 'undefined') router.refresh();
  }

  const cityDisplay = cityLabel(cityPref);
  const isPicked = cityPref !== null;

  return (
    <nav className="sticky top-0 z-50 flex items-center gap-3 px-6 sm:px-9 h-[58px] bg-cream/90 backdrop-blur border-b border-[var(--border)]">
      <Link href="/" className="font-serif text-[20px] font-bold tracking-tight">
        St<em className="not-italic text-accent italic">oo</em>p
      </Link>

      {/* City picker pill */}
      <div className="relative">
        <button
          onClick={() => setPickerOpen(v => !v)}
          className="flex items-center gap-1.5 text-xs ml-1 px-2 py-1 rounded-md hover:bg-cream-2 transition"
        >
          <span className={`w-1.5 h-1.5 rounded-full inline-block ${isPicked ? 'bg-accent' : 'bg-muted'}`}></span>
          <span className={isPicked ? 'text-ink-2' : 'text-muted italic'}>{cityDisplay}</span>
          <span className="text-[9px] text-muted">▾</span>
        </button>
        {pickerOpen && (
          <div className="absolute top-full left-0 mt-1 bg-card border border-[var(--border2)] rounded-lg shadow-lg py-1 min-w-[160px] z-50">
            <button onClick={() => pickCity('nyc')} className={`block w-full text-left px-3 py-2 text-[13px] hover:bg-cream-2 ${cityPref === 'nyc' ? 'text-accent font-medium' : 'text-ink'}`}>
              New York City
            </button>
            <button onClick={() => pickCity('austin')} className={`block w-full text-left px-3 py-2 text-[13px] hover:bg-cream-2 ${cityPref === 'austin' ? 'text-accent font-medium' : 'text-ink'}`}>
              Austin
            </button>
            {isPicked && (
              <>
                <div className="border-t border-[var(--border)] my-1"></div>
                <button onClick={() => pickCity(null)} className="block w-full text-left px-3 py-2 text-[12px] text-muted hover:bg-cream-2">
                  Show both
                </button>
              </>
            )}
          </div>
        )}
      </div>

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