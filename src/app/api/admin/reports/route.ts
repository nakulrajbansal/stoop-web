import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_USER_ID || user.id !== ADMIN_USER_ID) return null;
  return user;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { reportId, action } = await req.json();
  if (!reportId || !['dismiss', 'warn', 'suspend'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { data: report } = await supabaseAdmin
    .from('reports')
    .select('id, reported_user_id')
    .eq('id', reportId)
    .single();
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  const now = new Date().toISOString();

  if (action === 'dismiss') {
    await supabaseAdmin.from('reports')
      .update({ status: 'dismissed', resolved_at: now } as any)
      .eq('id', reportId);
  }

  if (action === 'warn') {
    await supabaseAdmin.from('profiles')
      .update({ warned_at: now } as any)
      .eq('id', report.reported_user_id);
    await supabaseAdmin.from('reports')
      .update({ status: 'reviewed', resolved_at: now } as any)
      .eq('id', reportId);
  }

  if (action === 'suspend') {
    // Block sign-in + posting + messaging, and hide all their plans from view.
    await supabaseAdmin.from('profiles')
      .update({ blocked_at: now } as any)
      .eq('id', report.reported_user_id);
    await supabaseAdmin.from('plans')
      .update({ status: 'removed' })
      .eq('user_id', report.reported_user_id)
      .neq('status', 'removed');
    await supabaseAdmin.from('reports')
      .update({ status: 'actioned', resolved_at: now } as any)
      .eq('id', reportId);
  }

  return NextResponse.json({ ok: true });
}
