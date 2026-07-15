import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM_SYSTEM = 'Stoop <hi@stoop.house>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://stoop.house';

const C = {
  accent: '#C8472A', ink: '#14110D', ink2: '#3A332B',
  muted: '#6E675E', cream: '#F0EBE1', cream2: '#E6DFD2', border: '#D9D1C2',
};

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]!));
}

type WrapArgs = { preheader: string; content: string; ctaUrl?: string; ctaText?: string; footerHtml?: string };

function wrap({ preheader, content, ctaUrl, ctaText, footerHtml }: WrapArgs): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${C.cream};font-family:Georgia,'Times New Roman',serif;color:${C.ink};">
<span style="display:none;font-size:0;line-height:0;max-height:0;opacity:0;overflow:hidden;">${escape(preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.cream};">
<tr><td align="center" style="padding:48px 24px 24px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;width:100%;">
<tr><td style="padding:0 0 36px 0;">
<span style="font-family:Georgia,serif;font-size:24px;font-weight:bold;letter-spacing:-0.5px;color:${C.ink};">St<em style="color:${C.accent};font-style:italic;">oo</em>p</span>
</td></tr>
<tr><td>${content}</td></tr>
${ctaUrl && ctaText ? `<tr><td style="padding:32px 0 0 0;"><a href="${ctaUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-family:Georgia,serif;font-style:italic;font-size:16px;font-weight:bold;">${ctaText}</a></td></tr>` : ''}
<tr><td style="padding:56px 0 0 0;border-top:1px solid ${C.border};">
<p style="font-family:Georgia,serif;font-size:13px;color:${C.muted};line-height:1.6;margin:24px 0 8px 0;">Plans, not profiles. NYC + Austin.</p>
<p style="font-family:Georgia,serif;font-size:11px;color:${C.muted};margin:0;"><a href="${APP_URL}/profile" style="color:${C.muted};text-decoration:underline;">Manage notifications</a></p>
${footerHtml ?? ''}
</td></tr>
</table></td></tr></table></body></html>`;
}

function planBlock(planText: string, meta?: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.cream2};border-left:3px solid ${C.accent};border-radius:0 8px 8px 0;margin:24px 0;">
<tr><td style="padding:18px 22px;">
<p style="font-family:Georgia,serif;font-style:italic;font-size:17px;line-height:1.45;color:${C.ink};margin:0;">"${escape(planText)}"</p>
${meta ? `<p style="font-family:'Courier New',monospace;font-size:11px;color:${C.muted};letter-spacing:0.08em;text-transform:uppercase;margin:8px 0 0 0;">${escape(meta)}</p>` : ''}
</td></tr></table>`;
}

export async function sendWelcome(to: string, name: string) {
  const first = name.split(' ')[0];
  try {
    await resend.emails.send({
      from: FROM_SYSTEM,
      to,
      subject: `Welcome to Stoop, ${escape(first)}`,
      html: wrap({
        preheader: "You're in. Now post a plan.",
        content: `
          <h1 style="font-family:Georgia,serif;font-size:34px;line-height:1.15;letter-spacing:-1px;color:${C.ink};margin:0 0 4px 0;font-weight:bold;">Welcome to <em style="color:${C.accent};font-style:italic;">Stoop.</em></h1>
          <p style="font-family:Georgia,serif;font-size:16px;line-height:1.65;color:${C.ink2};margin:20px 0 0 0;">Glad you're here, ${escape(first)}.</p>
          <p style="font-family:Georgia,serif;font-size:15px;line-height:1.7;color:${C.ink2};margin:14px 0 0 0;">Stoop is small on purpose. A few real plans, posted by real people in your city, that you can actually show up to. No algorithm. No swiping. Two to four people, one thing, no pressure.</p>
          <p style="font-family:Georgia,serif;font-size:14px;line-height:1.7;color:${C.ink2};margin:14px 0 0 0;">The fastest way to find out if Stoop is for you is to post one plan this week. Something you're already going to do. See who shows up.</p>
        `,
        ctaUrl: `${APP_URL}/post`,
        ctaText: 'Post your first plan →'
      })
    });
  } catch (e) { console.error('sendWelcome failed:', e); }
}

export async function sendMessageAlert(to: string, fromName: string, planText: string, convId: string, messagePreview?: string) {
  const preview = messagePreview && messagePreview.length > 140 ? messagePreview.substring(0, 140) + '…' : messagePreview;
  try {
    await resend.emails.send({
      from: `${escape(fromName)} at Stoop <hi@stoop.house>`,
      to,
      subject: `${escape(fromName)} wants to join your plan`,
      html: wrap({
        preheader: `${fromName} just messaged you about your plan on Stoop.`,
        content: `
          <h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.15;letter-spacing:-1px;color:${C.ink};margin:0 0 4px 0;font-weight:bold;">${escape(fromName)} wants to join<br>your <em style="color:${C.accent};font-style:italic;">plan.</em></h1>
          <p style="font-family:Georgia,serif;font-size:15px;line-height:1.65;color:${C.ink2};margin:18px 0 0 0;">They read what you wrote and reached out. Here's the plan:</p>
          ${planBlock(planText)}
          ${preview ? `<p style="font-family:'Courier New',monospace;font-size:11px;color:${C.muted};letter-spacing:0.08em;text-transform:uppercase;margin:0 0 8px 0;">What they said</p><p style="font-family:Georgia,serif;font-size:15px;line-height:1.65;color:${C.ink};margin:0;font-style:italic;">"${escape(preview)}"</p>` : ''}
        `,
        ctaUrl: `${APP_URL}/inbox/${convId}`,
        ctaText: 'Open the conversation →'
      })
    });
  } catch (e) { console.error('sendMessageAlert failed:', e); }
}

