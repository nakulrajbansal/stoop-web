import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth } from '@/lib/supabase/route';
import { sendWelcome } from '@/lib/resend';

export async function POST(req: NextRequest) {
  const { supabase, user } = await getRouteAuth(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { email, name } = await req.json();
  if (!email || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  await sendWelcome(email, name);
  return NextResponse.json({ ok: true });
}