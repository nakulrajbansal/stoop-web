'use client';

import { useEffect, useState } from 'react';
import Avatar from '@/components/Avatar';
import { ROSTER_VISIBILITY_NOTE, type RosterEntry } from '@/lib/participants';

/**
 * Who is actually coming.
 *
 * Fetched from the authenticated endpoint after the page loads, never rendered
 * on the server into public HTML. If the viewer is not the host or a confirmed
 * participant the endpoint answers 401 or 403 and this renders nothing at all,
 * so an unauthorized viewer cannot even tell how many people are in.
 */
export default function ConfirmedRoster({
  planId,
  enabled = true
}: {
  planId: string;
  /** Skip the request entirely when the viewer is known to be signed out. */
  enabled?: boolean;
}) {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);

  useEffect(() => {
    let live = true;
    // Clear first. Showing the previous plan's roster while the next answer is
    // in flight, or after it comes back denied, would be a leak in slow motion.
    setRoster(null);
    if (!enabled) return;

    fetch(`/api/plans/${planId}/participants`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!live) return;
        setRoster(Array.isArray(data?.roster) ? (data.roster as RosterEntry[]) : null);
      })
      .catch(() => {
        if (live) setRoster(null);
      });
    return () => {
      live = false;
    };
  }, [planId, enabled]);

  if (!roster) return null;

  const joiners = roster.filter(entry => entry.role === 'joiner');

  return (
    <section
      aria-labelledby="roster-heading"
      className="bg-cream-2 border border-[var(--border)] rounded-xl px-5 py-4 mb-6"
    >
      <h2 id="roster-heading" className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted mb-3">
        Who is coming
      </h2>

      {/* role="list" is kept explicitly: Safari drops list semantics for a
          VoiceOver user as soon as list-style is none. */}
      <ul role="list" className="flex flex-col gap-3 list-none p-0 m-0">
        {roster.map(entry => (
          <li key={entry.userId} className="flex items-start gap-3">
            <Avatar userId={entry.userId} name={entry.firstName} size={34} radius={10} />
            <div className="min-w-0">
              <p className="text-[13.5px] text-ink leading-tight">
                <span className="font-medium">{entry.firstName}</span>
                <span className="text-muted">
                  {' '}
                  {entry.role === 'host' ? 'is hosting' : 'is confirmed'}
                  {entry.isYou ? ' (you)' : ''}
                </span>
              </p>
              {(entry.neighborhood || entry.about) && (
                <p className="text-[12px] text-muted leading-snug mt-0.5 break-words">
                  {[entry.neighborhood, entry.about].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {joiners.length === 0 && (
        <p className="text-[12.5px] text-muted mt-3 leading-relaxed">
          Nobody is confirmed yet. This list fills in as the host accepts people.
        </p>
      )}

      <p className="text-[11.5px] text-muted mt-3 leading-relaxed">{ROSTER_VISIBILITY_NOTE}</p>
    </section>
  );
}
