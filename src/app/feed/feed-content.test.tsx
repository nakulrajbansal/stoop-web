/**
 * @vitest-environment jsdom
 *
 * An outage is not evidence that a neighborhood is empty.
 *
 * The feed used to hand any JSON body straight to the renderer, so a 503 with
 * an error payload became `plans=[]`, and the page said "Stoop is early in this
 * neighborhood" and drew three sample plans. Somebody deciding whether Stoop is
 * worth their phone number would have been told a falsehood about supply by a
 * failing database. These tests hold the three states apart: loading, real zero
 * supply, and something is broken.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

const pushMock = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParamsValue
}));

vi.mock('@/lib/city-preference', () => ({
  useCityPreference: () => [null, vi.fn()],
  setCityPreference: vi.fn()
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => <a href={typeof href === 'string' ? href : '#'} {...rest}>{children}</a>
}));

import FeedContent from './FeedContent';

const REAL_PLAN = {
  id: 'plan-1',
  slug: 'coffee-at-partners-ab12',
  user_id: 'user-host',
  text: 'coffee at Partners on Wythe saturday morning before the market gets busy, come sit',
  category: 'coffee',
  when_day: 'Saturday',
  when_date: '2026-08-08',
  when_time: 'Morning',
  when_time_specific: '9:00 AM',
  spot: 'Partners Coffee',
  spots_left: 2,
  spots_total: 2,
  status: 'open',
  cost_expectation: 'pay-own-way',
  intent_tags: [],
  neighborhood: { name: 'Williamsburg' },
  poster: { name: 'Maya', initials: 'M', avatar_bg: '#D4E8D8', avatar_fg: '#2A4232' }
};

// A message with something operational in it, so the test can prove the page
// does not repeat whatever the server said.
const RAW_SERVER_ERROR = 'Plans are temporarily unavailable. (pool exhausted at 10.0.0.4)';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

function respondOnce(...responses: any[]) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  fetchMock.mockResolvedValue(responses[responses.length - 1]);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// The zero-supply line appears twice on a genuinely empty feed, in the headline
// block and again under the samples, so this counts rather than expecting one.
const zeroSupplyCopyCount = () => screen.queryAllByText(/Stoop is early in/i).length;
const querySampleLabels = () => screen.queryAllByText(/^Sample$/);

beforeEach(() => {
  searchParamsValue = new URLSearchParams();
  pushMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('when the plans API fails', () => {
  it('says the page is broken, not that the neighborhood is empty', async () => {
    respondOnce(jsonResponse(503, { error: RAW_SERVER_ERROR }));
    render(<FeedContent />);

    await screen.findByRole('alert');
    expect(screen.getByText(/not loading right now/i)).toBeDefined();
    expect(screen.getByText(/not a sign that the neighborhood is empty/i)).toBeDefined();
  });

  it('does not render the zero supply copy or a plan count', async () => {
    respondOnce(jsonResponse(503, { error: RAW_SERVER_ERROR }));
    render(<FeedContent />);

    await screen.findByRole('alert');
    expect(zeroSupplyCopyCount()).toBe(0);
    expect(screen.queryByText(/wide open/i)).toBeNull();
    expect(screen.queryByText(/No open plans/i)).toBeNull();
    expect(screen.queryByText(/Be the first/i)).toBeNull();
  });

  it('does not draw sample plans, which would read as inventory', async () => {
    respondOnce(jsonResponse(503, { error: RAW_SERVER_ERROR }));
    render(<FeedContent />);

    await screen.findByRole('alert');
    expect(querySampleLabels()).toHaveLength(0);
    expect(screen.queryByText(/flat white saturday morning/i)).toBeNull();
  });

  it('offers a retry control with an accessible name', async () => {
    respondOnce(jsonResponse(503, { error: RAW_SERVER_ERROR }));
    render(<FeedContent />);

    await screen.findByRole('alert');
    const retry = screen.getByRole('button', { name: /try again/i });
    expect(retry).toBeDefined();
    expect(retry.textContent).toMatch(/try again/i);
  });

  it(`keeps the server own words off the page`, async () => {
    respondOnce(jsonResponse(503, { error: RAW_SERVER_ERROR }));
    const { container } = render(<FeedContent />);

    await screen.findByRole('alert');
    expect(container.textContent).not.toMatch(/pool exhausted/);
    expect(container.textContent).not.toMatch(/10\.0\.0\.4/);
    expect(container.textContent).not.toMatch(/503/);
  });

  it('lays the message out in one column, with nothing pinned wider than a phone', async () => {
    respondOnce(jsonResponse(503, { error: RAW_SERVER_ERROR }));
    render(<FeedContent />);

    // jsdom does not lay anything out, so this checks the structure that makes
    // 320 px work rather than claiming a rendered measurement: one column, a
    // max width that collapses, and no fixed pixel width anywhere inside.
    const alert = await screen.findByRole('alert');
    // A max width is fine, it collapses. A fixed width is not.
    const fixedWidth = /(^|\s)w-\[\d/;
    const everything = [alert, ...Array.from(alert.querySelectorAll('*'))];
    const pinned = everything.filter(el => fixedWidth.test((el as HTMLElement).className || ''));
    expect(pinned.map(el => (el as HTMLElement).className)).toEqual([]);
    expect(alert.className).not.toMatch(/grid|flex-row/);
  });

  it('behaves the same way when the request never lands', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<FeedContent />);

    await screen.findByRole('alert');
    expect(screen.getByText(/not loading right now/i)).toBeDefined();
    expect(zeroSupplyCopyCount()).toBe(0);
    expect(querySampleLabels()).toHaveLength(0);
    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
    expect(container.textContent).not.toMatch(/network down/);
  });
});

describe('when the API answers honestly with nothing', () => {
  it('still says the neighborhood is early, and still labels the samples', async () => {
    respondOnce(jsonResponse(200, { plans: [], total: 0 }));
    render(<FeedContent />);

    await waitFor(() => expect(zeroSupplyCopyCount()).toBeGreaterThan(0));
    expect(querySampleLabels().length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('lists real plans when there are some', async () => {
    respondOnce(jsonResponse(200, { plans: [REAL_PLAN], total: 1 }));
    render(<FeedContent />);

    await screen.findByText(/coffee at Partners on Wythe/i);
    expect(querySampleLabels()).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('retrying', () => {
  it('issues a new request and moves to the real empty state when it succeeds', async () => {
    const fetchMock = respondOnce(
      jsonResponse(503, { error: RAW_SERVER_ERROR }),
      jsonResponse(200, { plans: [], total: 0 })
    );
    render(<FeedContent />);

    await screen.findByRole('alert');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(zeroSupplyCopyCount()).toBeGreaterThan(0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(querySampleLabels().length).toBeGreaterThan(0);
  });

  it('shows the loading state again while the retry is in flight', async () => {
    let release: (value: unknown) => void = () => {};
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: RAW_SERVER_ERROR }))
      .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    render(<FeedContent />);

    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByLabelText(/loading plans/i)).toBeDefined();

    release(jsonResponse(200, { plans: [REAL_PLAN], total: 1 }));
    await screen.findByText(/coffee at Partners on Wythe/i);
  });
});

describe('a filter change while a request is in flight', () => {
  it('ignores the answer to the request nobody is waiting for any more', async () => {
    let releaseFirst: (value: unknown) => void = () => {};
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { releaseFirst = resolve; }))
      .mockResolvedValueOnce(jsonResponse(200, { plans: [REAL_PLAN], total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(<FeedContent />);

    // The visitor picks a category before the first answer arrives.
    searchParamsValue = new URLSearchParams('category=coffee');
    rerender(<FeedContent />);
    await screen.findByText(/coffee at Partners on Wythe/i);

    // The abandoned request now fails. It must not repaint the page.
    releaseFirst(jsonResponse(503, { error: RAW_SERVER_ERROR }));
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/coffee at Partners on Wythe/i)).toBeDefined();
  });
});
