'use client';

import { Suspense } from 'react';
import Nav from '@/components/Nav';
import PageMain from '@/components/PageMain';
import Footer from '@/components/Footer';
import FeedContent from './FeedContent';

// Nav, the main landmark and the footer sit OUTSIDE the Suspense boundary so
// the server-rendered fallback already has the one <main id="main"> the skip
// link points at, rather than gaining it only after hydration.
export default function FeedPage() {
  return (
    <>
      <Nav />
      <PageMain className="max-w-[1080px] mx-auto gut pt-6 sm:pt-10 pb-10 sm:pb-16">
        <Suspense fallback={<div className="py-20 text-center text-muted">Loading…</div>}>
          <FeedContent />
        </Suspense>
      </PageMain>
      <Footer />
    </>
  );
}
