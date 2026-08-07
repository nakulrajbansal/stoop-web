/**
 * @vitest-environment jsdom
 *
 * The capacity meter.
 *
 * A picture of how much room is left is only ever a second reading of the fact.
 * The sentence carries it, the segments repeat it, and the segments are hidden
 * from assistive tech so nobody has to count coloured bars. The wording is the
 * wording the plan page already used, so a visitor who read it before this
 * change reads exactly the same thing after it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CapacityMeter, { CapacitySegments, capacityLabel, GROUP_SPOTS_MAX } from './CapacityMeter';

afterEach(cleanup);

describe('capacityLabel', () => {
  it('says what the plan page has always said', () => {
    expect(capacityLabel(2, 3)).toBe('2 of 3 spots open');
    expect(capacityLabel(1, 1)).toBe('1 of 1 spot open');
    expect(capacityLabel(0, 3)).toBe('This plan is full');
  });

  it('keeps the exact wording for every group size the product allows', () => {
    expect(GROUP_SPOTS_MAX).toBe(3);
    expect(capacityLabel(1, 1)).toBe('1 of 1 spot open');
    expect(capacityLabel(0, 1)).toBe('This plan is full');
    expect(capacityLabel(1, 2)).toBe('1 of 2 spots open');
    expect(capacityLabel(2, 2)).toBe('2 of 2 spots open');
    expect(capacityLabel(0, 2)).toBe('This plan is full');
    expect(capacityLabel(1, 3)).toBe('1 of 3 spots open');
    expect(capacityLabel(2, 3)).toBe('2 of 3 spots open');
    expect(capacityLabel(3, 3)).toBe('3 of 3 spots open');
  });

  it('refuses to promise room that does not exist', () => {
    expect(capacityLabel(5, 3)).toBe('3 of 3 spots open');
    expect(capacityLabel(-1, 3)).toBe('This plan is full');
    expect(capacityLabel(1, 0)).toBe('This plan is full');
    expect(capacityLabel(NaN as unknown as number, 3)).toBe('This plan is full');
  });

  it('will not read out a group bigger than a Stoop group, however the row got that way', () => {
    // The composer and /api/plans both cap spots at three, so a stored 9 is
    // corruption. The segments already clamped; the sentence did not, and a
    // row like this printed "9 of 9 spots open" beside three drawn segments.
    expect(capacityLabel(9, 9)).toBe('3 of 3 spots open');
    expect(capacityLabel(2, 9)).toBe('2 of 3 spots open');
    expect(capacityLabel(4, 4)).toBe('3 of 3 spots open');
    expect(capacityLabel(0, 99)).toBe('This plan is full');
    expect(capacityLabel(Infinity, Infinity)).toBe('This plan is full');
  });

  it('treats a total that is not a number as no room at all', () => {
    expect(capacityLabel(1, NaN as unknown as number)).toBe('This plan is full');
    expect(capacityLabel(1, -2)).toBe('This plan is full');
    expect(capacityLabel(NaN as unknown as number, NaN as unknown as number)).toBe('This plan is full');
  });

  it('never names a number larger than the one the segments draw', () => {
    // The invariant behind both clamps, checked across the range that matters
    // rather than at the two points somebody happened to write down.
    for (let total = -2; total <= 9; total++) {
      for (let left = -2; left <= 9; left++) {
        const label = capacityLabel(left, total);
        if (label === 'This plan is full') continue;
        const [, shown, outOf] = label.match(/^(\d+) of (\d+) spot/)!;
        expect(Number(outOf)).toBeLessThanOrEqual(GROUP_SPOTS_MAX);
        expect(Number(shown)).toBeLessThanOrEqual(Number(outOf));
        expect(Number(shown)).toBeGreaterThan(0);
      }
    }
  });
});

describe('CapacityMeter', () => {
  it('writes the number out and draws it', () => {
    const { container } = render(<CapacityMeter spotsLeft={2} spotsTotal={3} />);
    expect(screen.getByText('2 of 3 spots open')).toBeDefined();
    expect(container.querySelectorAll('.meter-seg')).toHaveLength(3);
    expect(container.querySelectorAll('.meter-seg-open')).toHaveLength(2);
    expect(container.querySelectorAll('.meter-seg-taken')).toHaveLength(1);
  });

  it('keeps the drawing out of the accessibility tree', () => {
    const { container } = render(<CapacityMeter spotsLeft={1} spotsTotal={2} />);
    expect(container.querySelector('.meter')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws nothing filled once the plan is full, and still says so', () => {
    const { container } = render(<CapacityMeter spotsLeft={0} spotsTotal={2} />);
    expect(screen.getByText('This plan is full')).toBeDefined();
    expect(container.querySelectorAll('.meter-seg-open')).toHaveLength(0);
    expect(container.querySelectorAll('.meter-seg')).toHaveLength(2);
  });

  it('never draws more segments than a Stoop group can hold, and never says more either', () => {
    const { container } = render(<CapacityMeter spotsLeft={9} spotsTotal={9} />);
    expect(container.querySelectorAll('.meter-seg')).toHaveLength(3);
    // The picture and the sentence are the same fact, so they clamp together.
    expect(screen.getByText('3 of 3 spots open')).toBeDefined();
    expect(container.textContent).not.toMatch(/9/);
  });
});

describe('CapacitySegments on their own', () => {
  it('is always decoration, because the row beside it writes the number out', () => {
    const { container } = render(<CapacitySegments spotsLeft={1} spotsTotal={3} />);
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toBe('');
    expect(container.querySelectorAll('.meter-seg-open')).toHaveLength(1);
  });

  it('has a compact form for a feed row', () => {
    const { container } = render(<CapacitySegments spotsLeft={1} spotsTotal={2} compact />);
    expect(container.firstElementChild!.className).toContain('meter-sm');
  });
});
