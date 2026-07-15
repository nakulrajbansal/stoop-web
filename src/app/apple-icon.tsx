import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#F0EBE1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 140,
          fontWeight: 700,
          color: '#2F6B3F',
          fontStyle: 'italic',
          fontFamily: 'serif',
          lineHeight: 1,
        }}
      >
        S
      </div>
    ),
    { ...size }
  );
}