export async function sendReplyAlert(to: string, fromName: string, planText: string, convId: string, messagePreview?: string) {
  const preview = messagePreview && messagePreview.length > 140 ? messagePreview.substring(0, 140) + '…' : messagePreview;
  try {
    await resend.emails.send({
      from: `${escape(fromName)} at Stoop <hi@stoop.house>`,
      to,
      subject: `${escape(fromName)} replied`,
      html: wrap({
        preheader: `${fromName} sent you a message on Stoop.`,
        content: `
          <h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.15;letter-spacing:-1px;color:${C.ink};margin:0 0 4px 0;font-weight:bold;">${escape(fromName)} <em style="color:${C.accent};font-style:italic;">replied.</em></h1>
          <p style="font-family:Georgia,serif;font-size:15px;line-height:1.65;color:${C.ink2};margin:18px 0 0 0;">About the plan:</p>
          ${planBlock(planText)}
          ${preview ? `<p style="font-family:Georgia,serif;font-size:15px;line-height:1.65;color:${C.ink};margin:0;font-style:italic;">"${escape(preview)}"</p>` : ''}
        `,
        ctaUrl: `${APP_URL}/inbox/${convId}`,
        ctaText: 'Open the conversation →'
      })
    });
  } catch (e) { console.error('sendReplyAlert failed:', e); }
}

export type DigestPlan = {
  slug: string;
  text: string;
  when_day: string;
  when_time: string | null;
  when_time_specific: string | null;
  neighborhood: string | null;
  hostName: string | null;
};

// The Sunday-evening comeback loop: "this week on your stoop."
// Returns the built HTML so callers can preview it without sending.
export function buildWeeklyDigestHtml(userId: string, cityName: string, plans: DigestPlan[]): string {
  const items = plans.map(p => {
    const time = p.when_time_specific || (p.when_time ? p.when_time.toLowerCase() : '');
    const meta = [p.when_day, time, p.neighborhood, p.hostName ? `hosted by ${p.hostName}` : '']
      .filter(Boolean).join(' · ');
    return `<a href="${APP_URL}/plan/${p.slug}" style="text-decoration:none;">${planBlock(p.text, meta)}</a>`;
  }).join('');

  return wrap({
    preheader: `${plans.length} ${plans.length === 1 ? 'plan' : 'plans'} near you this week.`,
    content: `
      <h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.15;letter-spacing:-1px;color:${C.ink};margin:0 0 4px 0;font-weight:bold;">This week on<br>your <em style="color:${C.accent};font-style:italic;">stoop.</em></h1>
      <p style="font-family:Georgia,serif;font-size:15px;line-height:1.65;color:${C.ink2};margin:18px 0 0 0;">${plans.length === 1 ? 'One real plan' : `${plans.length} real plans`} in ${escape(cityName)}, posted by people who will actually be there:</p>
      ${items}
      <p style="font-family:Georgia,serif;font-size:14px;line-height:1.7;color:${C.ink2};margin:6px 0 0 0;">Nothing that fits? Post your own. The type of person who posts is the type who shows up.</p>
    `,
    ctaUrl: `${APP_URL}/feed`,
    ctaText: 'See all plans →',
    footerHtml: `<p style="font-family:Georgia,serif;font-size:11px;color:${C.muted};margin:6px 0 0 0;"><a href="${APP_URL}/unsubscribe?uid=${userId}" style="color:${C.muted};text-decoration:underline;">Stop the weekly digest</a></p>`
  });
}

export async function sendWeeklyDigest(to: string, userId: string, cityName: string, plans: DigestPlan[]) {
  await resend.emails.send({
    from: FROM_SYSTEM,
    to,
    subject: `This week on your stoop: ${plans.length} ${plans.length === 1 ? 'plan' : 'plans'} in ${cityName}`,
    html: buildWeeklyDigestHtml(userId, cityName, plans),
    headers: {
      'List-Unsubscribe': `<${APP_URL}/unsubscribe?uid=${userId}>`
    }
  });
}

export async function sendConfirmed(to: string, planText: string, posterName: string, convId?: string) {
  try {
    await resend.emails.send({
      from: FROM_SYSTEM,
      to,
      subject: `You're in. ${escape(posterName)} confirmed.`,
      html: wrap({
        preheader: `${posterName} confirmed your spot on Stoop.`,
        content: `
          <h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.15;letter-spacing:-1px;color:${C.ink};margin:0 0 4px 0;font-weight:bold;">You're <em style="color:${C.accent};font-style:italic;">in.</em></h1>
          <p style="font-family:Georgia,serif;font-size:15px;line-height:1.65;color:${C.ink2};margin:18px 0 0 0;">${escape(posterName)} confirmed your spot. Here's where you're showing up:</p>
          ${planBlock(planText)}
          <p style="font-family:Georgia,serif;font-size:13px;color:${C.muted};line-height:1.6;margin:0;">A few tips for the meet: pick a public spot, tell a friend where you'll be, trust your gut.</p>
        `,
        ctaUrl: convId ? `${APP_URL}/inbox/${convId}` : `${APP_URL}/my-plans`,
        ctaText: 'Open the conversation →'
      })
    });
  } catch (e) { console.error('sendConfirmed failed:', e); }
}