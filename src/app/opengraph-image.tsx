import { ImageResponse } from 'next/og';

// Default social-share card for the site (home page and any page without its
// own OG image). Plan pages generate their own.
export const runtime = 'edge';
export const alt = 'Stoop: plans, not profiles. Meet neighbors in NYC and Austin.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#F0EBE1', padding: '80px', fontFamily: 'serif'
      }}>
        <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, color: '#14110D' }}>
          St<span style={{ color: '#2F6B3F', fontStyle: 'italic' }}>oo</span>p
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.05, color: '#14110D', letterSpacing: '-3px' }}>
            Plans, not
          </div>
          <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.05, color: '#8A681E', letterSpacing: '-3px', fontStyle: 'italic' }}>
            profiles.
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, color: '#4A4540', borderTop: '1px solid #14110D22', paddingTop: 30 }}>
          <div style={{ display: 'flex' }}>Post what you&apos;re already doing. A few neighbors join.</div>
          <div style={{ display: 'flex' }}>NYC + Austin</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
