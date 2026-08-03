import { NextResponse } from 'next/server';

/**
 * Apple App Site Association, served at /.well-known/apple-app-site-association
 * via the rewrite in next.config.js.
 *
 * Apple requires this file over HTTPS with content type application/json and no
 * redirect. Serving it from a route handler (rather than a static file) is the
 * only way to guarantee the content type on every host.
 *
 * The Apple Team ID is not a secret, but it is account-specific, so it comes
 * from the environment. Without it the route 404s on purpose: publishing an
 * association with the wrong team would silently break universal links, and a
 * missing file is easier to diagnose than a wrong one.
 */

export const dynamic = 'force-dynamic';

const BUNDLE_ID = 'house.stoop.app';

export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const appId = `${teamId}.${BUNDLE_ID}`;

  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appIDs: [appId],
            // Plan pages and conversations are the only links worth opening in
            // the app. Everything else (marketing, terms, guides) stays in the
            // browser.
            components: [
              { '/': '/plan/*', comment: 'Plan detail' },
              { '/': '/inbox/*', comment: 'A conversation' }
            ]
          }
        ]
      },
      webcredentials: { apps: [appId] }
    },
    {
      headers: {
        'content-type': 'application/json',
        // Apple caches this file; a day is short enough to fix a mistake and
        // long enough to avoid hammering the origin.
        'cache-control': 'public, max-age=86400'
      }
    }
  );
}
