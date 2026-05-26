import { NextRequest, NextResponse } from 'next/server';
import { lookupNumber } from '@/lib/twilio';
import { checkOtpRateLimit, logOtpAttempt } from '@/lib/rate-limit';
import { isValidE164 } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

    if (!phone || typeof phone !== 'string' || !isValidE164(phone)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const rl = await checkOtpRateLimit(phone, ip);
    if (!rl.ok) {
      return NextResponse.json({ error: rl.reason }, { status: 429 });
    }

    const lookup = await lookupNumber(phone);
    if (!lookup.valid) {
      const messages = {
        voip_blocked: "Please use a real mobile number. Google Voice, Burner, and other VOIP numbers can't be used.",
        invalid_number: 'That number does not appear to be valid.',
        lookup_failed: 'We could not verify that number. Try again or use a different one.'
      };
      return NextResponse.json({ error: messages[lookup.reason] }, { status: 400 });
    }

    await logOtpAttempt(phone, ip, false);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('send-otp error:', e);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}