'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import PageMain from '@/components/PageMain';
import Avatar, { avatarSrc } from '@/components/Avatar';
import { toAvatarJpeg } from '@/lib/avatar-image';
import { createClient } from '@/lib/supabase/client';

/**
 * The one screen that may show you your own private full name.
 *
 * It used to select profiles.name straight from the browser. The postdeploy
 * hardening migration revokes that column from the authenticated role, so the
 * row came back empty, this page read empty as "no profile" and pushed a
 * signed-in person to /auth on every visit. The private fields now come from
 * /api/profile, which holds the service role, derives the user from the session
 * and accepts no id from anybody.
 *
 * The redirect rule that follows from that mistake: only a genuinely missing
 * session sends you to /auth. Every other failure is shown, not redirected.
 */
export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
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

  // Profile photo state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [photoVersion, setPhotoVersion] = useState<number | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }

      // The private fields come from the server, which reads them with the
      // service role. Nothing on this page asks PostgREST for profiles.name.
      const res = await fetch('/api/profile', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));

      // 401 means the session is gone, 404 means signup never finished: both
      // are answered at /auth. Anything else is a failure to report, because a
      // denied column looked exactly like a missing session and that is how a
      // signed-in person got told to sign in.
      if (res.status === 401 || res.status === 404) { router.push('/auth'); return; }
      if (!res.ok || !body?.profile) {
        setLoadError(body?.error || 'Could not load your profile right now. Try again in a moment.');
        return;
      }

      const data = body.profile;
      setProfile(data);

      // Find out whether this user already has a photo (drives the
      // Change/Remove buttons). A failed load just means no photo yet.
      const probe = new Image();
      probe.onload = () => setHasPhoto(true);
      probe.src = avatarSrc(user.id, Date.now());
      setName(data.name || '');
      setCity(data.city?.slug || 'nyc');
      setNeighborhood(data.neighborhood?.slug || '');
      setAbout(data.about || '');
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

    // Slugs, not ids, and the name exactly as it was typed. The server resolves
    // the neighborhood inside the chosen city, normalizes the name and derives
    // the initials, because the public projection is generated from the name it
    // stores: a name normalized here and there could differ, and only one of
    // the two would be what neighbors see.
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, city, neighborhood, about })
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);

    if (res.status === 401) { router.push('/auth'); return; }
    if (!res.ok || !body?.profile) {
      setToast(body?.error || 'Could not save your profile right now. Try again in a moment.');
      setTimeout(() => setToast(''), 2500);
      return;
    }

    // What the database actually stored, not what was typed at it.
    const saved = body.profile;
    setName(saved.name);
    setProfile({ ...profile, name: saved.name, initials: saved.initials });
    setToast('Profile saved');
    setTimeout(() => setToast(''), 2500);
  }

  async function onPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || photoBusy) return;
    setPhotoBusy(true);
    try {
      const jpeg = await toAvatarJpeg(file);
      const form = new FormData();
      form.append('file', jpeg, 'avatar.jpg');
      const res = await fetch('/api/avatar', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setHasPhoto(true);
      setPhotoVersion(data.version ?? Date.now());
      setToast('Photo updated');
    } catch (err: any) {
      setToast(err?.message || 'Could not upload that photo');
    } finally {
      setPhotoBusy(false);
      setTimeout(() => setToast(''), 2500);
    }
  }

  async function removePhoto() {
    if (photoBusy) return;
    setPhotoBusy(true);
    const res = await fetch('/api/avatar', { method: 'DELETE' });
    setPhotoBusy(false);
    if (res.ok) {
      setHasPhoto(false);
      setPhotoVersion(Date.now());
      setToast('Photo removed');
    } else {
      setToast('Could not remove photo');
    }
    setTimeout(() => setToast(''), 2500);
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
        <PageMain className="max-w-[480px] mx-auto px-6 py-20 text-center text-sm">
          {loadError
            ? <p className="text-danger leading-relaxed">{loadError}</p>
            : <span className="text-muted">Loading…</span>}
        </PageMain>
      </>
    );
  }

  return (
    <>
      <Nav />
      <PageMain className="max-w-[480px] mx-auto px-6 py-10 pb-20">
        <div className="flex items-center gap-4 mb-7">
          {/* key remounts the avatar so a fresh upload shows immediately */}
          <Avatar
            key={photoVersion ?? 'initial'}
            userId={profile.id}
            name={profile.name}
            initials={profile.initials}
            bg={profile.avatar_bg}
            fg={profile.avatar_fg}
            size={56}
            radius={16}
            version={photoVersion}
          />
          <div className="flex-1 min-w-0">
            <div className="font-serif text-[24px] font-bold tracking-tight flex items-center gap-2">
              {profile.name}
              {profile.is_founding_member && (
                <span className="text-[10px] font-mono uppercase tracking-wider bg-accent text-white px-2 py-0.5 rounded-full">Founding</span>
              )}
            </div>
            <div className="text-[13px] text-muted">{profile.neighborhood?.name}</div>
            <div className="flex items-center gap-3 mt-1.5">
              <button onClick={() => fileInputRef.current?.click()} disabled={photoBusy}
                className="text-[12px] text-accent font-medium hover:underline disabled:opacity-50">
                {photoBusy ? 'Working…' : hasPhoto ? 'Change photo' : 'Add a photo'}
              </button>
              {hasPhoto && !photoBusy && (
                <button onClick={removePhoto}
                  className="text-[12px] text-muted hover:text-ink">
                  Remove
                </button>
              )}
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onPhotoPicked} className="hidden" />
        </div>

        <p className="text-[12px] text-muted leading-relaxed mb-6 -mt-3">
          One photo, shown next to your plans and messages. A real face makes people much more comfortable joining.
        </p>

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
      </PageMain>

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