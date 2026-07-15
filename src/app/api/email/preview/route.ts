import { NextRequest, NextResponse } from 'next/server';
import { TEMPLATE_PREVIEWS } from '@/lib/email-templates';

/**
 * Dev-only email preview route.
 * Visit /api/email/preview to see the index of templates.
 * Visit /api/email/preview?template=new-message to see one rendered.
 * Returns 404 in production.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const template = searchParams.get('template');

  if (!template) {
    // Show an index of all templates
    const indexHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Stoop email previews</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #F0EBE1; padding: 48px; color: #14110D; }
    h1 { font-family: Georgia, serif; font-weight: bold; }
    a { display: block; padding: 12px 16px; background: #fff; border: 1px solid #D9D1C2; border-radius: 8px; margin-bottom: 8px; color: #14110D; text-decoration: none; }
    a:hover { border-color: #2F6B3F; }
    code { font-family: monospace; color: #8C8278; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Email previews</h1>
  <p>Click a template to see how it renders. These do not send actual emails.</p>
  ${Object.keys(TEMPLATE_PREVIEWS).map(key => `
    <a href="/api/email/preview?template=${key}">
      <strong>${key}</strong><br>
      <code>${TEMPLATE_PREVIEWS[key]().subject}</code>
    </a>
  `).join('')}
</body>
</html>`;
    return new NextResponse(indexHtml, { headers: { 'Content-Type': 'text/html' } });
  }

  const preview = TEMPLATE_PREVIEWS[template];
  if (!preview) {
    return NextResponse.json({ error: `Unknown template: ${template}` }, { status: 400 });
  }

  const { html } = preview();
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}