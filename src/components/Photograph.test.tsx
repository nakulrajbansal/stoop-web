/**
 * @vitest-environment jsdom
 *
 * The caption is the invariant, not the caption field.
 *
 * "Photograph, not a plan" is the one line keeping editorial atmosphere
 * visibly separate from live plan data. src/lib/photos.test.ts already checks
 * that every record carries that string, but a record carrying a caption and a
 * page printing one are different claims: the closing call to action used to
 * pass a showCaption={false} and render no caption at all while every doc in
 * the repo said all three were captioned.
 *
 * So these tests render the component and read the document, and the source
 * checks below make sure the homepage cannot opt out again.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, cleanup } from '@testing-library/react';
import Photograph from './Photograph';
import { PHOTOS, ALL_PHOTOS } from '@/lib/photos';

afterEach(cleanup);

const PAGE = readFileSync(join(process.cwd(), 'src', 'app', 'page.tsx'), 'utf8');
const COMPONENT = readFileSync(join(process.cwd(), 'src', 'components', 'Photograph.tsx'), 'utf8');

describe('a rendered photograph always says it is a photograph', () => {
  for (const photo of ALL_PHOTOS) {
    it(`prints the caption under ${photo.src}`, () => {
      const { container } = render(<Photograph photo={photo} sizes="100vw" aspect="3 / 2" />);
      const caption = container.querySelector('figcaption');

      expect(caption, 'no figcaption rendered').not.toBeNull();
      expect(caption!.textContent).toBe(photo.caption);
      expect(caption!.textContent).toMatch(/not a plan/i);
      // Visible, not hidden from sight or from assistive tech.
      expect(caption!.getAttribute('aria-hidden')).toBeNull();
      expect(caption!.className).not.toMatch(/\bhidden\b|\bsr-only\b/);
      expect(screen.getByText(photo.caption)).toBeDefined();
    });
  }

  it('still prints it when the caption is restyled for a dark panel', () => {
    // The closing call to action needs light type on ink. Restyling is the
    // only concession available, and it is not the same as removing it.
    const { container } = render(
      <Photograph photo={PHOTOS.coffeeCounter} sizes="240px" captionClassName="text-cream/70" />
    );
    const caption = container.querySelector('figcaption')!;

    expect(caption.textContent).toBe('Photograph, not a plan');
    expect(caption.className).toContain('text-cream/70');
    expect(caption.className).not.toContain('text-muted');
  });

  it('describes the picture, and never a person on Stoop', () => {
    render(<Photograph photo={PHOTOS.sidewalkTable} sizes="100vw" aspect="3 / 2" />);
    const image = screen.getByRole('img', { name: PHOTOS.sidewalkTable.alt });
    expect(image.getAttribute('alt')).toBe(PHOTOS.sidewalkTable.alt);
  });

  it('wraps the picture and its caption in one figure', () => {
    const { container } = render(<Photograph photo={PHOTOS.parkPath} sizes="100vw" aspect="3 / 2" />);
    const figure = container.querySelector('figure')!;
    expect(figure).not.toBeNull();
    expect(figure.querySelector('figcaption')).not.toBeNull();
    expect(figure.querySelector('img')).not.toBeNull();
  });
});

describe('the caption cannot be switched off', () => {
  it('has no prop for it, so no call site can pass one', () => {
    expect(COMPONENT).not.toMatch(/showCaption/);
    expect(COMPONENT).not.toMatch(/hideCaption|noCaption/);
    // The figcaption is unconditional: no && and no ternary in front of it.
    expect(COMPONENT).toMatch(/<figcaption/);
    expect(COMPONENT).not.toMatch(/\{\s*\w+\s*&&\s*\(?\s*<figcaption/);
  });

  it('is not opted out of anywhere on the homepage', () => {
    const uses = [...PAGE.matchAll(/<Photograph[\s\S]*?\/>/g)].map(m => m[0]);
    // Three photographs: the hero, "What people post", and the closing panel.
    expect(uses).toHaveLength(3);
    for (const use of uses) {
      expect(use).not.toMatch(/showCaption/);
      expect(use).toMatch(/sizes=/);
    }
    expect(PAGE).not.toMatch(/showCaption/);
  });

  it('is what the docs say it is', () => {
    const assets = readFileSync(join(process.cwd(), 'docs', 'VISUAL_ASSETS.md'), 'utf8');
    expect(assets).toMatch(/Photograph, not a plan/);
    expect(COMPONENT).toMatch(/Photograph, not a plan/);
  });
});
