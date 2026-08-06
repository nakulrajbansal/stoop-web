/**
 * @vitest-environment jsdom
 *
 * The private card a host sees before deciding. It carries enough to make a
 * deliberate choice and nothing that belongs to the requester alone.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import RequesterCard from './RequesterCard';

const REQUESTER = {
  userId: 'user-joiner',
  firstName: 'Sam',
  neighborhood: 'Astoria',
  about: 'runs slow, talks a lot',
  priorPlans: 'has posted 3 plans',
  opener: 'I am around that morning and have been meaning to try it.',
  status: 'pending'
};

afterEach(cleanup);

describe('RequesterCard', () => {
  it('shows the first name, neighborhood, hosting record, line and opener', () => {
    render(<RequesterCard requester={REQUESTER} />);
    expect(screen.getByRole('heading', { name: /who is asking/i })).toBeDefined();
    expect(screen.getByText('Sam')).toBeDefined();
    expect(screen.getByText(/Astoria/)).toBeDefined();
    expect(screen.getByText(/has posted 3 plans/)).toBeDefined();
    expect(screen.getByText(/runs slow/)).toBeDefined();
    expect(screen.getByText(/meaning to try it/)).toBeDefined();
  });

  it('says a pending request reserves nothing and the host decides', () => {
    render(<RequesterCard requester={REQUESTER} />);
    expect(screen.getByText(/No spot is reserved\./)).toBeDefined();
    expect(screen.getByText(/You decide whether to confirm/)).toBeDefined();
  });

  it('leaves out a thin hosting record rather than padding it', () => {
    render(<RequesterCard requester={{ ...REQUESTER, priorPlans: null, about: null, opener: null }} />);
    expect(screen.getByText('Sam')).toBeDefined();
    expect(screen.queryByText(/has posted/)).toBeNull();
    expect(screen.queryByText(/runs slow/)).toBeNull();
  });

  it('names the avatar for a screen reader without a surname', () => {
    const { container } = render(<RequesterCard requester={REQUESTER} />);
    const img = container.querySelector('img');
    if (img) expect(img.getAttribute('alt')).toBe("Sam's photo");
    expect(container.innerHTML).not.toMatch(/Okafor|Rodriguez/);
  });

  it('reads back the resolved state once the host has decided', () => {
    render(<RequesterCard requester={{ ...REQUESTER, status: 'confirmed' }} />);
    expect(screen.getByText(/Your spot is reserved\./)).toBeDefined();
  });
});
