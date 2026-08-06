'use client';

import { Suspense, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toE164 } from '@/lib/utils';
import { toAvatarJpeg } from '@/lib/avatar-image';
import { neighborhoodsForCity } from '@/lib/neighborhoods';
import { SIGNUP_REASON } from '@/lib/product-copy';
import { NAME_MAX, deriveInitials, normalizeFullName } from '@/lib/profile-identity';
import Nav from '@/components/Nav';
import PageMain from '@/components/PageMain';

type Step = 'phone' | 'otp' | 'profile' | 'photo';

function AuthContent() {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();
  // Where to land after auth: back to a half-written plan, or back to the
  // plan they wanted to join. Only known-safe internal paths are honored.
  const rawNext = searchParams.get('next') ?? '';
  const destination =
    rawNext === 'post' ? '/post'
    : /^\/plan\/[a-z0-9-]+$/i.test(rawNext) ? rawNext
    : '/feed';
  // Someone arriving mid-plan needs a different first line than someone
  // arriving cold: they already know what Stoop is, they want to know why they
  // are being asked for a number and whether their draft survived.
  const fromDraft = rawNext === 'post';
  const fromPlan = destination.startsWith('/plan/');

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('nyc');
  const [neighborhood, setNeighborhood] = useState('');
  const [about, setAbout] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const hoods = neighborhoodsForCity(city);

  async function sendOtp() {
    setError('');
    const e164 = toE164(phone);
    if (!e164) { setError('Please enter a valid US phone number'); return; }
    setLoading(true);

    try {
      // VOIP / rate limit pre-check on our server
      const checkRes = await fetch('/api/send-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: e164 })
      });
      const checkData = await checkRes.json();
      if (!checkRes.ok) { setError(checkData.error || 'Could not send code'); setLoading(false); return; }

      // Supabase sends the OTP via its configured Twilio Verify provider
      const { error: otpErr } = await supabase.auth.signInWithOtp({ phone: e164 });
      if (otpErr) {
        setError(otpErr.message || 'Could not send code');
        setLoading(false);
        return;
      }

      setPhoneE164(e164);
      setStep('otp');
    } catch (e) {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setError('');
    if (!/^\d{4,8}$/.test(code)) { setError('Enter the code from your text'); return; }
    setLoading(true);

    try {
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        phone: phoneE164,
        token: code,
        type: 'sms'
      });

      if (verifyErr || !data?.user) {
        setError(verifyErr?.message || 'Invalid or expired code');
        setLoading(false);
        return;
      }

      // Check if profile already exists for this user
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile) {
        router.push(destination);
      } else {
        setStep('profile');
      }
    } catch (e) {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function completeProfile() {
    setError('');
    // The same normalizer the profile editor and /api/profile use. profiles.name
    // is what Postgres generates display_name from, so a name joined by a pasted
    // no-break space has to be stored the same way here as anywhere else, or the
    // initials next to it would describe a different name than the one on show.
    const fullName = normalizeFullName(name);
    if (!fullName) { setError('Name required'); return; }
    if (fullName.length > NAME_MAX) { setError(`Name has to be ${NAME_MAX} characters or fewer`); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('A valid email is required for notifications'); return; }
    if (!neighborhood) { setError('Pick your neighborhood'); return; }
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Session expired. Sign in again.'); setLoading(false); return; }

      const { data: cityRow } = await supabase.from('cities').select('id').eq('slug', city).single();
      if (!cityRow) throw new Error('City not found');
      const { data: nb } = await supabase.from('neighborhoods')
        .select('id').eq('city_id', cityRow.id).eq('slug', neighborhood).single();

      // display_name is not written here, and cannot be: Postgres generates it
      // from the column below, so signup and the editor cannot drift apart.
      const { error: insErr } = await supabase.from('profiles').insert({
        id: user.id,
        name: fullName,
        phone_e164: phoneE164,
        phone_verified_at: new Date().toISOString(),
        city_id: cityRow.id,
        neighborhood_id: nb?.id ?? null,
        about: about.trim() || null,
        notify_email: email.trim().toLowerCase(),
        initials: deriveInitials(fullName)
      });

      if (insErr) { setError(insErr.message); setLoading(false); return; }

      // Fire welcome email (non-blocking)
      fetch('/api/welcome', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), name: fullName })
      }).catch(() => {});

      setStep('photo');
    } catch (e) {
      setError('Could not save profile');
    } finally {
      setLoading(false);
    }
  }

  async function onSignupPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || photoBusy) return;
    setError('');
    setPhotoBusy(true);
    try {
      const jpeg = await toAvatarJpeg(file);
      const form = new FormData();
      form.append('file', jpeg, 'avatar.jpg');
      const res = await fetch('/api/avatar', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setPhotoPreview(URL.createObjectURL(jpeg));
    } catch (err: any) {
      setError(err?.message || 'Could not upload that photo');
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <>
      <div className="text-center mb-9">
        <h2 className="font-serif text-[clamp(28px,8vw,36px)] font-bold tracking-tight mb-1.5">
          {fromDraft ? <>One step <em className="italic text-accent">left</em></> : <>Join <em className="italic text-accent">Stoop</em></>}
        </h2>
        <p className="text-sm text-muted">
          {fromDraft
            ? 'Your plan is saved. Verify a number and it goes live.'
            : fromPlan
              ? 'Verify a number, then send your message.'
              : 'Real plans from people in your neighborhood.'}
        </p>
      </div>

      {/* What happens next, and why we are asking, before the first field. */}
      {step === 'phone' && (
        <div className="bg-cream-2 border-l-[3px] border-accent rounded-r-lg px-4 py-3 mb-6">
          <p className="text-[13px] text-ink-2 leading-relaxed mb-2">
            {fromDraft
              ? 'Next: verify a number, add your name and email, then your saved plan goes live.'
              : fromPlan
                ? 'Next: verify a number, add your name and email, then you land back on that plan and can message the host. Messaging does not reserve a spot; the host confirms it.'
                : 'Next: verify a number, add your name and email. Browsing never needed an account; posting and messaging do.'}
          </p>
          <p className="text-[12px] text-muted leading-relaxed">{SIGNUP_REASON}</p>
        </div>
      )}

      {error && (
        <div role="alert" className="bg-danger/10 border border-danger/25 text-danger text-[13px] rounded-xl px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {step === 'phone' && (
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="auth-phone" className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Your phone number</label>
            <input id="auth-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" value={phone}
              onChange={e => setPhone(e.target.value)} className="input" />
            <p className="text-[11px] text-muted mt-1.5">Real mobile only. Google Voice and Burner numbers won&apos;t work.</p>
            <p className="text-[11px] text-muted mt-1">
              Your number just proves you&apos;re a real person. It&apos;s never shown to anyone, and we don&apos;t text you beyond the code.
            </p>
          </div>
          <button type="button" onClick={sendOtp} disabled={loading} className="btn btn-accent btn-full" style={{ padding: 13 }}>
            {loading ? <span className="spinner" /> : 'Send code →'}
          </button>
        </div>
      )}

      {step === 'otp' && (
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="auth-code" className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Code sent to {phoneE164}</label>
            {/* one-time-code lets iOS offer the texted code straight above the
                keyboard, which is most of this flow on mobile Safari. */}
            <input id="auth-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))} className="input" autoFocus />
            <button type="button" onClick={() => setStep('phone')} className="text-[11px] text-muted underline mt-1.5">
              Use a different number
            </button>
          </div>
          <button type="button" onClick={verifyOtp} disabled={loading} className="btn btn-accent btn-full" style={{ padding: 13 }}>
            {loading ? <span className="spinner" /> : 'Verify →'}
          </button>
        </div>
      )}

      {step === 'profile' && (
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="auth-name" className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Your first name</label>
            <input id="auth-name" type="text" autoComplete="given-name" placeholder="e.g. Maya" value={name}
              onChange={e => setName(e.target.value)} className="input" maxLength={50} />
          </div>
          <div>
            <label htmlFor="auth-city" className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Your city</label>
            <select id="auth-city" value={city} onChange={e => { setCity(e.target.value); setNeighborhood(''); }} className="input cursor-pointer">
              <option value="nyc">New York City</option>
              <option value="austin">Austin</option>
            </select>
          </div>
          <div>
            <label htmlFor="auth-hood" className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Your neighborhood</label>
            <select id="auth-hood" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} className="input cursor-pointer">
              <option value="">Where are you based?</option>
              {hoods.map(hood => <option key={hood.slug} value={hood.slug}>{hood.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="auth-email" className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Your email</label>
            <input id="auth-email" type="email" inputMode="email" autoComplete="email" placeholder="e.g. you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} className="input" maxLength={254} aria-describedby="auth-email-why" />
            <p id="auth-email-why" className="text-[11px] text-muted mt-1.5">
              This is how you hear that someone joined. There is no app to check.
            </p>
          </div>
          <div>
            <label htmlFor="auth-about" className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">
              One line about you <span className="lowercase text-[10px] normal-case">(optional)</span>
            </label>
            <input id="auth-about" type="text" placeholder="e.g. designer, moved from Chicago…" value={about}
              onChange={e => setAbout(e.target.value)} className="input" maxLength={140} />
          </div>
          <button type="button" onClick={completeProfile} disabled={loading} className="btn btn-accent btn-full" style={{ padding: 13 }}>
            {loading ? <span className="spinner" /> : 'Create my account →'}
          </button>
          <p className="text-[11px] text-muted text-center leading-[1.6]">
            By creating an account you agree to our{' '}
            <Link href="/terms" className="underline underline-offset-2 hover:text-ink">Community Standard &amp; Terms</Link>.
          </p>
        </div>
      )}

      {step === 'photo' && (
        <div className="flex flex-col items-center gap-5 text-center">
          <p className="text-[14px] text-ink-2 leading-[1.65] max-w-[320px]">
            One last thing: add a photo. It is how a neighbor recognizes you when you meet. Just one, and you can change it anytime.
          </p>
          <div className="w-[104px] h-[104px] rounded-[28px] bg-cream-2 border border-[var(--border)] flex items-center justify-center overflow-hidden">
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="Your photo" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[32px] opacity-30">☺</span>
            )}
          </div>
          {photoPreview ? (
            <>
              <button type="button" onClick={() => router.push(destination)} className="btn btn-accent btn-full" style={{ padding: 13 }}>
                {destination === '/post' ? 'Looks good, now publish my plan →' : 'Looks good, take me in →'}
              </button>
              <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoBusy}
                className="text-[12px] text-muted underline underline-offset-2 hover:text-ink">
                Use a different photo
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoBusy}
                className="btn btn-accent btn-full" style={{ padding: 13 }}>
                {photoBusy ? <span className="spinner" /> : 'Add a photo'}
              </button>
              <button type="button" onClick={() => router.push(destination)}
                className="text-[12px] text-muted underline underline-offset-2 hover:text-ink">
                Skip for now
              </button>
            </>
          )}
          <input ref={photoInputRef} type="file" accept="image/*" onChange={onSignupPhotoPicked} className="hidden" />
        </div>
      )}
    </>
  );
}

// useSearchParams requires a Suspense boundary at build time. Nav and the main
// landmark sit OUTSIDE it so the server-rendered fallback already has the one
// <main id="main"> the skip link points at, rather than gaining it only after
// hydration.
export default function AuthPage() {
  return (
    <>
      <Nav />
      <PageMain className="max-w-[440px] mx-auto px-6 py-12">
        <Suspense fallback={<div className="py-20 text-center text-muted text-sm">Loading…</div>}>
          <AuthContent />
        </Suspense>
      </PageMain>
    </>
  );
}