import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/inbox/',
          '/profile',
          '/my-plans',
          '/auth',
          '/followup',
          '/unsubscribe'
        ]
      }
    ],
    sitemap: 'https://www.stoop.house/sitemap.xml'
  };
}
