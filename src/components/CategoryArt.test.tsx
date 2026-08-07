/**
 * @vitest-environment jsdom
 *
 * The category drawings.
 *
 * Two things have to stay true for this component to be safe to sprinkle
 * anywhere. It must draw something for every category the product allows, so a
 * category can never render as an empty coloured blob; and it must stay silent
 * for assistive tech wherever the category is already written next to it, so a
 * screen reader is not read the word "coffee" twice per feed row.
 *
 * The px sizing test is a regression guard: the drawings were once sized at
 * 100% of their wrapper, which collapses to zero inside a flex row, and the art
 * disappeared on the homepage while still rendering in a column.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CategoryArt, { CATEGORIES, CATEGORY_LABELS, categoryLabelOf, isCategory } from './CategoryArt';

afterEach(cleanup);

function drawingOf(container: HTMLElement): string {
  return [...container.querySelectorAll('svg *')]
    .map(node => node.getAttribute('d') ?? node.tagName + (node.getAttribute('cx') ?? ''))
    .join('|');
}

describe('every category is drawn', () => {
  it('covers the seven the product allows, and only those', () => {
    expect([...CATEGORIES]).toEqual(['coffee', 'outdoors', 'sports', 'arts', 'food', 'books', 'music']);
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...CATEGORIES].sort());
  });

  for (const category of CATEGORIES) {
    it(`${category} renders real geometry rather than an empty tile`, () => {
      const { container } = render(<CategoryArt category={category} />);
      const svg = container.querySelector('svg')!;
      expect(svg).not.toBeNull();
      expect(svg.querySelectorAll('path, circle, rect, ellipse').length).toBeGreaterThan(2);
    });
  }

  it('draws a different picture for each category', () => {
    const drawings = CATEGORIES.map(category => {
      const { container } = render(<CategoryArt category={category} />);
      const drawing = drawingOf(container);
      cleanup();
      return drawing;
    });
    expect(new Set(drawings).size).toBe(CATEGORIES.length);
  });

  it('falls back to a real drawing when a stored category is not one of ours', () => {
    const { container } = render(<CategoryArt category="pottery" />);
    expect(container.querySelectorAll('svg path, svg circle, svg rect').length).toBeGreaterThan(2);
    expect(isCategory('pottery')).toBe(false);
    expect(isCategory('coffee')).toBe(true);
  });

  it('falls back to the coffee drawing specifically, not to some other one', () => {
    // Asserting geometry exists is not enough: the fallback is documented as
    // coffee, and a silent change of which picture a legacy row gets is the
    // kind of thing nobody notices until a plan looks like the wrong thing.
    const { container: fallback } = render(<CategoryArt category="pottery" />);
    const drawn = drawingOf(fallback);
    cleanup();

    const { container: coffee } = render(<CategoryArt category="coffee" />);
    expect(drawn).toBe(drawingOf(coffee));
    cleanup();

    const { container: music } = render(<CategoryArt category="music" />);
    expect(drawn).not.toBe(drawingOf(music));
  });

  it('carries the coffee tokens for a stored category it does not know', () => {
    const { container } = render(<CategoryArt category="pottery" />);
    expect(container.firstElementChild!.className).toContain('cat-coffee');
  });
});

describe('the word to say when the drawing is the only thing saying it', () => {
  it('gives every category its own sentence-case label', () => {
    for (const category of CATEGORIES) {
      expect(categoryLabelOf(category)).toBe(CATEGORY_LABELS[category]);
    }
    expect(categoryLabelOf('coffee')).toBe('Coffee');
    expect(categoryLabelOf('outdoors')).toBe('Outdoors');
  });

  it('says nothing at all for a stored value we do not draw', () => {
    // The drawing falls back to coffee so a legacy row still gets a picture.
    // Calling that row "Coffee" out loud would be a different thing entirely.
    expect(categoryLabelOf('pottery')).toBeNull();
    expect(categoryLabelOf('')).toBeNull();
    expect(categoryLabelOf(null)).toBeNull();
    expect(categoryLabelOf(undefined)).toBeNull();
    expect(categoryLabelOf(7)).toBeNull();
  });

  it('leaves the art silent when there is no honest word for it', () => {
    const { container } = render(
      <CategoryArt category="pottery" label={categoryLabelOf('pottery') ?? undefined} />
    );
    const wrapper = container.firstElementChild!;
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('names the art when there is one', () => {
    render(<CategoryArt category="books" label={categoryLabelOf('books') ?? undefined} />);
    expect(screen.getByRole('img', { name: 'Books' })).toBeDefined();
  });
});

describe('it is decoration unless it is told otherwise', () => {
  it('hides itself from assistive tech by default', () => {
    const { container } = render(<CategoryArt category="coffee" />);
    const wrapper = container.firstElementChild!;
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
    expect(wrapper.getAttribute('role')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('becomes an image with a name when the art is the only thing saying it', () => {
    render(<CategoryArt category="books" label="Books" />);
    const art = screen.getByRole('img', { name: 'Books' });
    expect(art.getAttribute('aria-hidden')).toBeNull();
  });
});

describe('how it is drawn', () => {
  it('sizes the drawing in px, so it cannot collapse inside a flex row', () => {
    const { container } = render(<CategoryArt category="coffee" size={40} />);
    const svg = container.querySelector('svg')!;
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(0);
    expect(svg.getAttribute('width')).toBe(svg.getAttribute('height'));
    expect(svg.getAttribute('width')).not.toMatch(/%/);
  });

  it('thickens the line as the drawing gets smaller, so it still reads at 20px', () => {
    const { container: big } = render(<CategoryArt category="coffee" size={64} />);
    const bigStroke = Number(big.querySelector('svg')!.getAttribute('stroke-width'));
    cleanup();
    const { container: small } = render(<CategoryArt category="coffee" size={20} />);
    const smallStroke = Number(small.querySelector('svg')!.getAttribute('stroke-width'));
    expect(smallStroke).toBeGreaterThan(bigStroke);
  });

  it('carries the category class that pairs its ink with the tag pill', () => {
    const { container } = render(<CategoryArt category="music" />);
    expect(container.firstElementChild!.className).toContain('cat-music');
  });

  it('takes its colour from currentColor, so a caller can retint it', () => {
    const { container } = render(<CategoryArt category="arts" />);
    expect(container.querySelector('svg')!.getAttribute('stroke')).toBe('currentColor');
  });

  it('drops the tile when asked, for art that sits inline in a line of text', () => {
    const { container } = render(<CategoryArt category="food" tile={false} />);
    expect(container.firstElementChild!.className).not.toContain('cat-art-tile');
  });
});
