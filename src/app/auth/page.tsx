'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toE164 } from '@/lib/utils';
import { toAvatarJpeg } from '@/lib/avatar-image';
import { neighborhoodsForCity } from '@/lib/neighborhoods';
import { SIGNUP_REASON } from '@/lib/product-copy';
import { NAME_MAX, normalizeFullName } from '@/lib/profile-identity';
import { authErrorCopy } from '@/lib/auth-errors';
import { carriedNext, safeDestination, safeMode } from '@/lib/safe-redirect';
import { AppleMark, GoogleMark } from '@/components/ProviderMarks';
import Nav from '@/components/Nav';
import PageMain from '@/components/PageMain';

/**
 * `resuming` is the moment after an OAuth round trip, while the session is
 * being read. It exists so a Google member never sees the phone field flash up
 * before the profile form replaces it.
 */
type Step = 'resuming' | 'phone' | 'otp' | 'profile' | 'photo';

type Provider = 'phone' | 'google' | 'apple';

const PROVIDER_UNAVAILABLE =
  'That way in is not available right now. Try the other one, or use your phone number.';

/**
 * The first name a provider shared, if it shared one. Only ever a prefill in a
 * field the person can edit, and the server normalizes and bounds whatever is
 * finally submitted. Apple sends a name on the FIRST authorization and never
 * again, so absent is the normal case, not an error.
 */
function givenNameFrom(metadata: unknown): string {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  const candidate = [meta.given_name, meta.name, meta.full_name].find(
    value => typeof value === 'string' && value.trim()
  );
  return normalizeFullName(candidate).split(' ')[0]?.slice(0, NAME_MAX) ?? '';
}

