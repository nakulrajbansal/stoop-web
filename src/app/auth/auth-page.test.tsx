/**
 * @vitest-environment jsdom
 *
 * Two doors, one room.
 *
 * The header now offers Sign up and Sign in as separate actions, which is what
 * a visitor expects and what was missing. Behind both is the same screen and
 * the same phone verification, because that is the only authentication Stoop
 * has: no password, no provider, nothing to choose between. So `mode` is
 * allowed to do exactly one thing, and these tests are mostly about what it is
 * not allowed to do.
 *
 * It may label the screen. It may not change what the screen does, and it may
 * not let the labelling tell a lie: somebody who arrives on the Sign in door
 * with a number Stoop has never seen is going to be asked for a name and an
 * email, and the page has to say so before they type the number rather than
 * after.
 *
 * The `next` cases are here too, because they came first and must keep winning.
 * Somebody who was sent here mid-draft needs to be told their plan survived,
 * not greeted by whichever door they nominally came through.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AuthPage from './page';

const SOURCE = readFileSync(join(process.cwd(), 'src', 'app', 'auth', 'page.tsx'), 'utf8');

let params = new URLSearchParams();
const push = vi.fn();

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => params
}));

// The header has its own tests. Here it is noise, and it would put a second
// "Sign in" link in the document.
vi.mock('@/components/Nav', () => ({ default: () => null }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
      signInWithOtp: async () => ({ error: null }),
      verifyOtp: async () => ({ data: { user: null }, error: null })
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

beforeEach(() => {
  push.mockReset();
});

afterEach(cleanup);

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

  it('is the same screen doing the same thing', () => {
    renderAt('mode=signin');
    // Same field, same button, same verification. If this ever diverges, the
    // label has started to mean something and there are two flows to keep
    // correct instead of one.
    expect(screen.getByLabelText(/your phone number/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /send code/i })).toBeDefined();
  });

  it('admits that a number Stoop has never seen ends up signing up', () => {
    renderAt('mode=signin');
    // The one way a label on a shared flow can lie. It is said before the
    // field, not discovered two screens later.
    expect(document.body.textContent).toMatch(/if (this|that) number is new/i);
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
    expect(document.body.textContent).toMatch(/verify a number, then send your message/i);
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
});

describe('no door that is not there', () => {
  it('offers no provider button, because Stoop has no provider', () => {
    // Whether Google or Apple sign-in replaces phone verification, precedes it,
    // or waits until somebody wants to post is an unmade product decision. A
    // button that looks like the answer before the decision is made is worse
    // than no button: it is a dead control on the one screen that must work.
    expect(SOURCE).not.toMatch(/signInWithOAuth|provider:/);
    expect(SOURCE).not.toMatch(/(continue|sign in|sign up) with (google|apple)/i);
    // The one true mention of Google on this screen, and it is about VOIP
    // numbers failing verification, not about a way to sign in.
    expect(SOURCE).toMatch(/Google Voice and Burner numbers/);
  });

  it('still verifies a phone number and nothing else', () => {
    expect(SOURCE).toMatch(/signInWithOtp/);
    expect(SOURCE).toMatch(/verifyOtp/);
    expect(SOURCE).toMatch(/type: 'sms'/);
  });

  it('reads mode for wording only, never for what it does next', () => {
    // Where the flow actually branches: on whether a profile row exists, and on
    // the `next` destination. Neither may consult the label.
    const afterVerify = SOURCE.slice(SOURCE.indexOf('async function verifyOtp'), SOURCE.indexOf('async function completeProfile'));
    expect(afterVerify).not.toMatch(/\bmode\b/);
    const send = SOURCE.slice(SOURCE.indexOf('async function sendOtp'), SOURCE.indexOf('async function verifyOtp'));
    expect(send).not.toMatch(/\bmode\b/);
  });
});
