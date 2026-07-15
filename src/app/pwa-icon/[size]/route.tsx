import { ImageResponse } from 'next/og';

export const runtime = 'edge';

const SIZES = new Set([192, 512]);

// Home-screen icons for the web app manifest, drawn to match src/app/icon.tsx.
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: sizeParam } = await params;
  const size = Number(sizeParam);
  if (!SIZES.has(size)) return new Response('Not found', { status: 404 });

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
          fontSize: Math.round(size * 0.62),
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
    { width: size, height: size }
  );
}