function AuthContent() {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();

  // Where to land after auth: back to a half-written plan, or back to the plan
  // they wanted to join. The rule lives in src/lib/safe-redirect.ts because the
  // server callback route has to apply exactly the same one.
  const rawNext = searchParams.get('next') ?? '';
  const destination = safeDestination(rawNext);
  const fromDraft = destination === '/post';
  const fromPlan = destination.startsWith('/plan/');

  // Which door they came through. There are three ways to authenticate now, but
  // still one screen behind Sign up and Sign in, so `mode` labels this page and
  // does nothing else. It is read here, in the render, and never inside sendOtp
  // or verifyOtp, because the moment it reaches those the label has become a
  // second flow to keep correct.
  //
  // The label is only allowed to be accurate. Somebody who arrives on the
  // sign-in door with a number Stoop has never seen is going to be asked for a
  // name and an email, and the panel below says so before they type anything.
  const mode = safeMode(searchParams.get('mode'));
  const carried = carriedNext(rawNext);
  const carry = carried ? `&next=${encodeURIComponent(carried)}` : '';

  // Set by the server callback route when somebody came back from a provider
  // with a session and no profile yet.
  const resuming = searchParams.get('step') === 'profile';

  const [step, setStep] = useState<Step>(resuming ? 'resuming' : 'phone');
  const [provider, setProvider] = useState<Provider>('phone');
  const [identityEmail, setIdentityEmail] = useState('');
  const [oauthBusy, setOauthBusy] = useState<'google' | 'apple' | null>(null);
  const [phone, setPhone] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('nyc');
  const [neighborhood, setNeighborhood] = useState('');
  const [about, setAbout] = useState('');
  // A failure coming back from the callback arrives as a fixed code. Whatever
  // is actually in the parameter, only fixed copy is ever shown.
  const [error, setError] = useState(searchParams.get('err') ? authErrorCopy(searchParams.get('err')) : '');
  const [loading, setLoading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const hoods = neighborhoodsForCity(city);
  const isSocial = provider !== 'phone';

  // Coming back from Google or Apple. The session is the authority on who this
  // is; app_metadata.provider is read only to decide what to show, and the
  // database re-checks the identity against auth.identities before it writes
  // anything, so a wrong guess here cannot become a wrong row.
  useEffect(() => {
    if (!resuming) return;
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        setError('That sign in did not finish. Try again.');
        setStep('phone');
        return;
      }

      const claimed = (user.app_metadata as { provider?: string } | undefined)?.provider;
      const resolved: Provider = claimed === 'google' ? 'google' : claimed === 'apple' ? 'apple' : 'phone';
      setProvider(resolved);
      setIdentityEmail(typeof user.email === 'string' ? user.email : '');
      if (resolved !== 'phone') {
        const given = givenNameFrom(user.user_metadata);
        if (given) setName(given);
      }
      setStep('profile');
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resuming]);

  async function continueWith(chosen: 'google' | 'apple') {
    if (oauthBusy) return;
    setError('');
    setOauthBusy(chosen);

    try {
      // Built from the origin this page is actually on, never from a configured
      // production URL: a preview tester bounced to production authenticates
      // against the wrong database and will not find their account afterwards.
      const back = new URL('/auth/callback', window.location.origin);
      if (carried) back.searchParams.set('next', carried);
      if (mode === 'signin') back.searchParams.set('mode', mode);

      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: chosen,
        options: { redirectTo: back.toString() }
      });

      if (oauthErr) {
        // Never the provider's own words, and never a claim that it worked.
        setError(PROVIDER_UNAVAILABLE);
        setOauthBusy(null);
        return;
      }
      // On success the browser is already navigating away. The buttons stay
      // disabled so a second tap cannot start a second round trip.
    } catch {
      setError(PROVIDER_UNAVAILABLE);
      setOauthBusy(null);
    }
  }

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
        setProvider('phone');
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
    // The same normalizer the profile editor, /api/profile and the database
    // use. profiles.name is what Postgres generates display_name from, so a
    // name joined by a pasted no-break space has to be stored the same way here
    // as anywhere else, or the initials next to it would describe a different
    // name than the one on show.
    const fullName = normalizeFullName(name);
    if (!fullName) { setError('Name required'); return; }
    if (fullName.length > NAME_MAX) { setError(`Name has to be ${NAME_MAX} characters or fewer`); return; }
    // A Google or Apple account has a provider address and does not type one.
    if (!isSocial && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('A valid email is required for notifications');
      return;
    }
    if (!neighborhood) { setError('Pick your neighborhood'); return; }
    setLoading(true);

    try {
      // The browser no longer writes this row. It cannot: it has no way to
      // prove which identity it holds, and the provider, the verified time and
      // the notification address all have to come from auth rather than from
      // this form. The server verifies the session and the database verifies
      // the identity.
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          name: fullName,
          city,
          neighborhood,
          about: about.trim() || undefined,
          ...(isSocial
            ? {}
            : {
                email: email.trim().toLowerCase(),
                ...(phoneE164 ? { phone: phoneE164 } : {})
              })
        })
      });

      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        setError(data?.error || 'Could not save profile');
        setLoading(false);
        return;
      }

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
          {fromDraft
            ? <>One step <em className="italic text-accent">left</em></>
            : mode === 'signin'
              ? <>Welcome <em className="italic text-accent">back</em></>
              : <>Join <em className="italic text-accent">Stoop</em></>}
        </h2>
        <p className="text-sm text-muted">
          {fromDraft
            ? 'Your plan is saved. One way in and it goes live.'
            : fromPlan
              ? 'Pick a way in, then send your message.'
              : mode === 'signin'
                ? 'Come back in the same way you signed up.'
                : 'Real plans from people in your neighborhood.'}
        </p>
      </div>

      {error && (
        <div role="alert" className="bg-danger/10 border border-danger/25 text-danger text-[13px] rounded-xl px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {step === 'resuming' && (
        <p className="py-16 text-center text-muted text-sm">Signing you in…</p>
      )}

      {step === 'phone' && (
        <>
          {/* Three ways in, and the two that need no typing come first. */}
          <div className="flex flex-col gap-3 mb-1">
            <button type="button" onClick={() => continueWith('google')} disabled={!!oauthBusy}
              className="btn btn-provider btn-full">
              {oauthBusy === 'google' ? <span className="spinner" /> : <GoogleMark size={18} />}
              Continue with Google
            </button>
            <button type="button" onClick={() => continueWith('apple')} disabled={!!oauthBusy}
              className="btn btn-provider btn-full">
              {oauthBusy === 'apple' ? <span className="spinner" /> : <AppleMark size={18} />}
              Continue with Apple
            </button>
          </div>
          <p className="text-[11px] text-muted text-center mt-2.5 leading-relaxed">
            Any Google account works, including a Gmail address. Neither one is asked for a phone number.
          </p>

          <div className="flex items-center gap-3 my-6">
            <span aria-hidden="true" className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted">or use your phone</span>
            <span aria-hidden="true" className="h-px flex-1 bg-[var(--border)]" />
          </div>

          {/* What happens next, and why we are asking, before the first field. */}
          <div className="bg-cream-2 border-l-[3px] border-accent rounded-r-lg px-4 py-3 mb-6">
            <p className="text-[13px] text-ink-2 leading-relaxed mb-2">
              {fromDraft
                ? 'Next: verify a number, add your name and email, then your saved plan goes live.'
                : fromPlan
                  ? 'Next: verify a number, add your name and email, then you land back on that plan and can message the host. Messaging does not reserve a spot; the host confirms it.'
                  : mode === 'signin'
                    ? 'Next: verify your number and you are back in. If this number is new to Stoop, you will be asked for a name and email, and that signs you up.'
                    : 'Next: verify a number, add your name and email. Browsing never needed an account; posting and messaging do.'}
            </p>
            <p className="text-[12px] text-muted leading-relaxed">{SIGNUP_REASON}</p>
          </div>

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

            {/* People come back through whichever door they used, so that is
                what this line asks for. Saying it costs one line; not saying it
                costs a support conversation about a plan somebody cannot find. */}
            <p className="text-[12px] text-muted text-center leading-[1.6]">
              Come back the same way you joined and your plans will be where you left them. If you signed up with your phone number, sign in with it.
            </p>

            {/* The way across to the other door. It matters most on a phone,
                where the header has room for Browse, Post a plan and Sign up but
                not for Sign in as well, so this is where an existing member finds
                their footing. Both links land on this same screen. */}
            <p className="text-[12.5px] text-muted text-center leading-[1.6]">
              {mode === 'signin' ? (
                <>
                  New to Stoop?{' '}
                  <Link href={`/auth?mode=signup${carry}`} className="underline underline-offset-2 hover:text-ink">
                    Sign up
                  </Link>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <Link href={`/auth?mode=signin${carry}`} className="underline underline-offset-2 hover:text-ink">
                    Sign in
                  </Link>
                </>
              )}
            </p>
          </div>
        </>
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
            <input id="auth-email" type="email" inputMode="email" autoComplete="email" placeholder="e.g. you@example.com"
              value={isSocial ? identityEmail : email}
              onChange={e => setEmail(e.target.value)}
              readOnly={isSocial}
              className="input" maxLength={254} aria-describedby="auth-email-why" />
            <p id="auth-email-why" className="text-[11px] text-muted mt-1.5">
              {isSocial
                ? 'This came from the account you just used, so there is nothing to type. It is how you hear that someone joined, and it is never shown on the site.'
                : 'This is how you hear that someone joined. There is no app to check.'}
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
