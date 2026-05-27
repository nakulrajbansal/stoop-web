const ACCENT = '#C8472A';
const INK = '#14110D';
const INK_2 = '#3A332B';
const MUTED = '#8C8278';
const CREAM = '#F0EBE1';
const CREAM_2 = '#E6DFD2';
const BORDER = '#D9D1C2';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://stoop.house';

type WrapperArgs = {
  preheader: string;
  content: string;
  ctaUrl?: string;
  ctaText?: string;
};

/** Shared wrapper. Cream background, editorial type, single CTA. */
function wrapper({ preheader, content, ctaUrl, ctaText }: WrapperArgs): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stoop</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};font-family:Georgia,'Times New Roman',serif;color:${INK};-webkit-font-smoothing:antialiased;">
  <span style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${preheader}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CREAM};">
    <tr>
      <td align="center" style="padding:48px 24px 24px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;width:100%;">
          <tr>
            <td style="padding:0 0 36px 0;">
              <a href="${APP_URL}" style="text-decoration:none;color:${INK};">
                <span style="font-family:Georgia,serif;font-size:24px;font-weight:bold;letter-spacing:-0.5px;color:${INK};">St<em style="color:${ACCENT};font-style:italic;">oo</em>p</span>
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              ${content}
            </td>
          </tr>
          ${ctaUrl && ctaText ? `
          <tr>
            <td style="padding:32px 0 0 0;">
              <a href="${ctaUrl}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-family:Georgia,serif;font-style:italic;font-size:16px;font-weight:bold;">${ctaText}</a>
            </td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding:64px 0 0 0;border-top:1px solid ${BORDER};margin-top:48px;">
              <p style="font-family:'SF Mono','Courier New',monospace;font-size:11px;color:${MUTED};letter-spacing:0.08em;text-transform:uppercase;margin:32px 0 8px 0;">
                Stoop
              </p>
              <p style="font-family:Georgia,serif;font-size:13px;color:${MUTED};line-height:1.6;margin:0 0 16px 0;">
                Plans, not profiles. NYC + Austin.
              </p>
              <p style="font-family:Georgia,serif;font-size:11px;color:${MUTED};line-height:1.6;margin:0;">
                <a href="${APP_URL}/profile" style="color:${MUTED};text-decoration:underline;">Manage notifications</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Render the plan card block used inside emails to remind the recipient of the plan context. */
function planBlock(plan: { text: string; when_day: string; when_time_specific?: string | null; when_time?: string | null; neighborhood_name?: string | null }): string {
  const time = plan.when_time_specific || (plan.when_time ? plan.when_time.toLowerCase() : '');
  const where = plan.neighborhood_name || '';
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CREAM_2};border-left:3px solid ${ACCENT};border-radius:0 8px 8px 0;margin:24px 0;">
    <tr>
      <td style="padding:18px 22px;">
        <p style="font-family:Georgia,serif;font-style:italic;font-size:17px;line-height:1.45;color:${INK};margin:0 0 8px 0;font-weight:normal;">
          "${plan.text}"
        </p>
        <p style="font-family:'SF Mono','Courier New',monospace;font-size:11px;color:${MUTED};letter-spacing:0.08em;text-transform:uppercase;margin:0;">
          ${plan.when_day}${time ? ` · ${time}` : ''}${where ? ` · ${where}` : ''}
        </p>
      </td>
    </tr>
  </table>`;
}

// ─────────────────────────────────────────────────────────
// SIX EMAILS
// ─────────────────────────────────────────────────────────

export function newMessageEmail(args: {
  recipientName: string;
  senderName: string;
  messagePreview: string;
  plan: { text: string; when_day: string; when_time_specific?: string | null; when_time?: string | null; neighborhood_name?: string | null };
  conversationUrl: string;
}): { subject: string; html: string; from: string } {
  const truncated = args.messagePreview.length > 140 ? args.messagePreview.substring(0, 140) + '…' : args.messagePreview;
  return {
    from: `${args.senderName} at Stoop <hi@stoop.house>`,
    subject: `${args.senderName} wants to join your plan`,
    html: wrapper({
      preheader: `${args.senderName} just messaged you about your plan on Stoop.`,
      content: `
        <h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.15;letter-spacing:-1px;color:${INK};margin:0 0 4px 0;font-weight:bold;">
          ${args.senderName} wants to join<br>your <em style="color:${ACCENT};font-style:italic;">plan.</em>
        </h1>
        <p style="font-family:Georgia,serif;font-size:15px;line-height:1.65;color:${INK_2};margin:18px 0 0 0;">
          They read what you wrote and reached out. Here's the plan they responded to:
        </p>
        ${planBlock(args.plan)}
        <p style="font-family:'SF Mono','Courier New',monospace;font-size:11px;color:${MUTED};letter-spacing:0.08em;text-transform:uppercase;margin:0 0 8px 0;">
          What they said
        </p>
        <p style="font-family:Georgia,serif;font-size:15px;line-height:1.65;color:${INK};margin:0;font-style:italic;">
          "${truncated}"
        </p>
      `,
      ctaUrl: args.conversationUrl,
      ctaText: 'Open the conversation →'
    })
  };
}

