import type { Metadata } from 'next';
import { Fraunces, DM_Sans, DM_Mono } from 'next/font/google';
import Analytics from '@/components/Analytics';
import { REFERRER_SHIM_SOURCE } from '@/lib/referrer-shim';
import './globals.css';

// Self-hosted via next/font: no render-blocking Google request, no flash of
// fallback text, and real 600/700 weights instead of browser faux-bold.
const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-fraunces',
  display: 'swap'
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-dm-sans',
  display: 'swap'
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-dm-mono',
  display: 'swap'
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.stoop.house'),
  title: 'Stoop · Plans, not profiles.',
  description: 'Post what you\'re already doing this week. A few neighbors join you.',
  openGraph: {
    title: 'Stoop',
    description: 'Plans, not profiles.',
    type: 'website',
    siteName: 'Stoop'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable} ${dmMono.variable}`}>
      <head>
        {/* Inline and in <head>, so document.referrer is clamped while the head
            is still parsing, before <body> exists and so before anything
            hydrates. Next hoists its own bundle tags above this one, but those
            are async and none of them reads the referrer; the only thing that
            does is the analytics script, which the SDK creates from a useEffect
            that cannot run this early. If this script does not complete, it
            leaves its flag unset and components/Analytics renders nothing.
            See lib/referrer-shim. */}
        <script dangerouslySetInnerHTML={{ __html: REFERRER_SHIM_SOURCE }} />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
