/**
 * @vitest-environment jsdom
 *
 * The pre-publish summary. A host should be able to read exactly what a
 * neighbor will see, and be told plainly what is still missing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PlanSummary from './PlanSummary';

const COMPLETE = {
  text: 'coffee at Partners on Wythe saturday morning before the market gets busy, come sit',
  whenDate: '2026-08-08',
  whenTimeSpecific: '9:00 AM',
  spot: 'Partners Coffee, 125 North 6th Street',
  spots: 2,
  costExpectation: 'pay-own-way',
  dayLabel: 'Saturday',
  neighborhoodName: 'Williamsburg',
  intentTags: ['Quiet vibe']
};

afterEach(cleanup);

describe('PlanSummary', () => {
  it('shows what, when, where, cost, spots and who sees it', () => {
    render(<PlanSummary input={COMPLETE} missing={[]} />);
    expect(screen.getByRole('heading', { name: /what neighbors will see/i })).toBeDefined();
    expect(screen.getByText(/Saturday, 9:00 AM/)).toBeDefined();
    expect(screen.getByText(/Partners Coffee, 125 North 6th Street, Williamsburg/)).toBeDefined();
    expect(screen.getByText('Pay your own way')).toBeDefined();
    expect(screen.getByText('2 spots open')).toBeDefined();
    expect(screen.getByText(/Your phone and email stay private/)).toBeDefined();
  });

  it('uses a description list so the labels are read with their values', () => {
    const { container } = render(<PlanSummary input={COMPLETE} missing={[]} />);
    expect(container.querySelectorAll('dt').length).toBe(container.querySelectorAll('dd').length);
    expect(container.querySelectorAll('dt').length).toBeGreaterThan(4);
  });

  it('names what is still missing rather than leaving a blank row', () => {
    render(
      <PlanSummary
        input={{ ...COMPLETE, whenTimeSpecific: '', costExpectation: '' }}
        missing={[
          { field: 'time', label: 'exact time' },
          { field: 'cost', label: 'cost expectation' }
        ]}
      />
    );
    expect(screen.getAllByText('Still needed').length).toBe(2);
    expect(screen.getByRole('status').textContent).toMatch(/exact time, cost expectation/);
  });

  it('moves the host to the first missing field', () => {
    const onFix = vi.fn();
    render(
      <PlanSummary
        input={{ ...COMPLETE, whenTimeSpecific: '' }}
        missing={[{ field: 'time', label: 'exact time' }]}
        onFix={onFix}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /go to exact time/i }));
    expect(onFix).toHaveBeenCalledWith('time');
  });

  it('drops the expectations row when no tags are picked', () => {
    render(<PlanSummary input={{ ...COMPLETE, intentTags: [] }} missing={[]} />);
    expect(screen.queryByText('Expectations')).toBeNull();
  });

  it('draws the category the host picked, and names it, because nothing else does', () => {
    // There is no Category row in this panel, so unlike every other surface
    // the drawing is the only thing carrying the kind of plan. That is the one
    // place the art is allowed to speak.
    const { container } = render(<PlanSummary input={COMPLETE} missing={[]} category="coffee" />);
    const art = container.querySelector('.cat-art')!;
    expect(art).not.toBeNull();
    expect(art.className).toContain('cat-coffee');
    expect(art.getAttribute('aria-hidden')).toBeNull();
    expect(screen.getByRole('img', { name: 'Coffee' })).toBeDefined();
  });

  it('says the kind once, not once per row', () => {
    render(<PlanSummary input={COMPLETE} missing={[]} category="coffee" />);
    expect(screen.getAllByRole('img', { name: 'Coffee' })).toHaveLength(1);
    // The rows never print the word, so there is nothing for it to duplicate.
    expect(screen.queryByText('Coffee')).toBeNull();
  });

  it('stays silent about a kind it cannot honestly name', () => {
    const { container } = render(<PlanSummary input={COMPLETE} missing={[]} category="pottery" />);
    const art = container.querySelector('.cat-art')!;
    // A legacy value still gets a picture, and the picture claims nothing.
    expect(art).not.toBeNull();
    expect(art.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('works without a category, which is how the editor renders it', () => {
    const { container } = render(<PlanSummary input={COMPLETE} missing={[]} />);
    expect(container.querySelector('.cat-art')).toBeNull();
    expect(screen.getByRole('heading', { name: /what neighbors will see/i })).toBeDefined();
  });

  it('prints every fact once, so a preview cannot disagree with the row it copied', () => {
    render(<PlanSummary input={COMPLETE} missing={[]} category="coffee" />);
    // getByText throws on more than one match, which is the assertion here.
    expect(screen.getByText('Saturday, 9:00 AM')).toBeDefined();
    expect(screen.getByText('Pay your own way')).toBeDefined();
    expect(screen.getByText('2 spots open')).toBeDefined();
  });

  it('draws the spots it is about to publish, next to the number', () => {
    const { container } = render(<PlanSummary input={COMPLETE} missing={[]} />);
    // Two of two, because a plan starts with every spot open.
    expect(container.querySelectorAll('.meter-seg')).toHaveLength(2);
    expect(container.querySelectorAll('.meter-seg-open')).toHaveLength(2);
    expect(container.querySelector('.meter')!.getAttribute('aria-hidden')).toBe('true');
  });
});
