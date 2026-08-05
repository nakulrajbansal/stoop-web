'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Nav from '@/components/Nav';
import PageMain from '@/components/PageMain';
import { INTENT_TAGS, getDateChips } from '@/lib/utils';

const CATEGORIES = ['Coffee', 'Outdoors', 'Sports', 'Arts', 'Food', 'Books', 'Music'];
const CATEGORY_IDS: Record<string, string> = {
  Coffee: 'coffee', Outdoors: 'outdoors', Sports: 'sports', Arts: 'arts',
  Food: 'food', Books: 'books', Music: 'music'
};

const TIMES = ['Morning', 'Afternoon', 'Evening', 'Night'];

const DRAFT_KEY = 'stoop-plan-draft';

export default function PostPage() {
  const router = useRouter();
  const supabase = createClient();

  const [text, setText] = useState('');
  const [category, setCategory] = useState('Coffee');
  const [dateIso, setDateIso] = useState('');
  const [time, setTime] = useState('');
  const [specificTime, setSpecificTime] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [hoods, setHoods] = useState<{ slug: string; name: string }[]>([]);
  const [spot, setSpot] = useState('');
  const [spots, setSpots] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // null = still checking; false = browsing logged out (allowed; they sign
  // up at publish time and their draft survives the trip)
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [hoodGroups, setHoodGroups] = useState<{ city: string; hoods: { slug: string; name: string }[] }[]>([]);

  // Draft restored, so the save effect below can start writing. Without this
  // the first render would persist a blank draft over a real one.
  const [hydrated, setHydrated] = useState(false);
  // They wrote this plan, went through signup, and came back. Say so.
  const [resumedAfterAuth, setResumedAfterAuth] = useState(false);
  // The drafted neighborhood belongs to a different city than their account.
  // The API would quietly file the plan under their own neighborhood instead,
  // so make them re-pick rather than post it somewhere they did not choose.
  const [hoodNeedsRepick, setHoodNeedsRepick] = useState(false);
  // Only mark the fields they still owe us once they have tried to publish.
  const [showErrors, setShowErrors] = useState(false);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const dayRef = useRef<HTMLDivElement>(null);
  const hoodRef = useRef<HTMLSelectElement>(null);
  const spotsRef = useRef<HTMLDivElement>(null);

  const dateChips = getDateChips();

  useEffect(() => {
    // Restore a draft (e.g. written logged-out, finished after signup)
    let draftHood = '';
    let cameFromAuth = false;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.text) setText(d.text);
        if (d.category) setCategory(d.category);
        // Only restore the day if it is still one of the pickable chips
        if (d.dateIso && getDateChips().some(c => c.iso === d.dateIso)) setDateIso(d.dateIso);
        if (d.time) setTime(d.time);
        if (d.specificTime) setSpecificTime(d.specificTime);
        if (d.neighborhood) { setNeighborhood(d.neighborhood); draftHood = d.neighborhood; }
        if (d.spot) setSpot(d.spot);
        if (d.spots) setSpots(d.spots);
        if (Array.isArray(d.selectedTags)) setSelectedTags(d.selectedTags);
        cameFromAuth = d.awaitingAuth === true;
      }
    } catch {}

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // The generated Database types make these selects resolve to `never`,
        // so name the two columns we read rather than reach into `never`.
        const { data: profileRow } = await supabase.from('profiles').select('city_id, neighborhood_id').eq('id', user.id).single();
        const profile = profileRow as { city_id: string; neighborhood_id: string | null } | null;
        if (profile) {
          setSignedIn(true);
          if (cameFromAuth) setResumedAfterAuth(true);
          const { data: nb } = await supabase.from('neighborhoods').select('slug, name').eq('city_id', profile.city_id);
          const cityHoods = (nb ?? []) as { slug: string; name: string }[];
          setHoods(cityHoods);
          if (draftHood) {
            // Posting is scoped to the account's city, so a draft picked from
            // another city cannot be honored. Clear it and ask again.
            if (!cityHoods.some(h => h.slug === draftHood)) {
              setNeighborhood('');
              setHoodNeedsRepick(true);
            }
          } else if (profile.neighborhood_id) {
            const { data: ownRow } = await supabase.from('neighborhoods').select('slug').eq('id', profile.neighborhood_id).single();
            const own = ownRow as { slug: string } | null;
            if (own) setNeighborhood(own.slug);
          }
          setHydrated(true);
          return;
        }
      }
      // Logged out (or no profile yet): let them write the whole plan.
      // Show every neighborhood, grouped by city; publishing routes
      // through signup with the draft kept.
      setSignedIn(false);
      const { data: cities } = await supabase.from('cities').select('id, name').order('name');
      const { data: nb } = await supabase.from('neighborhoods').select('slug, name, city_id');
      const groups = (cities || []).map((c: any) => ({
        city: c.name,
        hoods: (nb || []).filter((h: any) => h.city_id === c.id)
      })).filter(g => g.hoods.length);
      setHoodGroups(groups);
      setHydrated(true);
    }
    load();
  }, []);

  // Keep the draft on disk as they write, not only when they press publish.
  // A backgrounded tab on iOS is reclaimed often, and losing a half-written
  // plan is the difference between coming back and not.
  useEffect(() => {
    if (!hydrated) return;
    const worthKeeping = text || dateIso || neighborhood || spot || specificTime || spots || selectedTags.length > 0;
    if (!worthKeeping) {
      // They emptied it. Drop the stored copy so a stale draft cannot come back.
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      return;
    }
    saveDraft(false);
  }, [hydrated, text, category, dateIso, time, specificTime, neighborhood, spot, spots, selectedTags]);

  const ready = text.length >= 25 && dateIso && neighborhood && spots;

  const missing: string[] = [];
  if (text.length < 25) missing.push(text.length === 0 ? 'the plan itself' : `${25 - text.length} more characters`);
  if (!dateIso) missing.push('which day');
  if (!neighborhood) missing.push('a neighborhood');
  if (!spots) missing.push('group size');

  function saveDraft(awaitingAuth: boolean) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        text, category, dateIso, time, specificTime, neighborhood, spot, spots, selectedTags, awaitingAuth
      }));
    } catch {}
  }

  function toggleTag(id: string) {
    setSelectedTags(prev => {
      if (prev.includes(id)) return prev.filter(t => t !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }

  // Take them to whatever is still missing instead of leaving a dead button.
  function goToFirstMissing() {
    const target =
      text.length < 25 ? textRef.current
      : !dateIso ? dayRef.current?.querySelector('button')
      : !neighborhood ? hoodRef.current
      : !spots ? spotsRef.current?.querySelector('button')
      : null;
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    (target as HTMLElement).focus({ preventScroll: true });
  }

  async function submit() {
    if (!ready) {
      setShowErrors(true);
      goToFirstMissing();
      return;
    }

    // Not signed in: park the draft and run them through signup.
    // The draft is restored when they land back here.
    if (!signedIn) {
      saveDraft(true);
      router.push('/auth?next=post');
      return;
    }

    setSubmitting(true); setError('');

    const selectedChip = dateChips.find(d => d.iso === dateIso);

    const res = await fetch('/api/plans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text, category: CATEGORY_IDS[category], spot: spot || null,
        whenDate: dateIso,
        whenDayLabel: selectedChip?.label ?? '',
        whenTime: time || null,
        whenTimeSpecific: specificTime || null,
        spots, neighborhoodSlug: neighborhood,
        intentTags: selectedTags
      })
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Could not post plan'); setSubmitting(false); return; }
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    router.push(`/plan/${data.plan.slug}?posted=1${data.becameFounding ? '&founding=1' : ''}`);
  }

  const missingText = text.length < 25 && showErrors;
  const missingDay = !dateIso && showErrors;
  const missingHood = !neighborhood && showErrors;
  const missingSpots = !spots && showErrors;

  return (
    <>
      <Nav />
      <PageMain className="max-w-[700px] mx-auto px-5 sm:px-6 py-10 pb-20">
        <div className="text-[11px] font-mono uppercase tracking-wider text-accent mb-2">Post a plan</div>
        <h1 className="font-serif text-[clamp(28px,4.5vw,44px)] font-bold tracking-[-1px] leading-[1.05] mb-1">
          What&apos;s the <em className="italic text-gold">plan?</em>
        </h1>
        <p className="text-[14px] text-muted mb-2">Write it like you&apos;d text a friend. Specific time, specific place.</p>
        <p className="text-[12.5px] text-gold-2 mb-10">The first 50 hosts become Founding members. The badge stays on everything you post.</p>

        {resumedAfterAuth && (
          <div className="bg-[rgba(42,66,50,0.08)] border-l-[3px] border-sage rounded-r-lg px-4 py-3 mb-8 -mt-6" role="status">
            <p className="text-[13px] text-ink-2 leading-relaxed">
              You&apos;re in, and your plan is exactly where you left it. Give it a last look, then publish.
            </p>
          </div>
        )}

        {signedIn === false && (
          <div className="bg-cream-2 border-l-[3px] border-accent rounded-r-lg px-4 py-3 mb-8 -mt-6">
            <p className="text-[13px] text-ink-2 leading-relaxed">
              Write it now; you&apos;ll create your account when you hit publish. Your plan is saved on this device as you type, so nothing gets lost on the way.
            </p>
          </div>
        )}

        <div className="space-y-8">
          <div>
            <label htmlFor="plan-text" className="text-[12px] font-mono uppercase tracking-wider text-muted block mb-2">
              Your plan
            </label>
            <textarea
              id="plan-text"
              ref={textRef}
              value={text} onChange={e => setText(e.target.value)}
              maxLength={220} rows={4}
              aria-describedby="plan-text-hint"
              placeholder="going to the farmers market saturday morning, making coffee first…"
              className={`w-full bg-card border rounded-2xl px-5 py-4 text-[16px] font-light text-ink placeholder:text-muted resize-none outline-none focus:border-accent/50 focus:shadow-[0_0_0_3px_rgba(47,107,63,0.08)] ${
                missingText ? 'border-danger/60' : 'border-[var(--border2)]'
              }`}
            />
            <div className="flex items-center justify-between mt-1.5">
              <span id="plan-text-hint" className="text-[11px] text-muted">
                {text.length < 25 ? `${25 - text.length} more characters to go` : 'Looks good'}
              </span>
              <span className={`text-[11px] font-mono ${text.length > 180 ? 'text-danger' : 'text-muted'}`}>
                {text.length} / 220
              </span>
            </div>
          </div>

          <div role="group" aria-labelledby="plan-category-label">
            <h2 id="plan-category-label" className="text-[12px] font-mono uppercase tracking-wider text-muted mb-2">What kind of plan?</h2>
            <p className="text-[12px] text-muted mb-3">Just for the feed filter.</p>
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIES.map(c => (
                <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
                  className={`px-4 py-2 rounded-full border text-[13px] ${
                    category === c
                      ? 'bg-accent border-accent text-white font-medium'
                      : 'bg-card border-[var(--border2)] text-ink-2 hover:border-accent/40 hover:text-ink'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div role="group" aria-labelledby="plan-day-label">
            <h2 id="plan-day-label" className="text-[12px] font-mono uppercase tracking-wider text-muted mb-2">
              Which day?{missingDay && <span className="text-danger normal-case tracking-normal"> Still needed</span>}
            </h2>
            <p className="text-[12px] text-muted mb-3">Up to two weeks out. Pick a rough time below, or set an exact one.</p>
            <div ref={dayRef} className="flex gap-1.5 flex-wrap mb-3">
              {dateChips.map(d => (
                <button key={d.iso} type="button" onClick={() => setDateIso(d.iso)} aria-pressed={dateIso === d.iso}
                  className={`px-4 py-2 rounded-full border text-[13px] ${
                  dateIso === d.iso ? 'bg-ink border-ink text-cream font-medium' : 'bg-card border-[var(--border2)] text-ink-2 hover:border-accent/40'
                }`}>{d.label}</button>
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap mb-3">
              <button type="button" onClick={() => setTime('')} aria-pressed={!time} className={`px-4 py-2 rounded-full border text-[13px] ${
                !time ? 'bg-cream-2 border-[var(--border2)] text-muted' : 'bg-card border-[var(--border2)] text-ink-2 hover:border-accent/40'
              }`}>No time</button>
              {TIMES.map(t => (
                <button key={t} type="button" onClick={() => setTime(t)} aria-pressed={time === t}
                  className={`px-4 py-2 rounded-full border text-[13px] ${
                  time === t ? 'bg-ink border-ink text-cream font-medium' : 'bg-card border-[var(--border2)] text-ink-2 hover:border-accent/40'
                }`}>{t}</button>
              ))}
            </div>
            <label htmlFor="plan-time" className="sr-only">Or a specific time</label>
            <input id="plan-time" type="text" value={specificTime} onChange={e => setSpecificTime(e.target.value)}
              placeholder="Or a specific time, e.g. 2:30 PM"
              maxLength={30}
              className="w-full bg-card border border-[var(--border2)] rounded-xl px-4 py-3 text-[16px] sm:text-[14px] text-ink placeholder:text-muted outline-none focus:border-accent/50" />
          </div>

          <div>
            <h2 className="text-[12px] font-mono uppercase tracking-wider text-muted mb-2">
              Where exactly?{missingHood && <span className="text-danger normal-case tracking-normal"> Still needed</span>}
            </h2>
            <p className="text-[12px] text-muted mb-3">The neighborhood alone isn&apos;t enough.</p>
            {hoodNeedsRepick && (
              <p className="text-[12px] text-ink-2 bg-cream-2 border-l-[3px] border-gold rounded-r-lg px-3 py-2 mb-2.5" role="status">
                You picked a neighborhood in another city before signing up. Plans post in your own city, so choose one here.
              </p>
            )}
            <label htmlFor="plan-hood" className="sr-only">Neighborhood</label>
            <select id="plan-hood" ref={hoodRef} value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
              className={`w-full bg-card border rounded-xl px-4 py-3 text-[16px] sm:text-[14px] text-ink outline-none focus:border-accent/50 mb-2.5 cursor-pointer ${
                missingHood ? 'border-danger/60' : 'border-[var(--border2)]'
              }`}>
              <option value="">Neighborhood…</option>
              {signedIn
                ? hoods.map(h => <option key={h.slug} value={h.slug}>{h.name}</option>)
                : hoodGroups.map(g => (
                    <optgroup key={g.city} label={g.city}>
                      {g.hoods.map(h => <option key={h.slug} value={h.slug}>{h.name}</option>)}
                    </optgroup>
                  ))}
            </select>
            <label htmlFor="plan-spot" className="sr-only">The exact spot</label>
            <input id="plan-spot" type="text" value={spot} onChange={e => setSpot(e.target.value)}
              placeholder="e.g. Partners Coffee, Central Park east entrance…"
              className="w-full bg-card border border-[var(--border2)] rounded-xl px-4 py-3 text-[16px] sm:text-[14px] text-ink placeholder:text-muted outline-none focus:border-accent/50" />
          </div>

          <div role="group" aria-labelledby="plan-tags-label">
            <h2 id="plan-tags-label" className="text-[12px] font-mono uppercase tracking-wider text-muted mb-2">Vibe tags <span className="lowercase">(optional, max 2)</span></h2>
            <p className="text-[12px] text-muted mb-3">Set expectations.</p>
            <div className="flex gap-1.5 flex-wrap">
              {INTENT_TAGS.map(t => {
                const active = selectedTags.includes(t.id);
                const disabled = !active && selectedTags.length >= 2;
                return (
                  <button key={t.id} type="button" onClick={() => toggleTag(t.id)} disabled={disabled} aria-pressed={active}
                    className={`px-3.5 py-1.5 rounded-full border text-[12.5px] ${
                      active ? 'bg-accent border-accent text-white font-medium'
                        : disabled ? 'bg-card border-[var(--border)] text-muted/40 cursor-not-allowed'
                        : 'bg-card border-[var(--border2)] text-ink-2 hover:border-accent/40'
                    }`}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div role="group" aria-labelledby="plan-spots-label">
            <h2 id="plan-spots-label" className="text-[12px] font-mono uppercase tracking-wider text-muted mb-2">
              How many can join?{missingSpots && <span className="text-danger normal-case tracking-normal"> Still needed</span>}
            </h2>
            <p className="text-[12px] text-muted mb-3">Keep it small. Up to four total, counting you.</p>
            <div ref={spotsRef} className="flex gap-2">
              {[1, 2, 3].map(n => (
                <button key={n} type="button" onClick={() => setSpots(n)} aria-pressed={spots === n}
                  className={`flex-1 py-5 rounded-2xl border text-center transition-all ${
                  spots === n ? 'border-accent bg-[rgba(47,107,63,0.06)]'
                    : missingSpots ? 'border-danger/60 bg-card'
                    : 'border-[var(--border2)] bg-card hover:border-accent/40'
                }`}>
                  <div className={`font-serif text-[40px] font-bold leading-none tracking-tight ${spots === n ? 'text-accent' : 'text-ink-2'}`}>
                    {n}
                  </div>
                  <div className={`text-[12px] mt-1 ${spots === n ? 'text-ink' : 'text-muted'}`}>
                    {n === 1 ? 'person' : 'people'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/20 text-danger text-[13px] rounded-xl px-4 py-3" role="alert">
              {error}
            </div>
          )}

          <div className="sticky bottom-3 bg-cream/95 backdrop-blur-sm rounded-[22px] p-2 -mx-2 shadow-[0_-8px_24px_rgba(20,17,13,0.06)] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <button onClick={submit} type="button" disabled={submitting} aria-describedby="plan-publish-note"
              className={`w-full py-4 rounded-2xl font-serif font-bold italic text-[19px] transition-all ${
                ready ? 'bg-accent text-white hover:bg-acc2 hover:-translate-y-[2px] shadow-lg shadow-accent/20' : 'bg-cream-2 text-ink-2'
              }`}>
              {submitting ? <span className="spinner" /> : signedIn === false && ready ? 'Publish it →' : 'Put it out there →'}
            </button>
            <p id="plan-publish-note" role="status" className="text-[11.5px] text-muted text-center mt-2 pb-1">
              {!ready ? (
                <>Still needed: {missing.join(', ')}.</>
              ) : signedIn === false ? (
                <>Next: verify a phone number, then this plan goes live. Your draft is saved.</>
              ) : (
                <>Free to post. Visible to people in your area.</>
              )}
            </p>
          </div>
        </div>
      </PageMain>
    </>
  );
}
