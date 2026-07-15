import type { Metadata } from 'next';
import { Fraunces, DM_Sans, DM_Mono } from 'next/font/google';
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
  title: 'Stoop · Plans, not profiles.',
  description: 'Post what you\'re already doing this week. A few neighbors join you.',
  openGraph: {
    title: 'Stoop',
    description: 'Plans, not profiles.',
    type: 'website'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
