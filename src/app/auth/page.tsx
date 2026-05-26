'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toE164 } from '@/lib/utils';
import Nav from '@/components/Nav';

type Step = 'phone' | 'otp' | 'profile';

export default function AuthPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('nyc');
  const [neighborhood, setNeighborhood] = useState('');
  const [about, setAbout] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    if (!neighborhood) { setError('Pick your neighborhood'); return; }
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Session expired. Sign in again.'); return; }

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
        initials
      });

      if (insErr) { setError(insErr.message); setLoading(false); return; }
      router.push('/feed');
    } catch (e) {
      setError('Could not save profile');
    } finally {
      setLoading(false);
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
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1.5">
                One line about you <span className="lowercase text-[10px] normal-case">(optional)</span>
              </label>
              <input type="text" placeholder="e.g. designer, moved from Chicago…" value={about}
                onChange={e => setAbout(e.target.value)} className="input" maxLength={140} />
            </div>
            <button onClick={completeProfile} disabled={loading} className="btn btn-accent btn-full" style={{ padding: 13 }}>
              {loading ? <span className="spinner" /> : 'Create my account →'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}