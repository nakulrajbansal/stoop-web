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
});
