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