export function replyEmail(args: {
  recipientName: string;
  senderName: string;
  messagePreview: string;
  plan: { text: string; when_day: string; when_time_specific?: string | null; when_time?: string | null; neighborhood_name?: string | null };
  conversationUrl: string;
}): { subject: string; html: string; from: string } {
  const truncated = args.messagePreview.length > 140 ? args.messagePreview.substring(0, 140) + '…' : args.messagePreview;
  return {
    from: `${args.senderName} at Stoop <hi@stoop.house>`,
    subject: `${args.senderName} replied`,
    html: wrapper({
      preheader: `${args.senderName} sent you a message on Stoop.`,
      content: `
        <h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.15;letter-spacing:-1px;color:${INK};margin:0 0 4px 0;font-weight:bold;">
          ${args.senderName} <em style="color:${ACCENT};font-style:italic;">replied.</em>
        </h1>
        <p style="font-family:Georgia,serif;font-size:15px;line-height:1.65;color:${INK_2};margin:18px 0 0 0;">
          About the plan:
        </p>
        ${planBlock(args.plan)}
        <p style="font-family:Georgia,serif;font-size:15px;line-height:1.65;color:${INK};margin:0;font-style:italic;">
          "${truncated}"
        </p>
      `,
      ctaUrl: args.conversationUrl,
      ctaText: 'Open the conversation →'
    })
  };
}

export function confirmedEmail(args: {
  recipientName: string;
  posterName: string;
  plan: { text: string; when_day: string; when_time_specific?: string | null; when_time?: string | null; neighborhood_name?: string | null };
  conversationUrl: string;
}): { subject: string; html: string; from: string } {
  return {
    from: `Stoop <hi@stoop.house>`,
    subject: `You're in. ${args.posterName} confirmed.`,
    html: wrapper({
      preheader: `${args.posterName} confirmed your spot on Stoop.`,
      content: `
        <h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.15;letter-spacing:-1px;color:${INK};margin:0 0 4px 0;font-weight:bold;">
          You're <em style="color:${ACCENT};font-style:italic;">in.</em>
        </h1>
        <p style="font-family:Georgia,serif;font-size:15px;line-height:1.65;color:${INK_2};margin:18px 0 0 0;">
          ${args.posterName} confirmed your spot. Here's where you're showing up:
        </p>
        ${planBlock(args.plan)}
        <p style="font-family:Georgia,serif;font-size:14px;line-height:1.65;color:${INK_2};margin:0;">
          Take it from here. Sort out the small stuff in the conversation. Then show up.
        </p>
      `,
      ctaUrl: args.conversationUrl,
      ctaText: 'Open the conversation →'
    })
  };
}

export function expiringSoonEmail(args: {
  recipientName: string;
  plan: { text: string; when_day: string; when_time_specific?: string | null; when_time?: string | null; neighborhood_name?: string | null };
  planUrl: string;
}): { subject: string; html: string; from: string } {
  return {
    from: `Stoop <hi@stoop.house>`,
    subject: `Your plan expires tomorrow`,
    html: wrapper({
      preheader: `Your plan on Stoop expires in 24 hours. No one's joined yet.`,
      content: `
        <h1 style="font-family:Georgia,serif;font-size:30px;line-height:1.2;letter-spacing:-0.8px;color:${INK};margin:0 0 4px 0;font-weight:bold;">
          Your plan <em style="color:${ACCENT};font-style:italic;">expires tomorrow.</em>
        </h1>
        <p style="font-family:Georgia,serif;font-size:15px;line-height:1.65;color:${INK_2};margin:18px 0 0 0;">
          No one's joined yet. It happens. Sometimes the right person sees it the day of, sometimes they don't.
        </p>
        ${planBlock(args.plan)}
        <p style="font-family:Georgia,serif;font-size:14px;line-height:1.65;color:${INK_2};margin:0;">
          You can edit the date to extend it, or just let it go and post a new one this week. Whatever feels right.
        </p>
      `,
      ctaUrl: args.planUrl,
      ctaText: 'View the plan →'
    })
  };
}

