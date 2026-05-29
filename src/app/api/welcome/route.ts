import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendWelcome } from '@/lib/resend';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { email, name } = await req.json();
  if (!email || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  await sendWelcome(email, name);
  return NextResponse.json({ ok: true });
}