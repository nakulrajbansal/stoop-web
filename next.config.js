/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['twilio', 'sharp'],
  // Both of these used to be `true`, because `tsc --noEmit` reported 143 errors
  // and there was no ESLint config at all. Both are now clean, so the build
  // checks them again and a regression stops the build instead of shipping.
  typescript: {
    ignoreBuildErrors: false
  },
  eslint: {
    ignoreDuringBuilds: false
  },
  async rewrites() {
    return [
      {
        // Apple fetches this exact path to authorize universal links for the
        // iOS app. A route handler serves it so the content type is always
        // application/json (a static file under public/ is not guaranteed to be).
        source: '/.well-known/apple-app-site-association',
        destination: '/api/apple-app-site-association'
      }
    ];
  }
};
module.exports = nextConfig;