export function welcomeEmail(args: {
  name: string;
  postUrl: string;
}): { subject: string; html: string; from: string } {
  return {
    from: `Stoop <hi@stoop.house>`,
    subject: `Welcome to Stoop, ${args.name.split(' ')[0]}`,
    html: wrapper({
      preheader: `You're in. Now post a plan.`,
      content: `
        <h1 style="font-family:Georgia,serif;font-size:34px;line-height:1.15;letter-spacing:-1px;color:${INK};margin:0 0 4px 0;font-weight:bold;">
          Welcome to <em style="color:${ACCENT};font-style:italic;">Stoop.</em>
        </h1>
        <p style="font-family:Georgia,serif;font-size:16px;line-height:1.65;color:${INK_2};margin:20px 0 0 0;">
          Glad you're here, ${args.name.split(' ')[0]}.
        </p>
        <p style="font-family:Georgia,serif;font-size:15px;line-height:1.7;color:${INK_2};margin:14px 0 0 0;">
          Stoop is small on purpose. A few real plans, posted by real people in your city, that you can actually show up to. No algorithm. No swiping. Two people, one thing, no pressure.
        </p>
        <p style="font-family:Georgia,serif;font-size:15px;line-height:1.7;color:${INK_2};margin:14px 0 0 0;">
          The way it works:
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
          <tr>
            <td style="padding:0 16px 6px 0;font-family:Georgia,serif;font-size:13px;font-style:italic;color:${ACCENT};vertical-align:top;width:24px;">01</td>
            <td style="padding:0 0 6px 0;font-family:Georgia,serif;font-size:14px;line-height:1.6;color:${INK_2};">Post what you're already doing this week.</td>
          </tr>
          <tr>
            <td style="padding:0 16px 6px 0;font-family:Georgia,serif;font-size:13px;font-style:italic;color:${ACCENT};vertical-align:top;width:24px;">02</td>
            <td style="padding:0 0 6px 0;font-family:Georgia,serif;font-size:14px;line-height:1.6;color:${INK_2};">Someone messages you because they want to come.</td>
          </tr>
          <tr>
            <td style="padding:0 16px 6px 0;font-family:Georgia,serif;font-size:13px;font-style:italic;color:${ACCENT};vertical-align:top;width:24px;">03</td>
            <td style="padding:0 0 6px 0;font-family:Georgia,serif;font-size:14px;line-height:1.6;color:${INK_2};">You meet.</td>
          </tr>
        </table>
        <p style="font-family:Georgia,serif;font-size:14px;line-height:1.7;color:${INK_2};margin:14px 0 0 0;">
          The fastest way to find out if Stoop is for you is to post one plan this week. Something you're already going to do. See who shows up.
        </p>
      `,
      ctaUrl: args.postUrl,
      ctaText: 'Post your first plan →'
    })
  };
}

// ─────────────────────────────────────────────────────────
// PREVIEW REGISTRY (used by the dev-only preview route)
// ─────────────────────────────────────────────────────────

export const TEMPLATE_PREVIEWS: Record<string, () => { subject: string; html: string; from: string }> = {
  'new-message': () => newMessageEmail({
    recipientName: 'Nakul',
    senderName: 'Hannah',
    messagePreview: "Hey! I saw your plan and I'd love to join. I work nearby and have been wanting to check out Cosmic forever. Free anytime after 10.",
    plan: {
      text: "Coffee at Cosmic Coffee + Beer Garden Saturday morning. Bringing my laptop, WFH-y chill vibes, will probably stay until 11ish.",
      when_day: 'Saturday',
      when_time_specific: '9:00 AM',
      neighborhood_name: 'South Congress'
    },
    conversationUrl: `${APP_URL}/inbox/preview-123`
  }),
  'reply': () => replyEmail({
    recipientName: 'Nakul',
    senderName: 'Theo',
    messagePreview: "Works for me. Want to meet at the entrance? I'll be the one with the red beanie.",
    plan: {
      text: "Sunset walk around Lady Bird Lake. Easy pace, probably 45 min. Bringing my dog Cleo, no agenda, just nice to have company.",
      when_day: 'Sunday',
      when_time_specific: '6:30 PM',
      neighborhood_name: 'Auditorium Shores'
    },
    conversationUrl: `${APP_URL}/inbox/preview-456`
  }),
  'confirmed': () => confirmedEmail({
    recipientName: 'Nakul',
    posterName: 'Cleo',
    plan: {
      text: "Reading at Spoonbill before they close at 8. Just want to sit, drink coffee, finish my book. Don't have to talk much.",
      when_day: 'Wednesday',
      when_time_specific: '7:00 PM',
      neighborhood_name: 'Williamsburg'
    },
    conversationUrl: `${APP_URL}/inbox/preview-789`
  }),
  'expiring': () => expiringSoonEmail({
    recipientName: 'Nakul',
    plan: {
      text: "Pottery class drop-in Saturday afternoon. Never done it. Looking for someone equally clueless and willing to laugh.",
      when_day: 'Saturday',
      when_time_specific: '2:00 PM',
      neighborhood_name: 'Greenpoint'
    },
    planUrl: `${APP_URL}/plan/preview-slug`
  }),
  'welcome': () => welcomeEmail({
    name: 'Nakul',
    postUrl: `${APP_URL}/post`
  })
};