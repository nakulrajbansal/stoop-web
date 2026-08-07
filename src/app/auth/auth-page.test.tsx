/**
 * @vitest-environment jsdom
 *
 * Three doors, one room.
 *
 * The screen used to have exactly one way in, and a test here that said so out
 * loud: no provider button, because whether Google or Apple replaced phone
 * verification, preceded it, or waited was an unmade decision. It has been
 * made. There are now three independent avenues, and the rule that matters most
 * is the one that is easiest to get wrong: somebody who continues with Google
 * or Apple is never asked for a phone number. Not before, not after, not as a
 * "just to be safe" step. If a phone field ever appears in a social signup,
 * that is the whole decision undone.
 *
 * `mode` still only labels the screen. `next` still wins over the label. Both
 * of those came first and both must keep winning.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AuthPage from './page';

const SOURCE = readFileSync(join(process.cwd(), 'src', 'app', 'auth', 'page.tsx'), 'utf8');

let params = new URLSearchParams();
const push = vi.fn();
const signInWithOAuth = vi.fn();
const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
let sessionUser: any = null;

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => params
}));

vi.mock('@/components/Nav', () => ({ default: () => null }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: sessionUser } }),
      signInWithOAuth: (...a: any[]) => signInWithOAuth(...a),
      signInWithOtp: (...a: any[]) => signInWithOtp(...a),
      verifyOtp: (...a: any[]) => verifyOtp(...a)
    },
    from: () => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: null, error: null })
      };
      return chain;
    }
  })
}));

function renderAt(query: string) {
  params = new URLSearchParams(query);
  return render(<AuthPage />);
}

/** The Google identity a completed OAuth round trip leaves on the session. */
const GOOGLE_USER = {
  id: 'user-google',
  email: 'ada@gmail.example',
  phone: null,
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: { full_name: 'Ada Lovelace', name: 'Ada Lovelace', given_name: 'Ada' }
};

/** Apple, first authorization, private relay on and no name shared. */
const APPLE_USER = {
  id: 'user-apple',
  email: 'zx9q2h4k7t@privaterelay.appleid.com',
  phone: null,
  app_metadata: { provider: 'apple', providers: ['apple'] },
  user_metadata: {}
};

beforeEach(() => {
  push.mockReset();
  signInWithOAuth.mockReset();
  signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.example/o/oauth2' }, error: null });
  signInWithOtp.mockReset();
  signInWithOtp.mockResolvedValue({ error: null });
  verifyOtp.mockReset();
  sessionUser = null;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('three ways in', () => {
  it('offers Google, Apple and phone, and nothing else', () => {
    renderAt('mode=signup');
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /continue with apple/i })).toBeDefined();
    expect(screen.getByLabelText(/your phone number/i)).toBeDefined();

    const providerButtons = screen
      .getAllByRole('button')
      .filter(b => /continue with/i.test(b.textContent ?? ''));
    expect(providerButtons).toHaveLength(2);
  });

  it('puts both provider buttons above the phone field, with a divider between', () => {
    renderAt('mode=signup');
    const google = screen.getByRole('button', { name: /continue with google/i });
    const phone = screen.getByLabelText(/your phone number/i);
    // Node.DOCUMENT_POSITION_FOLLOWING: the phone field comes after the button.
    expect(google.compareDocumentPosition(phone) & 4).toBeTruthy();
    expect(document.body.textContent).toMatch(/or use your phone/i);
  });

  it('offers all three on the sign-in door too', () => {
    renderAt('mode=signin');
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /continue with apple/i })).toBeDefined();
    expect(screen.getByLabelText(/your phone number/i)).toBeDefined();
  });

  it('says Google, which is what the provider is called, and never Gmail', () => {
    renderAt('mode=signup');
    const google = screen.getByRole('button', { name: /continue with google/i });
    expect(google.textContent).not.toMatch(/gmail/i);
  });
});

