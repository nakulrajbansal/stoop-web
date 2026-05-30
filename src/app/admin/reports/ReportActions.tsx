'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: 'dismiss' | 'warn' | 'suspend') {
    if (busy) return;
    if (action === 'suspend' && !confirm('Suspend this user? They lose sign-in, posting, messaging, and all their plans are hidden.')) return;
    setBusy(action);
    const res = await fetch('/api/admin/reports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId, action })
    });
    setBusy(null);
    if (res.ok) router.refresh();
    else alert('Action failed.');
  }

  return (
    <div className="flex gap-2 mt-3">
      <button onClick={() => act('dismiss')} disabled={!!busy}
        className="btn btn-sm btn-ghost">Dismiss</button>
      <button onClick={() => act('warn')} disabled={!!busy}
        className="btn btn-sm btn-ghost">Warn</button>
      <button onClick={() => act('suspend')} disabled={!!busy}
        className="btn btn-sm" style={{ background: 'var(--accent)', color: '#fff' }}>
        {busy === 'suspend' ? <span className="spinner" /> : 'Suspend'}
      </button>
    </div>
  );
}
