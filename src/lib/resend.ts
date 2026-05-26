import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.RESEND_FROM_EMAIL || 'Stoop <hi@stoop.co>';

export async function sendWelcome(to: string, name: string) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Welcome to Stoop',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <h2 style="font-family:Georgia,serif;font-size:28px;color:#14110D">Hey ${escape(name)},</h2>
          <p style="font-size:15px;line-height:1.6;color:#4A4540">You're on Stoop. The fastest way to see if it works for you is to post a plan today — something you were already going to do this week.</p>
          <p style="margin:24px 0"><a href="${process.env.NEXT_PUBLIC_APP_URL}/post" style="background:#C8472A;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:500">Post a plan →</a></p>
          <p style="font-size:13px;color:#9C958D;margin-top:32px">Plans, not profiles.</p>
        </div>`
    });
  } catch (e) {
    console.error('sendWelcome failed:', e);
  }
}

export async function sendMessageAlert(to: string, fromName: string, planText: string, convId: string) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `${escape(fromName)} messaged about your plan`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <p style="font-size:15px;color:#4A4540">${escape(fromName)} just messaged about your plan:</p>
          <blockquote style="font-family:Georgia,serif;font-style:italic;font-size:17px;color:#14110D;border-left:3px solid #C8472A;padding-left:16px;margin:20px 0">${escape(planText)}</blockquote>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/inbox/${convId}" style="background:#14110D;color:#F0EBE1;padding:10px 20px;border-radius:100px;text-decoration:none;font-weight:500;font-size:14px">Open the conversation →</a></p>
        </div>`
    });
  } catch (e) {
    console.error('sendMessageAlert failed:', e);
  }
}

export async function sendConfirmed(to: string, planText: string, posterName: string) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `You're on — ${escape(posterName)} confirmed your plan`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <h2 style="font-family:Georgia,serif;font-size:26px;color:#14110D">You're on.</h2>
          <p style="font-size:15px;color:#4A4540">${escape(posterName)} confirmed your plan:</p>
          <blockquote style="font-family:Georgia,serif;font-style:italic;font-size:17px;color:#14110D;border-left:3px solid #2A4232;padding-left:16px;margin:20px 0">${escape(planText)}</blockquote>
          <p style="font-size:13px;color:#9C958D">A few tips for the meet: pick a public spot. Tell a friend where you'll be. Trust your gut.</p>
        </div>`
    });
  } catch (e) {
    console.error('sendConfirmed failed:', e);
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]!));
}