describe('starting a provider round trip', () => {
  it('asks Supabase for the right provider', async () => {
    renderAt('mode=signup');
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalled());
    expect(signInWithOAuth.mock.calls[0][0].provider).toBe('google');

    cleanup();
    renderAt('mode=signup');
    fireEvent.click(screen.getByRole('button', { name: /continue with apple/i }));
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(2));
    expect(signInWithOAuth.mock.calls[1][0].provider).toBe('apple');
  });

  it('comes back to this deployment, not to whatever a build-time variable says', async () => {
    renderAt('mode=signup&next=post');
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalled());

    const redirectTo = new URL(signInWithOAuth.mock.calls[0][0].options.redirectTo);
    expect(redirectTo.origin).toBe(window.location.origin);
    expect(redirectTo.pathname).toBe('/auth/callback');
    expect(redirectTo.searchParams.get('next')).toBe('post');
    // A preview tester who is bounced to production has authenticated against
    // the wrong database, and will not find their account when they come back.
    expect(SOURCE).not.toMatch(/NEXT_PUBLIC_APP_URL/);
  });

  it('sanitizes the destination before it ever reaches the provider', async () => {
    renderAt('mode=signup&next=https%3A%2F%2Fevil.example%2Fsteal');
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalled());

    const redirectTo = signInWithOAuth.mock.calls[0][0].options.redirectTo;
    expect(redirectTo).not.toMatch(/evil\.example/);
  });

  it('disables both buttons while one is in flight, so a double tap is not two round trips', async () => {
    signInWithOAuth.mockImplementation(() => new Promise(() => {}));
    renderAt('mode=signup');
    const google = screen.getByRole('button', { name: /continue with google/i });
    fireEvent.click(google);

    await waitFor(() => expect(google).toHaveProperty('disabled', true));
    expect(screen.getByRole('button', { name: /continue with apple/i })).toHaveProperty('disabled', true);

    fireEvent.click(google);
    fireEvent.click(google);
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it('says so plainly when the provider cannot be reached, and stays on the screen', async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: 'provider is not enabled' } });
    renderAt('mode=signup');
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBeTruthy();
    // Never the provider's own words, and never a claim that it worked.
    expect(alert.textContent).not.toMatch(/provider is not enabled/i);
    expect(screen.getByLabelText(/your phone number/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /continue with google/i })).toHaveProperty('disabled', false);
  });
});

describe('a Google or Apple user finishing their profile', () => {
  it('never sees a phone field or an OTP field', async () => {
    sessionUser = GOOGLE_USER;
    renderAt('step=profile');

    await screen.findByLabelText(/your first name/i);
    expect(screen.queryByLabelText(/your phone number/i)).toBeNull();
    expect(screen.queryByLabelText(/code sent to/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /send code/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /verify/i })).toBeNull();
  });

  it('prefills the given name Google shared, because retyping it is friction for nothing', async () => {
    sessionUser = GOOGLE_USER;
    renderAt('step=profile');
    const name = (await screen.findByLabelText(/your first name/i)) as HTMLInputElement;
    expect(name.value).toBe('Ada');
  });

  it('works when Apple shares no name at all, which is every login after the first', async () => {
    sessionUser = APPLE_USER;
    renderAt('step=profile');
    const name = (await screen.findByLabelText(/your first name/i)) as HTMLInputElement;
    expect(name.value).toBe('');
    expect(name.disabled).toBe(false);
  });

  it('shows the provider address and does not let it be edited', async () => {
    sessionUser = GOOGLE_USER;
    renderAt('step=profile');
    const email = (await screen.findByLabelText(/your email/i)) as HTMLInputElement;
    expect(email.value).toBe('ada@gmail.example');
    expect(email.readOnly || email.disabled).toBe(true);
  });

  it('accepts an Apple private relay address as the real thing', async () => {
    sessionUser = APPLE_USER;
    renderAt('step=profile');
    const email = (await screen.findByLabelText(/your email/i)) as HTMLInputElement;
    expect(email.value).toBe('zx9q2h4k7t@privaterelay.appleid.com');
    expect(document.body.textContent).not.toMatch(/invalid|not supported/i);
  });

  it('sends the provider it actually has, and no email, to the server', async () => {
    sessionUser = GOOGLE_USER;
    renderAt('step=profile');
    await screen.findByLabelText(/your first name/i);

    fireEvent.change(screen.getByLabelText(/your neighborhood/i), { target: { value: 'williamsburg' } });
    fireEvent.click(screen.getByRole('button', { name: /create my account/i }));

    await waitFor(() => {
      const calls = (globalThis.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes('/api/profile'));
      expect(calls.length).toBe(1);
    });
    const call = (globalThis.fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes('/api/profile'));
    expect(call[1].method).toBe('POST');
    const body = JSON.parse(call[1].body);
    expect(body.provider).toBe('google');
    expect(body.email).toBeUndefined();
    expect(body.id).toBeUndefined();
  });

  it('is sent back to the phone step if the session evaporated before it could ask', async () => {
    sessionUser = null;
    renderAt('step=profile');
    await waitFor(() => expect(screen.getByLabelText(/your phone number/i)).toBeDefined());
  });
});

describe('a fixed failure coming back from the callback', () => {
  it('explains a cancelled provider screen without repeating it', async () => {
    renderAt('err=denied');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/\w{20,}|\w+ \w+/);
    expect(alert.textContent).not.toMatch(/access_denied|error_description/);
    // And the other two doors are still right there.
    expect(screen.getByRole('button', { name: /continue with apple/i })).toBeDefined();
    expect(screen.getByLabelText(/your phone number/i)).toBeDefined();
  });

  it('shows nothing but fixed copy, whatever is stuffed into the parameter', async () => {
    renderAt('err=%3Cimg+src%3Dx+onerror%3Dalert(1)%3E');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toMatch(/img|onerror|alert\(/);
  });
});

