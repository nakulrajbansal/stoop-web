import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';

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
      poster:profiles!plans_user_id_fkey(name)`)
    .eq('slug', params.slug)
    .single() as any;

  const text = plan?.text ?? 'A plan in your neighborhood';
  const where = `${plan?.neighborhood?.name ?? ''}, ${plan?.city?.name ?? ''}`;
  const when = `${plan?.when_day ?? ''}${plan?.when_time_specific ? ' · ' + plan.when_time_specific : plan?.when_time ? ' · ' + plan.when_time : ''}`;
  const poster = plan?.poster?.name ?? '';

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: '#F0EBE1', padding: '80px', fontFamily: 'sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 40 }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#14110D' }}>St<span style={{ color: '#C8472A', fontStyle: 'italic' }}>oo</span>p</div>
          <div style={{ fontSize: 16, color: '#9C958D', marginLeft: 8 }}>· Plans, not profiles.</div>
        </div>
        <div style={{ fontSize: 48, lineHeight: 1.25, fontStyle: 'italic', color: '#14110D', flex: 1, fontFamily: 'serif' }}>
          {text.length > 180 ? text.substring(0, 180) + '…' : text}
        </div>
        <div style={{ display: 'flex', gap: 30, fontSize: 22, color: '#4A4540', borderTop: '1px solid #14110D22', paddingTop: 30 }}>
          <div>📅 {when}</div>
          <div>📍 {where}</div>
          {poster && <div style={{ marginLeft: 'auto' }}>↗ from {poster}</div>}
        </div>
      </div>
    ),
    { ...size }
  );
}