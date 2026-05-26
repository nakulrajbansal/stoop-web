import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
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
          fontSize: 26,
          fontWeight: 700,
          color: '#C8472A',
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