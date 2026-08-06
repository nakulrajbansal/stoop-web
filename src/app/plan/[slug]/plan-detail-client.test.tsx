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
