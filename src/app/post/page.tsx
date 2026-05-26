'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Nav from '@/components/Nav';

const CATEGORIES = [
  { id: 'coffee', label: 'Coffee', emoji: '☕' },
  { id: 'outdoors', label: 'Outdoors', emoji: '🌿' },
  { id: 'arts', label: 'Arts', emoji: '🎨' },
  { id: 'food', label: 'Food', emoji: '🍜' },
  { id: 'books', label: 'Books', emoji: '📚' },
  { id: 'music', label: 'Music', emoji: '🎵' }
];

const DAYS = ['Today', 'Tomorrow', 'This Saturday', 'This Sunday', 'Next week'];
const TIMES = ['Morning', 'Afternoon', 'Evening', 'Night'];

export default function PostPage() {
  const router = useRouter();
  const supabase = createClient();

  const [text, setText] = useState('');
  const [category, setCategory] = useState('coffee');
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [hoods, setHoods] = useState<{ slug: string; name: string }[]>([]);
  const [spot, setSpot] = useState('');
  const [spots, setSpots] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.classList.add('dark-mode');

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('city_id, neighborhood_id')
        .eq('id', user.id)
        .single();
      if (!profile) { router.push('/auth'); return; }

      const { data: nb } = await supabase
        .from('neighborhoods')
        .select('slug, name')
        .eq('city_id', profile.city_id);
      setHoods(nb || []);

      if (profile.neighborhood_id) {
        const { data: own } = await supabase
          .from('neighborhoods')
          .select('slug')
          .eq('id', profile.neighborhood_id)
          .single();
        if (own) setNeighborhood(own.slug);
      }
    }

    load();
    return () => { document.body.classList.remove('dark-mode'); };
  }, []);

  const ready = text.length >= 25 && day && neighborhood && spots;

  async function submit() {
    if (!ready) return;
    setSubmitting(true); setError('');

    const res = await fetch('/api/plans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text, category, spot: spot || null,
        whenDay: day, whenTime: time || null,
        spots, neighborhoodSlug: neighborhood
      })
    });

    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Could not post plan'); setSubmitting(false); return; }

    router.push(`/plan/${data.plan.id}?posted=1`);
  }

  return (
    <div className="min-h-screen bg-dark-bg text-cream">
      <Nav />
      <div className="max-w-[700px] mx-auto px-6 py-10">
        <div className="space-y-9">
          {/* Plan text */}
          <div>
            <h2 className="font-serif text-[clamp(20px,2.8vw,28px)] font-bold tracking-tight mb-1.5">What&apos;s the plan?</h2>
            <p className="text-[12px] text-cream/40 mb-3">Write it like you&apos;d text a friend.</p>
            <textarea
              value={text} onChange={e => setText(e.target.value)}
              maxLength={220} rows={4}
              placeholder="going to the farmers market saturday morning, making coffee first…"
              className="w-full bg-dark-s1 border border-cream/15 rounded-2xl px-5 py-4 text-[16px] font-light text-cream placeholder:text-cream/30 resize-none outline-none focus:border-accent/50 focus:shadow-[0_0_0_3px_rgba(200,71,42,0.08)]"
            />
            <div className={`text-right text-[11px] font-mono mt-1.5 ${text.length > 180 ? 'text-accent' : 'text-cream/30'}`}>
              {text.length} / 220
            </div>
          </div>

          {/* Category */}
          <div>
            <h2 className="font-serif text-[18px] font-bold mb-3">What kind of plan?</h2>
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => setCategory(c.id)}
                  className={`px-4 py-2 rounded-full border text-[13px] ${
                    category === c.id
                      ? 'bg-accent border-accent text-white font-medium'
                      : 'bg-dark-s1 border-cream/15 text-cream/60 hover:border-accent/40 hover:text-cream'
                  }`}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* When */}
          <div>
            <h2 className="font-serif text-[18px] font-bold mb-3">When?</h2>
            <div className="flex gap-1.5 flex-wrap mb-2.5">
              {DAYS.map(d => (
                <button key={d} onClick={() => setDay(d)} className={`px-4 py-2 rounded-full border text-[13px] ${
                  day === d ? 'bg-accent border-accent text-white font-medium' : 'bg-dark-s1 border-cream/15 text-cream/60'
                }`}>{d}</button>
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {TIMES.map(t => (
                <button key={t} onClick={() => setTime(t)} className={`px-4 py-2 rounded-full border text-[13px] ${
                  time === t ? 'bg-accent border-accent text-white font-medium' : 'bg-dark-s1 border-cream/15 text-cream/60'
                }`}>{t}</button>
              ))}
            </div>
          </div>

          {/* Where */}
          <div>
            <h2 className="font-serif text-[18px] font-bold mb-1.5">Where exactly?</h2>
            <p className="text-[12px] text-cream/40 mb-3">Be specific. The neighborhood alone isn&apos;t enough.</p>
            <select value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
              className="w-full bg-dark-s1 border border-cream/15 rounded-xl px-4 py-3 text-[14px] text-cream outline-none focus:border-accent/50 mb-2.5">
              <option value="">Neighborhood…</option>
              {hoods.map(h => <option key={h.slug} value={h.slug}>{h.name}</option>)}
            </select>
            <input type="text" value={spot} onChange={e => setSpot(e.target.value)}
              placeholder="e.g. Partners Coffee, Central Park east entrance…"
              className="w-full bg-dark-s1 border border-cream/15 rounded-xl px-4 py-3 text-[14px] text-cream placeholder:text-cream/30 outline-none focus:border-accent/50" />
          </div>

          {/* Spots */}
          <div>
            <h2 className="font-serif text-[18px] font-bold mb-1.5">How many can join?</h2>
            <p className="text-[12px] text-cream/40 mb-3">Keep it small.</p>
            <div className="flex gap-2">
              {[1, 2].map(n => (
                <button key={n} onClick={() => setSpots(n)} className={`flex-1 py-5 rounded-2xl border text-center ${
                  spots === n ? 'border-accent bg-accent/10' : 'border-cream/15 bg-dark-s1 hover:bg-dark-s2'
                }`}>
                  <div className={`font-serif text-[40px] font-bold leading-none tracking-tight ${spots === n ? 'text-accent' : 'text-cream/60'}`}>
                    {n}
                  </div>
                  <div className={`text-[12px] mt-1 ${spots === n ? 'text-cream' : 'text-cream/40'}`}>
                    {n === 1 ? 'person' : 'people'}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-cream/30 italic mt-2.5">Most plans work best with just one other person.</p>
          </div>

          {error && (
            <div className="bg-accent/10 border border-accent/25 text-accent text-[13px] rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="pt-2 pb-12 sticky bottom-0 bg-gradient-to-t from-dark-bg via-dark-bg to-transparent">
            <button onClick={submit} disabled={!ready || submitting}
              className={`w-full py-4 rounded-2xl font-serif font-bold italic text-[19px] ${
                ready ? 'bg-accent text-white hover:bg-acc2 hover:-translate-y-[2px]' : 'bg-cream/10 text-cream/30 cursor-not-allowed'
              } transition-all`}>
              {submitting ? <span className="spinner" /> : 'Put it out there →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
