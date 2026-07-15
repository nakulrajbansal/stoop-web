'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toE164 } from '@/lib/utils';
import { toAvatarJpeg } from '@/lib/avatar-image';
import Nav from '@/components/Nav';

type Step = 'phone' | 'otp' | 'profile' | 'photo';

export default function AuthPage() {
  const router = useRouter();
  const supabase = createClient();

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

  const hoods = city === 'austin'
    ? ['east-austin', 'south-congress', 'mueller', 'hyde-park', 'east-cesar-chavez', 'clarksville']
    : ['williamsburg', 'west-village', 'park-slope', 'lower-east-side', 'astoria', 'bushwick', 'greenpoint', 'harlem'];

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
        router.push('/feed');
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
    if (!name.trim() || name.trim().length < 1) { setError('Name required'); return; }
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

      const trimmed = name.trim();
      const initials = trimmed.split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join('').substring(0, 2);

      const { error: insErr } = await supabase.from('profiles').insert({
        id: user.id,
        name: trimmed,
        phone_e164: phoneE164,
        phone_verified_at: new Date().toISOString(),
        city_id: cityRow.id,
        neighborhood_id: nb?.id ?? null,
        about: about.trim() || null,
        notify_email: email.trim().toLowerCase(),
        initials
      });

      if (insErr) { setError(insErr.message); setLoading(false); return; }

      // Fire welcome email (non-blocking)
      fetch('/api/welcome', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), name: trimmed })
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
      <Nav />
      <div className="max-w-[440px] mx-auto px-6 py-12">
        <div className="text-center mb-9">
          <h2 className="font-serif text-[36px] font-bold tracking-tight mb-1.5">
            Join <em className="italic text-accent">Stoop</em>
          </h2>
          <p className="text-sm text-muted">No algorithm. No swiping. Just plans and people.</p>
        </div>

        {error && (
          <div className="bg-[rgba(200,71,42,0.08)] border border-[rgba(200,71,42,0.25)] text-accent text-[13px] rounded-xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {step === 'phone' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Your phone number</label>
              <input type="tel" inputMode="tel" placeholder="(555) 123-4567" value={phone}
                onChange={e => setPhone(e.target.value)} className="input" />
              <p className="text-[11px] text-muted mt-1.5">Real mobile only. Google Voice and Burner numbers won&apos;t work.</p>
            </div>
            <button onClick={sendOtp} disabled={loading} className="btn btn-accent btn-full" style={{ padding: 13 }}>
              {loading ? <span className="spinner" /> : 'Send code →'}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Code sent to {phoneE164}</label>
              <input type="text" inputMode="numeric" maxLength={6} placeholder="123456" value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))} className="input" autoFocus />
              <button onClick={() => setStep('phone')} className="text-[11px] text-muted underline mt-1.5">
                Use a different number
              </button>
            </div>
            <button onClick={verifyOtp} disabled={loading} className="btn btn-accent btn-full" style={{ padding: 13 }}>
              {loading ? <span className="spinner" /> : 'Verify →'}
            </button>
          </div>
        )}

        {step === 'profile' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Your first name</label>
              <input type="text" placeholder="e.g. Maya" value={name}
                onChange={e => setName(e.target.value)} className="input" maxLength={50} />
            </div>
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Your city</label>
              <select value={city} onChange={e => { setCity(e.target.value); setNeighborhood(''); }} className="input cursor-pointer">
                <option value="nyc">New York City</option>
                <option value="austin">Austin</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Your neighborhood</label>
              <select value={neighborhood} onChange={e => setNeighborhood(e.target.value)} className="input cursor-pointer">
                <option value="">Where are you based?</option>
                {hoods.map(h => <option key={h} value={h} className="capitalize">{h.replace(/-/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">Your email</label>
              <input type="email" placeholder="e.g. you@example.com" value={email}
                onChange={e => setEmail(e.target.value)} className="input" maxLength={254} />
            </div>
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">
                One line about you <span className="lowercase text-[10px] normal-case">(optional)</span>
              </label>
              <input type="text" placeholder="e.g. designer, moved from Chicago…" value={about}
                onChange={e => setAbout(e.target.value)} className="input" maxLength={140} />
            </div>
            <button onClick={completeProfile} disabled={loading} className="btn btn-accent btn-full" style={{ padding: 13 }}>
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
              One last thing: add a photo. Plans posted with a face get joined a lot more. Just one, and you can change it anytime.
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
                <button onClick={() => router.push('/feed')} className="btn btn-accent btn-full" style={{ padding: 13 }}>
                  Looks good, take me in →
                </button>
                <button onClick={() => photoInputRef.current?.click()} disabled={photoBusy}
                  className="text-[12px] text-muted underline underline-offset-2 hover:text-ink">
                  Use a different photo
                </button>
              </>
            ) : (
              <>
                <button onClick={() => photoInputRef.current?.click()} disabled={photoBusy}
                  className="btn btn-accent btn-full" style={{ padding: 13 }}>
                  {photoBusy ? <span className="spinner" /> : 'Add a photo'}
                </button>
                <button onClick={() => router.push('/feed')}
                  className="text-[12px] text-muted underline underline-offset-2 hover:text-ink">
                  Skip for now
                </button>
              </>
            )}
            <input ref={photoInputRef} type="file" accept="image/*" onChange={onSignupPhotoPicked} className="hidden" />
          </div>
        )}
      </div>
    </>
  );
}