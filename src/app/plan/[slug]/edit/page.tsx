'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import PageMain from '@/components/PageMain';
import { createClient } from '@/lib/supabase/client';
import { INTENT_TAGS, getDateChips } from '@/lib/utils';
import {
  COST_EXPECTATIONS,
  COST_EXPECTATION_LABELS,
  COST_EXPECTATION_HINTS,
  MEETING_POINT_GUIDANCE,
  MEETING_POINT_MAX,
  planContractIssues,
  planMeetsContract,
  formatTimeOfDay,
  localCalendarDate,
  resolveReferenceDate,
  timeBandFor,
  type CostExpectation
} from '@/lib/plan-contract';

// Turn a stored display time back into what the time input wants. Plans written
// before this contract stored free text, so anything unparseable is left blank
// and asked for again rather than guessed at.
function toTimeInputValue(stored: string | null): string {
  if (!stored) return '';
  const match = stored.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return '';
  let hours = Number(match[1]);
  const suffix = match[3]?.toUpperCase();
  if (suffix === 'PM' && hours < 12) hours += 12;
  if (suffix === 'AM' && hours === 12) hours = 0;
  if (hours > 23) return '';
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

export default function EditPlanPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const supabase = createClient();

  const [plan, setPlan] = useState<any>(null);
  const [text, setText] = useState('');
  const [dateIso, setDateIso] = useState('');
  const [timeValue, setTimeValue] = useState('');
  const [spot, setSpot] = useState('');
  const [cost, setCost] = useState<CostExpectation | ''>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [wasIncomplete, setWasIncomplete] = useState(false);

  const timeRef = useRef<HTMLInputElement>(null);
  const spotRef = useRef<HTMLInputElement>(null);

  const dateChips = getDateChips();
  // The same reference day the composer sends, for the same reason: the chips
  // are this browser's fourteen days, so the window has to be counted from this
  // browser's day at both ends of the request.
  const clientToday = localCalendarDate();
  const today = resolveReferenceDate(clientToday);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }
      const { data } = await supabase.from('plans').select('*').eq('slug', slug).single();
      // The generated Database types resolve a select('*') row to never here,
      // same as the other client pages, so the row is read through one cast.
      const row = data as any;
      if (!row || row.user_id !== user.id) { router.push('/feed'); return; }
      setPlan(row);
      setText(row.text);
      setDateIso(row.when_date ?? '');
      setTimeValue(toTimeInputValue(row.when_time_specific));
      setSpot(row.spot ?? '');
      setCost(row.cost_expectation ?? '');
      setSelectedTags(row.intent_tags ?? []);
      setWasIncomplete(!planMeetsContract(row));
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

  const displayTime = formatTimeOfDay(timeValue) ?? '';
  const issues = plan
    ? planContractIssues({
        text,
        whenDate: dateIso,
        whenTimeSpecific: displayTime,
        spot,
        spots: plan.spots_total,
        costExpectation: cost
      }, { today })
    : [];

  async function save() {
    setError('');
    if (issues.length > 0) {
      setError(`Still needed: ${issues.map(i => i.label).join(', ')}.`);
      const first = issues[0].field;
      if (first === 'time') timeRef.current?.focus();
      if (first === 'spot') spotRef.current?.focus();
      return;
    }
    setSaving(true);
    const selectedChip = dateChips.find(d => d.iso === dateIso);

    const res = await fetch('/api/plans', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planId: plan.id, text,
        whenDate: dateIso,
        clientToday,
        whenDayLabel: selectedChip?.label ?? plan.when_day,
        whenTime: timeBandFor(timeValue),
        whenTimeSpecific: displayTime,
        spot,
        costExpectation: cost,
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
        <PageMain className="max-w-[720px] mx-auto px-6 py-20 text-center text-muted text-sm">Loading…</PageMain>
      </>
    );
  }

  return (
    <>
      <Nav />
      <PageMain className="max-w-[640px] mx-auto px-6 py-10 pb-20">
        <Link href={`/plan/${slug}`} className="text-[13px] text-muted hover:text-ink inline-block mb-6">← Back to plan</Link>
        <h2 className="font-serif text-[28px] font-bold tracking-tight mb-1.5">Edit plan</h2>
        <p className="text-[13px] text-muted mb-6">
          Group size stays as posted. Everything else is yours to change.
        </p>

        {wasIncomplete && (
          <div className="bg-cream-2 border-l-[3px] border-gold rounded-r-lg px-4 py-3 mb-6" role="status">
            <p className="text-[13px] text-ink-2 leading-relaxed">
              This plan was posted before Stoop asked for an exact time, a public meeting point, and what it
              costs. Saving it means filling those in, so a neighbor can tell what they would be showing up to.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-5">
          <div>
            <label htmlFor="edit-text" className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Plan text</label>
            <textarea id="edit-text" value={text} onChange={e => setText(e.target.value)} rows={4} maxLength={220} className="input resize-none" />
            <div className={`text-right text-[11px] font-mono mt-1 ${text.length > 180 ? 'text-danger' : 'text-muted'}`}>{text.length} / 220</div>
          </div>

          <div role="group" aria-labelledby="edit-date-label">
            <h3 id="edit-date-label" className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Date</h3>
            <div className="flex gap-1.5 flex-wrap">
              {dateChips.map(d => (
                <button key={d.iso} type="button" onClick={() => setDateIso(d.iso)} aria-pressed={dateIso === d.iso}
                  className={`px-3.5 py-1.5 rounded-full border text-[13px] ${
                  dateIso === d.iso ? 'bg-ink text-cream border-ink' : 'border-[var(--border2)] text-ink-2'
                }`}>{d.label}</button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="edit-time" className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Exact time</label>
            <input id="edit-time" ref={timeRef} type="time" value={timeValue} onChange={e => setTimeValue(e.target.value)}
              className="input" />
          </div>

          <div>
            <label htmlFor="edit-spot" className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Public meeting point</label>
            <p className="text-[12px] text-muted mb-2">{MEETING_POINT_GUIDANCE}</p>
            <input id="edit-spot" ref={spotRef} type="text" value={spot} onChange={e => setSpot(e.target.value)}
              maxLength={MEETING_POINT_MAX}
              placeholder="e.g. Partners Coffee, Central Park east entrance…" className="input" />
          </div>

          <div role="group" aria-labelledby="edit-cost-label">
            <h3 id="edit-cost-label" className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Cost</h3>
            <div className="flex flex-col gap-2">
              {COST_EXPECTATIONS.map(value => (
                <button key={value} type="button" onClick={() => setCost(value)} aria-pressed={cost === value}
                  className={`text-left px-4 py-3 rounded-xl border ${
                    cost === value ? 'border-accent bg-[rgba(47,107,63,0.06)]' : 'border-[var(--border2)] bg-card'
                  }`}>
                  <span className={`block text-[13.5px] font-medium ${cost === value ? 'text-accent' : 'text-ink'}`}>
                    {COST_EXPECTATION_LABELS[value]}
                  </span>
                  <span className="block text-[12px] text-muted mt-0.5 leading-snug">{COST_EXPECTATION_HINTS[value]}</span>
                </button>
              ))}
            </div>
          </div>

          <div role="group" aria-labelledby="edit-tags-label">
            <h3 id="edit-tags-label" className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Vibe tags (max 2)</h3>
            <div className="flex gap-1.5 flex-wrap">
              {INTENT_TAGS.map(t => {
                const active = selectedTags.includes(t.id);
                const disabled = !active && selectedTags.length >= 2;
                return (
                  <button key={t.id} type="button" onClick={() => toggleTag(t.id)} disabled={disabled} aria-pressed={active}
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

          {error && <div className="bg-danger/10 border border-danger/25 text-danger text-[13px] rounded-xl px-4 py-3" role="alert">{error}</div>}

          <button type="button" onClick={save} disabled={saving} aria-busy={saving}
            className="btn btn-accent btn-full btn-lg mt-2">
            {saving && <span className="spinner" aria-hidden="true" />}
            Save changes
          </button>
          {issues.length > 0 && (
            <p className="text-[12px] text-muted text-center" role="status">
              Still needed: {issues.map(i => i.label).join(', ')}.
            </p>
          )}
        </div>
      </PageMain>
    </>
  );
}
