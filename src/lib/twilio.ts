import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

const VERIFY_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;

const BLOCKED_LINE_TYPES = new Set(['voip', 'nonFixedVoip', 'fixedVoip']);

export type LookupResult =
  | { valid: true; lineType: string }
  | { valid: false; reason: 'voip_blocked' | 'invalid_number' | 'lookup_failed' };

/**
 * Twilio Lookup with line_type_intelligence.
 * Blocks Google Voice, Burner, and other VOIP numbers.
 */
export async function lookupNumber(e164: string): Promise<LookupResult> {
  try {
    const result = await client.lookups.v2
      .phoneNumbers(e164)
      .fetch({ fields: 'line_type_intelligence' });

    const lineType = (result.lineTypeIntelligence as { type?: string } | undefined)?.type;

    if (!lineType) {
      return { valid: false, reason: 'lookup_failed' };
    }

    if (BLOCKED_LINE_TYPES.has(lineType)) {
      return { valid: false, reason: 'voip_blocked' };
    }

    return { valid: true, lineType };
  } catch (e: unknown) {
    const err = e as { code?: number };
    if (err.code === 20404) return { valid: false, reason: 'invalid_number' };
    return { valid: false, reason: 'lookup_failed' };
  }
}

/** Send OTP to a phone number. Returns true on success. */
export async function sendVerification(e164: string): Promise<boolean> {
  try {
    await client.verify.v2
      .services(VERIFY_SID)
      .verifications
      .create({ to: e164, channel: 'sms' });
    return true;
  } catch {
    return false;
  }
}

/** Validate an OTP. Returns true if the code is correct. */
export async function checkVerification(e164: string, code: string): Promise<boolean> {
  try {
    const check = await client.verify.v2
      .services(VERIFY_SID)
      .verificationChecks
      .create({ to: e164, code });
    return check.status === 'approved';
  } catch {
    return false;
  }
}

/** Send a transactional SMS (for plan reminders). */
export async function sendSms(to: string, body: string): Promise<boolean> {
  try {
    await client.messages.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER!,
      body
    });
    return true;
  } catch {
    return false;
  }
}
