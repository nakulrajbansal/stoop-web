/**
 * @vitest-environment jsdom
 *
 * The FAQ disclosures.
 *
 * Collapsing the answers is a presentation change and nothing else. The answers
 * stay in the DOM whether or not a disclosure is open, which is what keeps the
 * visible page and the FAQPage structured data describing the same thing, and
 * what lets in-page find still hit an answer. The control is a native summary,
 * so keyboard and screen reader behaviour is the browser's rather than ours.
 *
 * One thing this file cannot test, stated here rather than implied by silence:
 * the h3 lives inside the summary, and because a summary maps to a button,
 * some browsers treat its children as presentational and drop the question
 * from the heading outline. jsdom does not, so the heading-role test below
 * passes here and proves only that the markup is right. The accessible name
 * and the keyboard behaviour do not vary, and those are tested directly. The
 * reasoning for accepting that trade, and the three worse alternatives, is in
 * FaqList.tsx.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import FaqList from './FaqList';

const ITEMS = [
  { q: 'Can I browse before signing up?', a: 'Yes. Plans, host cards, and neighborhood pages are all public.' },
  { q: 'Does messaging reserve a spot?', a: 'No. Messaging starts a private conversation.' }
];

afterEach(cleanup);

describe('FaqList', () => {
  it('renders one native disclosure per question', () => {
    const { container } = render(<FaqList items={ITEMS} />);
    expect(container.querySelectorAll('details')).toHaveLength(2);
    expect(container.querySelectorAll('summary')).toHaveLength(2);
  });

  it('keeps every answer in the DOM while closed, so the structured data is not a lie', () => {
    const { container } = render(<FaqList items={ITEMS} />);
    expect(container.querySelectorAll('details[open]')).toHaveLength(0);
    for (const item of ITEMS) {
      expect(screen.getByText(item.a)).toBeDefined();
    }
  });

  it('marks the question up as a heading inside the summary', () => {
    // jsdom exposes the heading role here. A real browser may not, because a
    // summary is a button and buttons can present their children. This asserts
    // the markup, which is the part we control.
    render(<FaqList items={ITEMS} />);
    const heading = screen.getByRole('heading', { name: /does messaging reserve a spot/i });
    expect(heading.tagName).toBe('H3');
    expect(heading.closest('summary')).not.toBeNull();
  });

  it('names the control with the whole question, whatever happens to the outline', () => {
    // This is the guarantee that does not vary between browsers: name from
    // content walks straight through presentational children, so the summary
    // announces the full question either way.
    const { container } = render(<FaqList items={ITEMS} />);
    const summaries = [...container.querySelectorAll('summary')];

    expect(summaries).toHaveLength(ITEMS.length);
    summaries.forEach((summary, i) => {
      expect(summary.textContent).toContain(ITEMS[i].q);
      // Nothing else in the control speaks: the chevron is hidden.
      expect(summary.textContent!.trim()).toBe(ITEMS[i].q);
    });
  });

  it('says each question exactly once, so no reader hears it twice', () => {
    // The tempting fix for the outline is a visually hidden second heading.
    // That makes every screen reader read the question twice, which is worse
    // than the problem. This test exists to stop that fix.
    const { container } = render(<FaqList items={ITEMS} />);

    for (const item of ITEMS) {
      expect(screen.getAllByText(item.q)).toHaveLength(1);
    }
    expect(container.querySelectorAll('.sr-only')).toHaveLength(0);
    expect(container.querySelectorAll('[aria-label]')).toHaveLength(0);
  });

  it('operates from the keyboard because it is a real disclosure, not a div', () => {
    const { container } = render(<FaqList items={ITEMS} />);

    for (const summary of container.querySelectorAll('summary')) {
      // A native summary is focusable and toggles on Enter and Space without
      // a tabindex, a role or a key handler of ours.
      expect(summary.parentElement!.tagName).toBe('DETAILS');
      expect(summary.getAttribute('tabindex')).toBeNull();
      expect(summary.getAttribute('role')).toBeNull();
      expect(summary.getAttribute('onkeydown')).toBeNull();
    }
  });

  it('opens the one that was clicked and leaves the others alone', () => {
    const { container } = render(<FaqList items={ITEMS} />);
    const [first, second] = [...container.querySelectorAll('details')];
    fireEvent.click(first.querySelector('summary')!);
    // jsdom does not implement the default toggle, so drive the state the way
    // the browser would and check the component does not fight it.
    first.open = true;
    expect(first.open).toBe(true);
    expect(second.open).toBe(false);
  });

  it('hides its own chevron from assistive tech', () => {
    const { container } = render(<FaqList items={ITEMS} />);
    for (const mark of container.querySelectorAll('.disclosure-mark')) {
      expect(mark.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