describe('phone signup, unchanged', () => {
  it('still sends a code and still verifies it', () => {
    expect(SOURCE).toMatch(/signInWithOtp/);
    expect(SOURCE).toMatch(/verifyOtp/);
    expect(SOURCE).toMatch(/type: 'sms'/);
  });

  it('still explains that a VOIP number will not verify', () => {
    renderAt('mode=signup');
    expect(document.body.textContent).toMatch(/Google Voice and Burner numbers/);
  });

  it('still asks a phone signup for a notification email it can type', async () => {
    sessionUser = { id: 'user-phone', phone: '+15550001001', app_metadata: { provider: 'phone' } };
    renderAt('step=profile');
    const email = (await screen.findByLabelText(/your email/i)) as HTMLInputElement;
    expect(email.readOnly).toBe(false);
    expect(email.disabled).toBe(false);
  });
});

describe('the browser writes no profile row', () => {
  it('has no profiles insert left anywhere on this screen', () => {
    expect(SOURCE).not.toMatch(/from\('profiles'\)[\s\S]{0,120}\.insert\(/);
    expect(SOURCE).not.toMatch(/phone_verified_at/);
    expect(SOURCE).not.toMatch(/is_founding_member/);
  });

  it('does not choose who the welcome email goes to', () => {
    // It used to POST an address and a name of its own choosing to /api/welcome.
    expect(SOURCE).not.toMatch(/'\/api\/welcome'/);
  });

  it('creates the account through the server boundary', () => {
    expect(SOURCE).toMatch(/'\/api\/profile'/);
  });
});

describe('the sign-up door', () => {
  it('greets somebody making an account, and still says why we ask', () => {
    renderAt('mode=signup');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/join stoop/i);
    expect(screen.getByLabelText(/your phone number/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /send code/i })).toBeDefined();
  });

  it('offers an existing member the way back, since the header drops Sign in on a phone', () => {
    renderAt('mode=signup');
    const back = screen.getByRole('link', { name: /sign in/i });
    expect(back.getAttribute('href')).toBe('/auth?mode=signin');
  });
});

describe('the sign-in door', () => {
  it('greets somebody coming back', () => {
    renderAt('mode=signin');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/welcome back/i);
  });

  it('admits that a number Stoop has never seen ends up signing up', () => {
    renderAt('mode=signin');
    expect(document.body.textContent).toMatch(/if (this|that) number is new/i);
  });

  it('asks people to come back the way they joined, phone members by number', () => {
    // The line points everybody at the avenue they used, and names the phone
    // case outright because that is the one Stoop can be sure about. It does
    // not promise what happens if somebody picks a different avenue; that is
    // Supabase's identity behaviour, not a guarantee the screen makes.
    renderAt('mode=signin');
    expect(document.body.textContent).toMatch(/signed up with (your |a )?(phone|number)/i);
  });

  it('sends a first-timer to the other door', () => {
    renderAt('mode=signin');
    const join = screen.getByRole('link', { name: /sign up/i });
    expect(join.getAttribute('href')).toBe('/auth?mode=signup');
  });
});

describe('what mode is not allowed to disturb', () => {
  it('leaves the draft greeting in charge when somebody was sent here mid-plan', () => {
    renderAt('mode=signin&next=post');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/one step/i);
    expect(document.body.textContent).toMatch(/your plan is saved/i);
  });

  it('leaves the plan greeting in charge when somebody was sent here to message', () => {
    renderAt('mode=signup&next=/plan/coffee-saturday-ab12');
    // The greeting is about the message they came to send, not the generic one.
    // It no longer says "verify a number" because with three doors that is not
    // what most people are about to do.
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/join stoop/i);
    expect(document.body.textContent).toMatch(/then send your message/i);
    expect(document.body.textContent).not.toMatch(/real plans from people in your neighborhood/i);
  });

  it('carries the destination across when somebody swaps doors', () => {
    renderAt('mode=signin&next=post');
    const join = screen.getByRole('link', { name: /sign up/i });
    expect(join.getAttribute('href')).toBe('/auth?mode=signup&next=post');
  });

  it('defaults to the sign-up framing when no mode is given at all', () => {
    renderAt('');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/join stoop/i);
  });

  it('reads mode for wording only, never for what it does next', () => {
    const afterVerify = SOURCE.slice(
      SOURCE.indexOf('async function verifyOtp'),
      SOURCE.indexOf('async function completeProfile')
    );
    expect(afterVerify).not.toMatch(/\bmode\b/);
    const send = SOURCE.slice(SOURCE.indexOf('async function sendOtp'), SOURCE.indexOf('async function verifyOtp'));
    expect(send).not.toMatch(/\bmode\b/);
  });
});
