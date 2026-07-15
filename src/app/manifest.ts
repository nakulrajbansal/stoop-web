import type { MetadataRoute } from 'next';

// Makes "Add to Home Screen" give an app-like entry point (standalone window,
// proper icon). This is the runway toward push notifications later; no native
// app needed (see DECISIONS.md).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Stoop',
    short_name: 'Stoop',
    description: "Plans, not profiles. Post what you're already doing this week; a few neighbors join you.",
    start_url: '/feed',
    display: 'standalone',
    background_color: '#F0EBE1',
    theme_color: '#F0EBE1',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png' }
    ]
  };
}
