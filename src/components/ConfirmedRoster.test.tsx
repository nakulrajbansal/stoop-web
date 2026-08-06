/**
 * @vitest-environment jsdom
 *
 * The highest risk behaviour in the release: this component must render nothing
 * at all unless the endpoint says the viewer is the host or a confirmed
 * participant. "Nothing" means no heading, no count, no placeholder, because a
 * placeholder would itself tell an unauthorized viewer that a roster exists.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import ConfirmedRoster from './ConfirmedRoster';

const ROSTER = [
  { userId: 'user-host', firstName: 'Maya', neighborhood: 'Williamsburg', about: 'lives by the park', role: 'host', isYou: false },
  { userId: 'user-confirmed', firstName: 'Theo', neighborhood: 'Greenpoint', about: null, role: 'joiner', isYou: true }
];

function respond(status: number, body?: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body ?? {}
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', respond(200, { roster: ROSTER, note: 'Only the host and confirmed participants can see this.' }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('when the viewer is allowed to see it', () => {
  it('lists the host and the confirmed joiners, and nobody else', async () => {
    render(<ConfirmedRoster planId="plan-1" />);
    await screen.findByText('Maya');
    expect(screen.getByText('Theo')).toBeDefined();
    expect(screen.getByRole('heading', { name: /who is coming/i })).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('says who is hosting and who is confirmed, in text rather than colour', async () => {
    render(<ConfirmedRoster planId="plan-1" />);
    await screen.findByText('Maya');
    expect(screen.getByText(/is hosting/)).toBeDefined();
    expect(screen.getByText(/is confirmed/)).toBeDefined();
    expect(screen.getByText(/\(you\)/)).toBeDefined();
  });

  it('keeps the list semantics a screen reader needs', async () => {
    render(<ConfirmedRoster planId="plan-1" />);
    await screen.findByText('Maya');
    expect(screen.getByRole('list')).toBeDefined();
    expect(screen.getByText(/only the host and confirmed participants/i)).toBeDefined();
  });

  it('does not imply attendees when the host has confirmed nobody', async () => {
    vi.stubGlobal('fetch', respond(200, { roster: [ROSTER[0]] }));
    render(<ConfirmedRoster planId="plan-1" />);
    await screen.findByText('Maya');
    expect(screen.getByText(/nobody is confirmed yet/i)).toBeDefined();
  });
});

describe('when the viewer is not allowed to see it', () => {
  for (const status of [401, 403, 404, 503, 500]) {
    it(`renders nothing at all on ${status}`, async () => {
      vi.stubGlobal('fetch', respond(status, { error: 'nope' }));
      const { container } = render(<ConfirmedRoster planId="plan-1" />);
      await waitFor(() => expect((globalThis.fetch as any).mock.calls.length).toBe(1));
      expect(container.innerHTML).toBe('');
      expect(screen.queryByRole('heading')).toBeNull();
    });
  }

  it('renders nothing when the request fails outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { container } = render(<ConfirmedRoster planId="plan-1" />);
    await waitFor(() => expect((globalThis.fetch as any).mock.calls.length).toBe(1));
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the body arrives without a roster', async () => {
    vi.stubGlobal('fetch', respond(200, { note: 'no roster here' }));
    const { container } = render(<ConfirmedRoster planId="plan-1" />);
    await waitFor(() => expect((globalThis.fetch as any).mock.calls.length).toBe(1));
    expect(container.innerHTML).toBe('');
  });

  it('does not ask at all when the viewer is not signed in', async () => {
    const { container } = render(<ConfirmedRoster planId="plan-1" enabled={false} />);
    await waitFor(() => expect((globalThis.fetch as any).mock.calls.length).toBe(0));
    expect(container.innerHTML).toBe('');
  });
});

describe('stale data', () => {
  it('clears a roster it is no longer allowed to show', async () => {
    const { container, rerender } = render(<ConfirmedRoster planId="plan-1" />);
    await screen.findByText('Maya');

    vi.stubGlobal('fetch', respond(403, { error: 'nope' }));
    rerender(<ConfirmedRoster planId="plan-2" />);

    await waitFor(() => expect(container.innerHTML).toBe(''));
    expect(screen.queryByText('Maya')).toBeNull();
  });
});
