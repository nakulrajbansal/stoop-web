import { NextRequest, NextResponse } from 'next/server';
import { checkVerification } from '@/lib/twilio';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isValidE164 } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json();

    if (!phone || !code || !isValidE164(phone) || !/^\d{4,8}$/.test(code)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // Verify the OTP with Twilio
    const approved = await checkVerification(phone, code);
    if (!approved) {
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
    }

    // Mark attempt as succeeded
    await supabaseAdmin
      .from('otp_attempts')
      .update({ succeeded: true })
      .eq('phone_e164', phone)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    // Check if profile already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, blocked_at')
      .eq('phone_e164', phone)
      .maybeSingle();

    if (existingProfile?.blocked_at) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
    }

    // Create or get auth user via admin API
    let userId: string;

    if (existingProfile) {
      userId = existingProfile.id;
    } else {
      // Create new auth user
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        phone,
        phone_confirm: true,
        user_metadata: { phone_e164: phone }
      });

      if (createErr || !created.user) {
        console.error('createUser failed:', createErr);
        return NextResponse.json({ error: 'Could not create account' }, { status: 500 });
      }
      userId = created.user.id;
    }

    // Generate a session for this user
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: `${userId}@phone.stoop.internal`
    });

    // For phone-only auth, we sign in via the admin client by creating a session
    // and returning tokens for the browser client to set
    const { data: session, error: sessErr } = await supabaseAdmin.auth.admin.createSession?.({
      user_id: userId
    } as any) ?? { data: null, error: null };

    // Fallback: use the OTP-verified flow on the client side via setSession
    // We return the user id and phone; client will call signInWithOtp confirmation
    const supabase = await createClient();

    return NextResponse.json({
      ok: true,
      userId,
      needsProfile: !existingProfile,
      phone
    });
  } catch (e) {
    console.error('check-otp error:', e);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
