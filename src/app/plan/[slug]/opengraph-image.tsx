import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import { ogPlanFields } from '@/lib/public-plan';

export const runtime = 'edge';
export const alt = 'A plan on Stoop';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from('plans')
    .select(`text, when_day, when_time, when_time_specific, spots_left, spots_total,
      neighborhood:neighborhoods(name), city:cities(name),
      poster:profiles!plans_user_id_fkey(name:display_name)`)
    .eq('slug', params.slug)
    .single() as any;

  // First name only, the same as the plan page, the cards, the feed and the
  // JSON-LD. A link preview is the most public surface there is.
  const { text, where, when, poster } = ogPlanFields(plan);

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: '#F0EBE1', padding: '80px', fontFamily: 'sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 40 }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#14110D' }}>St<span style={{ color: '#2F6B3F', fontStyle: 'italic' }}>oo</span>p</div>
          <div style={{ fontSize: 16, color: '#6E675E', marginLeft: 8 }}>· Plans, not profiles.</div>
        </div>
        <div style={{ fontSize: 48, lineHeight: 1.25, fontStyle: 'italic', color: '#14110D', flex: 1, fontFamily: 'serif' }}>
          {text.length > 180 ? text.substring(0, 180) + '…' : text}
        </div>
        <div style={{ display: 'flex', gap: 30, fontSize: 22, color: '#4A4540', borderTop: '1px solid #14110D22', paddingTop: 30 }}>
          <div style={{ display: 'flex' }}>{when}</div>
          <div style={{ display: 'flex' }}>{where}</div>
          {poster && <div style={{ marginLeft: 'auto', display: 'flex' }}>from {poster}</div>}
        </div>
      </div>
    ),
    { ...size }
  );
}