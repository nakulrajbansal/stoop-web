/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['twilio'],
  typescript: {
    ignoreBuildErrors: true
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            // Plan slugs are the plan text and inbox URLs carry conversation
            // ids, so a full-path referrer is content. strict-origin sends the
            // bare origin and nothing else, which keeps those paths out of
            // document.referrer on internal navigations and out of the Referer
            // header on any outbound link.
            //
            // This governs referrers we SEND. It does nothing about one an
            // external site sends TO us, which is what the analytics script
            // reads. That is handled separately and earlier, by the inline shim
            // in src/lib/referrer-shim.ts.
            key: 'Referrer-Policy',
            value: 'strict-origin'
          }
        ]
      }
    ];
  }
};
module.exports = nextConfig;