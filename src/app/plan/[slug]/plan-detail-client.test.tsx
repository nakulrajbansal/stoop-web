/**
 * @vitest-environment jsdom
 *
 * The plan page has two things it could say about a full plan, and only one of
 * them is true for the person who filled it. Somebody whose confirmation took
 * the last spot must see that they are confirmed, not the generic "this plan is
 * full, post your own" that is meant for a stranger arriving late.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams()
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>{children}</a>
  )
}));

let currentUser: { id: string } | null = null;
let conversationRow: { id: string; status: string } | null = null;

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: () => {
      const proxy: any = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'maybeSingle') return async () => ({ data: conversationRow });
            if (prop === 'then') return undefined;
            return () => proxy;
          }
        }
      );
      return proxy;
    }
  })
}));

import PlanDetailClient from './PlanDetailClient';

const FULL_PLAN = {
  id: 'plan-1',
  slug: 'coffee-at-partners-ab12',
  user_id: 'user-host',
  text: 'coffee at Partners on Wythe saturday morning before the market gets busy, come sit',
  category: 'coffee',
  when_day: 'Saturday',
  when_time_specific: '9:00 AM',
  spot: 'Partners Coffee',
  spots_left: 0,
  spots_total: 1,
  status: 'full',
  cost_expectation: 'pay-own-way',
  intent_tags: [],
  neighborhood: { name: 'Williamsburg' },
  poster: { id: 'user-host', name: 'Maya', initials: 'M', avatar_bg: '#D4E8D8', avatar_fg: '#2A4232', about: null }
};

beforeEach(() => {
  currentUser = null;
  conversationRow = null;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a full plan you are confirmed for', () => {
  it('shows the confirmed state and the conversation, not the generic full-plan CTA', async () => {
    currentUser = { id: 'user-joiner' };
    conversationRow = { id: 'conv-1', status: 'confirmed' };

    render(<PlanDetailClient initialPlan={FULL_PLAN} hostPlanCount={0} />);

    await screen.findByRole('link', { name: /open conversation/i });
    expect(screen.getByText(/Your spot is reserved\./)).toBeDefined();
    expect(screen.queryByText(/but you can/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /post your own/i })).toBeNull();
  });

  it('does the same for a pending request on a plan that filled up', async () => {
    currentUser = { id: 'user-joiner' };
    conversationRow = { id: 'conv-1', status: 'pending' };

    render(<PlanDetailClient initialPlan={FULL_PLAN} hostPlanCount={0} />);

    await screen.findByRole('link', { name: /open conversation/i });
    expect(screen.getByText(/No spot is reserved\./)).toBeDefined();
    expect(screen.queryByRole('link', { name: /post your own/i })).toBeNull();
  });
});

describe('what the public host card is allowed to say', () => {
  // A display name can be two words. Every visible surface already shortens it
  // with firstNameOf, but the avatar took the whole thing and turned it into
  // alt text, which is public HTML on a page anybody can read without an
  // account. The private roster is the only place a full name may appear.
  const TWO_PART = {
    ...FULL_PLAN,
    poster: { ...FULL_PLAN.poster, name: 'Maya Okonkwo' }
  };

  it('shows a signed-out visitor the first name and nothing more', async () => {
    currentUser = null;
    const { container } = render(<PlanDetailClient initialPlan={TWO_PART} hostPlanCount={0} />);

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('Maya')).toBeDefined();
    // Covers text, attributes and alt text in one pass.
    expect(container.innerHTML).not.toContain('Okonkwo');
  });

  it('names the avatar after the first name, because alt text is public too', async () => {
    currentUser = null;
    const { container } = render(<PlanDetailClient initialPlan={TWO_PART} hostPlanCount={0} />);

    await screen.findByRole('heading', { level: 1 });
    const avatar = container.querySelector('img[alt]') as HTMLImageElement | null;
    expect(avatar, 'no avatar image rendered').not.toBeNull();
    expect(avatar!.getAttribute('alt')).toBe("Maya's photo");
    expect(avatar!.getAttribute('alt')).not.toContain('Okonkwo');
  });

  it('still works for a host whose display name is one word', async () => {
    currentUser = null;
    const { container } = render(<PlanDetailClient initialPlan={FULL_PLAN} hostPlanCount={0} />);

    await screen.findByRole('heading', { level: 1 });
    const avatar = container.querySelector('img[alt]') as HTMLImageElement | null;
    expect(avatar!.getAttribute('alt')).toBe("Maya's photo");
  });
});

describe('the category header the visual pass added', () => {
  it('draws the category without repeating it to a screen reader', async () => {
    currentUser = null;
    const { container } = render(<PlanDetailClient initialPlan={FULL_PLAN} hostPlanCount={0} />);

    await waitFor(() => expect(container.querySelector('.cat-art')).not.toBeNull());
    const art = container.querySelector('.cat-art')!;
    expect(art.className).toContain('cat-coffee');
    expect(art.getAttribute('aria-hidden')).toBe('true');
    // The word is still there in text, which is what the drawing repeats.
    expect(screen.getByText('coffee')).toBeDefined();
  });

  it('leaves the logistics above everything decorative below them', async () => {
    const { container } = render(<PlanDetailClient initialPlan={FULL_PLAN} hostPlanCount={0} />);

    await screen.findByRole('heading', { level: 1 });
    // Reading order, taken from the text in document order.
    const page = container.textContent ?? '';
    const at = (needle: string) => page.indexOf(needle);
    const title = at('coffee at Partners on Wythe');
    expect(title).toBeGreaterThan(-1);
    // The day, the time, the meeting point and the cost all come before the
    // host card and before the capacity block, exactly as they did before.
    expect(at('Saturday')).toBeGreaterThan(title);
    expect(at('9:00 AM')).toBeGreaterThan(title);
    expect(at('Partners Coffee')).toBeGreaterThan(title);
    expect(at('Pay your own way')).toBeGreaterThan(title);
    expect(at('Who is hosting')).toBeGreaterThan(at('Pay your own way'));
    expect(at('Spots available')).toBeGreaterThan(at('Saturday'));
  });

  it('draws capacity as segments beside the sentence, not instead of it', async () => {
    const { container } = render(
      <PlanDetailClient initialPlan={{ ...FULL_PLAN, spots_left: 2, spots_total: 3, status: 'open' }} hostPlanCount={0} />
    );

    await screen.findByText('2 of 3 spots open');
    expect(container.querySelectorAll('.meter-seg')).toHaveLength(3);
    expect(container.querySelectorAll('.meter-seg-open')).toHaveLength(2);
    expect(container.querySelector('.meter')!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('a full plan you have no request on', () => {
  it('still tells a stranger the plan is full and offers their own', async () => {
    currentUser = { id: 'user-stranger' };
    conversationRow = null;

    render(<PlanDetailClient initialPlan={FULL_PLAN} hostPlanCount={0} />);

    await waitFor(() => expect(screen.getAllByText(/This plan is full/i).length).toBeGreaterThan(0));
    expect(screen.getByRole('link', { name: /post your own/i })).toBeDefined();
    expect(screen.queryByRole('link', { name: /open conversation/i })).toBeNull();
  });
});
