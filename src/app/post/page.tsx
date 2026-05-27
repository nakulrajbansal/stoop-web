'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Nav from '@/components/Nav';
import { INTENT_TAGS, getDateChips } from '@/lib/utils';

const CATEGORIES = ['Coffee', 'Outdoors', 'Arts', 'Food', 'Books', 'Music'];
const CATEGORY_IDS: Record<string, string> = {
  Coffee: 'coffee', Outdoors: 'outdoors', Arts: 'arts',
  Food: 'food', Books: 'books', Music: 'music'
};

const TIMES = ['Morning', 'Afternoon', 'Evening', 'Night'];

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

  const dateChips = getDateChips();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }
      const { data: profile } = await supabase.from('profiles').select('city_id, neighborhood_id').eq('id', user.id).single();
      if (!profile) { router.push('/auth'); return; }
      const { data: nb } = await supabase.from('neighborhoods').select('slug, name').eq('city_id', profile.city_id);
      setHoods(nb || []);
      if (profile.neighborhood_id) {
        const { data: own } = await supabase.from('neighborhoods').select('slug').eq('id', profile.neighborhood_id).single();
        if (own) setNeighborhood(own.slug);
      }
    }
    load();
  }, []);

  const ready = text.length >= 25 && dateIso && neighborhood && spots;

  function toggleTag(id: string) {
    setSelectedTags(prev => {
      if (prev.includes(id)) return prev.filter(t => t !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }

  async function submit() {
    if (!ready) return;
    setSubmitting(true); setError('');

    const selectedChip = dateChips.find(c => c.iso === dateIso);

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
    router.push(`/plan/${data.plan.slug}?posted=1`);
  }

  return (
    <>
      <Nav />
      <div className="max-w-[700px] mx-auto px-6 py-10 pb-20">
        <div className="text-[11px] font-mono uppercase tracking-wider text-accent mb-2">Post a plan</div>
        <h1 className="font-serif text-[clamp(32px,4.5vw,44px)] font-bold tracking-[-1px] leading-[1.05] mb-1">
          What&apos;s the <em className="italic text-accent">plan?</em>
        </h1>
        <p className="text-[14px] text-muted mb-10">Write it like you&apos;d text a friend. Specific time, specific place.</p>

        <div className="space-y-8">
          <div>
            <textarea
              value={text} onChange={e => setText(e.target.value)}
              maxLength={220} rows={4}
              placeholder="going to the farmers market saturday morning, making coffee first…"
              className="w-full bg-card border border-[var(--border2)] rounded-2xl px-5 py-4 text-[16px] font-light text-ink placeholder:text-muted resize-none outline-none focus:border-accent/50 focus:shadow-[0_0_0_3px_rgba(200,71,42,0.06)]"
            />
            <div className={`text-right text-[11px] font-mono mt-1.5 ${text.length > 180 ? 'text-accent' : 'text-muted'}`}>
              {text.length} / 220
            </div>
          </div>

          <div>
            <h2 className="text-[12px] font-mono uppercase tracking-wider text-muted mb-2">What kind of plan?</h2>
            <p className="text-[12px] text-muted mb-3">Just for the feed filter.</p>
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)}
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

          <div>
            <h2 className="text-[12px] font-mono uppercase tracking-wider text-muted mb-2">Which day?</h2>
            <p className="text-[12px] text-muted mb-3">Up to two weeks out. Pick a rough time below, or set an exact one.</p>
            <div className="flex gap-1.5 flex-wrap mb-3">
              {dateChips.map(d => (
                <button key={d.iso} onClick={() => setDateIso(d.iso)} className={`px-4 py-2 rounded-full border text-[13px] ${
                  dateIso === d.iso ? 'bg-ink border-ink text-cream font-medium' : 'bg-card border-[var(--border2)] text-ink-2 hover:border-accent/40'
                }`}>{d.label}</button>
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap mb-3">
              <button onClick={() => setTime('')} className={`px-4 py-2 rounded-full border text-[13px] ${
                !time ? 'bg-cream-2 border-[var(--border2)] text-muted' : 'bg-card border-[var(--border2)] text-ink-2 hover:border-accent/40'
              }`}>No time</button>
              {TIMES.map(t => (
                <button key={t} onClick={() => setTime(t)} className={`px-4 py-2 rounded-full border text-[13px] ${
                  time === t ? 'bg-ink border-ink text-cream font-medium' : 'bg-card border-[var(--border2)] text-ink-2 hover:border-accent/40'
                }`}>{t}</button>
              ))}
            </div>
            <input type="text" value={specificTime} onChange={e => setSpecificTime(e.target.value)}
              placeholder="Or a specific time, e.g. 2:30 PM"
              maxLength={30}
              className="w-full bg-card border border-[var(--border2)] rounded-xl px-4 py-3 text-[14px] text-ink placeholder:text-muted outline-none focus:border-accent/50" />
          </div>

          <div>
            <h2 className="text-[12px] font-mono uppercase tracking-wider text-muted mb-2">Where exactly?</h2>
            <p className="text-[12px] text-muted mb-3">The neighborhood alone isn&apos;t enough.</p>
            <select value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
              className="w-full bg-card border border-[var(--border2)] rounded-xl px-4 py-3 text-[14px] text-ink outline-none focus:border-accent/50 mb-2.5 cursor-pointer">
              <option value="">Neighborhood…</option>
              {hoods.map(h => <option key={h.slug} value={h.slug}>{h.name}</option>)}
            </select>
            <input type="text" value={spot} onChange={e => setSpot(e.target.value)}
              placeholder="e.g. Partners Coffee, Central Park east entrance…"
              className="w-full bg-card border border-[var(--border2)] rounded-xl px-4 py-3 text-[14px] text-ink placeholder:text-muted outline-none focus:border-accent/50" />
          </div>

          <div>
            <h2 className="text-[12px] font-mono uppercase tracking-wider text-muted mb-2">Vibe tags <span className="lowercase">(optional, max 2)</span></h2>
            <p className="text-[12px] text-muted mb-3">Set expectations.</p>
            <div className="flex gap-1.5 flex-wrap">
              {INTENT_TAGS.map(t => {
                const active = selectedTags.includes(t.id);
                const disabled = !active && selectedTags.length >= 2;
                return (
                  <button key={t.id} onClick={() => toggleTag(t.id)} disabled={disabled}
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

          <div>
            <h2 className="text-[12px] font-mono uppercase tracking-wider text-muted mb-2">How many can join?</h2>
            <p className="text-[12px] text-muted mb-3">Keep it small.</p>
            <div className="flex gap-2">
              {[1, 2].map(n => (
                <button key={n} onClick={() => setSpots(n)} className={`flex-1 py-5 rounded-2xl border text-center transition-all ${
                  spots === n ? 'border-accent bg-[rgba(200,71,42,0.05)]' : 'border-[var(--border2)] bg-card hover:border-accent/40'
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
            <div className="bg-[rgba(200,71,42,0.08)] border border-[rgba(200,71,42,0.2)] text-accent text-[13px] rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <div className="pt-2 sticky bottom-4">
            <button onClick={submit} disabled={!ready || submitting}
              className={`w-full py-4 rounded-2xl font-serif font-bold italic text-[19px] transition-all ${
                ready ? 'bg-accent text-white hover:bg-acc2 hover:-translate-y-[2px] shadow-lg shadow-accent/20' : 'bg-cream-2 text-muted cursor-not-allowed'
              }`}>
              {submitting ? <span className="spinner" /> : 'Put it out there →'}
            </button>
            <p className="text-[11.5px] text-muted text-center mt-3">Free to post. Visible to people in your area.</p>
          </div>
        </div>
      </div>
    </>
  );
}