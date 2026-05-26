'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { createClient } from '@/lib/supabase/client';

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [about, setAbout] = useState('');
  const [hoods, setHoods] = useState<{ slug: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // Delete account state
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }

      const { data } = await supabase
        .from('profiles')
        .select(`
          *,
          city:cities(slug, name),
          neighborhood:neighborhoods(slug, name)
        `)
        .eq('id', user.id)
        .single();

      if (!data) { router.push('/auth'); return; }
      setProfile(data);
      setName(data.name);
      setCity(data.city?.slug || 'nyc');
      setNeighborhood(data.neighborhood?.slug || '');
      setAbout(data.about || '');

      const { data: nb } = await supabase
        .from('neighborhoods')
        .select('slug, name')
        .eq('city_id', data.city_id);
      setHoods(nb || []);
    }
    load();
  }, []);

  useEffect(() => {
    async function loadHoods() {
      if (!city) return;
      const { data: cityRow } = await supabase.from('cities').select('id').eq('slug', city).single();
      if (!cityRow) return;
      const { data } = await supabase.from('neighborhoods').select('slug, name').eq('city_id', cityRow.id);
      setHoods(data || []);
    }
    loadHoods();
  }, [city]);

  async function save() {
    if (!name.trim() || !neighborhood) {
      setToast('Name and neighborhood required');
      setTimeout(() => setToast(''), 2500);
      return;
    }
    setSaving(true);

    const { data: cityRow } = await supabase.from('cities').select('id').eq('slug', city).single();
    const { data: nb } = await supabase.from('neighborhoods').select('id')
      .eq('city_id', cityRow!.id).eq('slug', neighborhood).single();

    const trimmed = name.trim();
    const initials = trimmed.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join('').substring(0, 2);

    const { error } = await supabase.from('profiles').update({
      name: trimmed,
      city_id: cityRow!.id,
      neighborhood_id: nb?.id ?? null,
      about: about.trim() || null,
      initials
    }).eq('id', profile.id);

    setSaving(false);
    setToast(error ? 'Could not save' : 'Profile saved');
    setTimeout(() => setToast(''), 2500);
    if (!error) setProfile({ ...profile, name: trimmed, initials });
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  async function deleteAccount() {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setToast('Type DELETE to confirm');
      setTimeout(() => setToast(''), 2500);
      return;
    }
    setDeleting(true);
    const res = await fetch('/api/account', { method: 'DELETE' });
    if (res.ok) {
      await supabase.auth.signOut();
      router.push('/');
    } else {
      setDeleting(false);
      setToast('Could not delete account');
      setTimeout(() => setToast(''), 2500);
    }
  }

  if (!profile) {
    return (
      <>
        <Nav />
        <div className="max-w-[480px] mx-auto px-6 py-20 text-center text-muted text-sm">Loading…</div>
      </>
    );
  }

  return (
    <>
      <Nav />
      <div className="max-w-[480px] mx-auto px-6 py-10 pb-20">
        <div className="flex items-center gap-4 mb-7">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-[18px] font-semibold"
            style={{ background: profile.avatar_bg, color: profile.avatar_fg }}>
            {profile.initials || profile.name[0]}
          </div>
          <div>
            <div className="font-serif text-[24px] font-bold tracking-tight flex items-center gap-2">
              {profile.name}
              {profile.is_founding_member && (
                <span className="text-[10px] font-mono uppercase tracking-wider bg-accent text-white px-2 py-0.5 rounded-full">Founding</span>
              )}
            </div>
            <div className="text-[13px] text-muted">{profile.neighborhood?.name}</div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input" maxLength={50} />
          </div>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">City</label>
            <select value={city} onChange={e => { setCity(e.target.value); setNeighborhood(''); }} className="input cursor-pointer">
              <option value="nyc">New York City</option>
              <option value="austin">Austin</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Neighborhood</label>
            <select value={neighborhood} onChange={e => setNeighborhood(e.target.value)} className="input cursor-pointer">
              <option value="">Select area</option>
              {hoods.map(h => <option key={h.slug} value={h.slug}>{h.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">About you</label>
            <input type="text" value={about} onChange={e => setAbout(e.target.value)} className="input" maxLength={140}
              placeholder="One line about yourself…" />
          </div>
          <button onClick={save} disabled={saving} className="btn btn-primary btn-full mt-2">
            {saving ? <span className="spinner" /> : 'Save changes'}
          </button>

          <div className="mt-3 space-y-2">
            <button onClick={signOut}
              className="w-full py-3 rounded-xl bg-transparent border border-[var(--border2)] text-ink-2 text-[13px] hover:bg-cream-2">
              Sign out
            </button>
            <button onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3 rounded-xl bg-transparent border border-accent/30 text-accent text-[13px] hover:bg-accent/5">
              Delete account
            </button>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-card rounded-2xl max-w-[440px] w-full p-7 border border-[var(--border)]">
            <h3 className="font-serif text-[22px] font-bold text-ink mb-3">Delete your account?</h3>
            <p className="text-[13.5px] text-ink-2 leading-relaxed mb-5">
              This permanently removes your profile, every plan you&apos;ve posted, every conversation you&apos;ve started, and every message you&apos;ve sent. Cannot be undone.
            </p>
            <p className="text-[12px] text-muted mb-2">Type <strong className="text-ink font-mono">DELETE</strong> to confirm:</p>
            <input type="text" value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              className="input mb-5" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                className="btn btn-ghost flex-1">Cancel</button>
              <button onClick={deleteAccount} disabled={deleting}
                className="flex-1 py-2.5 px-4 rounded-full bg-accent text-white text-[13px] font-medium hover:bg-acc2 disabled:opacity-50">
                {deleting ? <span className="spinner" /> : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </>
  );
}