'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { createClient } from '@/lib/supabase/client';
import { INTENT_TAGS, getDateChips } from '@/lib/utils';

const TIMES = ['Morning', 'Afternoon', 'Evening', 'Night'];

export default function EditPlanPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const supabase = createClient();

  const [plan, setPlan] = useState<any>(null);
  const [text, setText] = useState('');
  const [dateIso, setDateIso] = useState('');
  const [time, setTime] = useState('');
  const [specificTime, setSpecificTime] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dateChips = getDateChips();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }
      const { data } = await supabase.from('plans').select('*').eq('slug', slug).single();
      if (!data || data.user_id !== user.id) { router.push('/feed'); return; }
      setPlan(data);
      setText(data.text);
      setDateIso(data.when_date ?? '');
      setTime(data.when_time ?? '');
      setSpecificTime(data.when_time_specific ?? '');
      setSelectedTags(data.intent_tags ?? []);
    }
    load();
  }, [slug]);

  function toggleTag(id: string) {
    setSelectedTags(prev => {
      if (prev.includes(id)) return prev.filter(t => t !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }

  async function save() {
    setError('');
    if (text.length < 25 || text.length > 220) { setError('Plan text must be 25-220 characters'); return; }
    if (!dateIso) { setError('Pick a date'); return; }
    setSaving(true);
    const selectedChip = dateChips.find(d => d.iso === dateIso);

    const res = await fetch('/api/plans', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: plan.id, text,
        whenDate: dateIso,
        whenDayLabel: selectedChip?.label ?? '',
        whenTime: time || null,
        whenTimeSpecific: specificTime || null,
        intentTags: selectedTags
      })
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Could not save'); return; }
    router.push(`/plan/${slug}`);
  }

  if (!plan) {
    return (
      <>
        <Nav />
        <div className="max-w-[720px] mx-auto px-6 py-20 text-center text-muted text-sm">Loading…</div>
      </>
    );
  }

  return (
    <>
      <Nav />
      <div className="max-w-[640px] mx-auto px-6 py-10 pb-20">
        <Link href={`/plan/${slug}`} className="text-[13px] text-muted hover:text-ink inline-block mb-6">← Back to plan</Link>
        <h2 className="font-serif text-[28px] font-bold tracking-tight mb-1.5">Edit plan</h2>
        <p className="text-[13px] text-muted mb-6">Change anything except location and spots.</p>

        <div className="flex flex-col gap-5">
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Plan text</label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={4} maxLength={220} className="input resize-none" />
            <div className={`text-right text-[11px] font-mono mt-1 ${text.length > 180 ? 'text-accent' : 'text-muted'}`}>{text.length} / 220</div>
          </div>

          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Date</label>
            <div className="flex gap-1.5 flex-wrap">
              {dateChips.map(d => (
                <button key={d.iso} onClick={() => setDateIso(d.iso)} className={`px-3.5 py-1.5 rounded-full border text-[13px] ${
                  dateIso === d.iso ? 'bg-ink text-cream border-ink' : 'border-[var(--border2)] text-ink-2'
                }`}>{d.label}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Rough time</label>
            <div className="flex gap-1.5 flex-wrap mb-2">
              <button onClick={() => setTime('')} className={`px-3.5 py-1.5 rounded-full border text-[13px] ${
                !time ? 'bg-ink text-cream border-ink' : 'border-[var(--border2)] text-ink-2'
              }`}>None</button>
              {TIMES.map(t => (
                <button key={t} onClick={() => setTime(t)} className={`px-3.5 py-1.5 rounded-full border text-[13px] ${
                  time === t ? 'bg-ink text-cream border-ink' : 'border-[var(--border2)] text-ink-2'
                }`}>{t}</button>
              ))}
            </div>
            <input type="text" value={specificTime} onChange={e => setSpecificTime(e.target.value)}
              placeholder="Specific time (optional)" maxLength={30} className="input" />
          </div>

          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Vibe tags (max 2)</label>
            <div className="flex gap-1.5 flex-wrap">
              {INTENT_TAGS.map(t => {
                const active = selectedTags.includes(t.id);
                const disabled = !active && selectedTags.length >= 2;
                return (
                  <button key={t.id} onClick={() => toggleTag(t.id)} disabled={disabled}
                    className={`px-3.5 py-1.5 rounded-full border text-[12.5px] ${
                      active ? 'bg-accent text-white border-accent font-medium'
                        : disabled ? 'border-[var(--border)] text-muted/40 cursor-not-allowed'
                        : 'border-[var(--border2)] text-ink-2'
                    }`}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <div className="bg-accent/10 border border-accent/25 text-accent text-[13px] rounded-xl px-4 py-3">{error}</div>}

          <button onClick={save} disabled={saving} className="btn btn-accent btn-full btn-lg mt-2">
            {saving ? <span className="spinner" /> : 'Save changes'}
          </button>
        </div>
      </div>
    </>
  );
}