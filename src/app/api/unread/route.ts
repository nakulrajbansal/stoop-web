import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 });

  // All conversations the user is part of, with their latest message time
  const { data: convs } = await supabase
    .from('conversations')
    .select(`
      id,
      messages(from_user_id, created_at)
    `)
    .or(`poster_id.eq.${user.id},joiner_id.eq.${user.id}`);

  if (!convs) return NextResponse.json({ count: 0 });

  // The user's last-seen timestamps
  const { data: reads } = await supabase
    .from('conversation_reads')
    .select('conversation_id, last_seen_at')
    .eq('user_id', user.id);

  const seenMap = new Map((reads ?? []).map(r => [r.conversation_id, r.last_seen_at]));

  let count = 0;
  for (const c of convs) {
    const msgs = (c.messages ?? []) as { from_user_id: string; created_at: string }[];
    // Newest message NOT sent by me
    const incoming = msgs
      .filter(m => m.from_user_id !== user.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (incoming.length === 0) continue;

    const latestIncoming = incoming[0].created_at;
    const lastSeen = seenMap.get(c.id);
    if (!lastSeen || latestIncoming > lastSeen) {
      count++;
    }
  }

  return NextResponse.json({ count });
}