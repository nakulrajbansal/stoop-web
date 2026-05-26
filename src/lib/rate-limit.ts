import { supabaseAdmin } from './supabase/admin';

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function checkOtpRateLimit(phone: string, ip: string | null): Promise<{ ok: true } | { ok: false; reason: string }> {
  const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS).toISOString();

  const { count: phoneCount } = await supabaseAdmin
    .from('otp_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('phone_e164', phone)
    .gte('created_at', oneHourAgo);

  if ((phoneCount ?? 0) >= 3) {
    return { ok: false, reason: 'Too many attempts for this phone number. Try again in an hour.' };
  }

  if (ip) {
    const { count: ipCount } = await supabaseAdmin
      .from('otp_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('created_at', oneHourAgo);

    if ((ipCount ?? 0) >= 5) {
      return { ok: false, reason: 'Too many attempts from your network. Try again in an hour.' };
    }
  }

  return { ok: true };
}

export async function logOtpAttempt(phone: string, ip: string | null, succeeded: boolean) {
  await supabaseAdmin.from('otp_attempts').insert({
    phone_e164: phone,
    ip_address: ip,
    succeeded
  });
}
