/**
 * @vitest-environment jsdom
 *
 * A photograph is decorative, and the separation from plan data is structural.
 *
 * The previous build kept editorial atmosphere apart from live plans by
 * printing "Photograph, not a plan" under every picture. It worked as a rule
 * and failed as a page: a disclaimer in the middle of the layout, three times,
 * and each photograph framed as an exhibit that needed explaining. The rule is
 * now carried by placement instead, and there are three separate things to hold
 * down for that to be worth anything:
 *
 *   1. nothing is captioned any more, and no call site can smuggle a label
 *      back in through an alt string;
 *   2. a photograph announces nothing by default, so a screen reader on these
 *      pages meets the plans and not the scenery;
 *   3. the wording a photograph COULD be given lives in lib/photos, where
 *      photos.test.ts scans it, and nowhere else.
 *
 * The placement half of the contract (never on a plan, feed, inbox or roster
 * surface) is enforced in src/lib/photos.test.ts.
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

describe('a rendered photograph is decorative', () => {
  for (const photo of ALL_PHOTOS) {
    it(`renders ${photo.src} with an empty alt and no caption`, () => {
      const { container } = render(<Photograph photo={photo} sizes="100vw" aspect="3 / 2" />);
      const image = container.querySelector('img')!;

      expect(image, 'no image rendered').not.toBeNull();
      // alt="" is the whole signal: present, and empty. A missing alt attribute
      // would leave a screen reader to announce the file name instead.
      expect(image.getAttribute('alt')).toBe('');
      expect(container.querySelector('figcaption')).toBeNull();
      expect(container.querySelector('figure')).toBeNull();
      // Nothing about the picture reaches the accessibility tree at all.
      expect(screen.queryAllByRole('img')).toHaveLength(0);
      expect(container.textContent).toBe('');
    });
  }

  it('speaks the record\'s own alt, and only when asked to', () => {
    const { container } = render(
      <Photograph photo={PHOTOS.parkPath} sizes="100vw" aspect="3 / 2" informative />
    );
    expect(container.querySelector('img')!.getAttribute('alt')).toBe(PHOTOS.parkPath.alt);
    expect(screen.getByRole('img', { name: PHOTOS.parkPath.alt })).toBeDefined();
  });

  it('reserves its box before the bytes land, so nothing shifts', () => {
    const { container } = render(<Photograph photo={PHOTOS.parkPath} sizes="100vw" aspect="3 / 2" />);
    const box = container.querySelector('.photo') as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.style.aspectRatio).toBe('3 / 2');
    expect(container.querySelector('img')!.getAttribute('src')).toContain('park-path');
  });

  it('is lazy unless a call site asks otherwise, and none does any more', () => {
    const { container: lazy } = render(<Photograph photo={PHOTOS.parkPath} sizes="100vw" aspect="3 / 2" />);
    expect(lazy.querySelector('img')!.getAttribute('loading')).toBe('lazy');

    // The prop survives its last call site on purpose: the next photograph that
    // lands above a fold will need it, and the alternative is next/image's
    // undocumented default. src/app/home-page.test.ts is what holds down that
    // nothing on the marketing page claims it today.
    cleanup();
    const { container: eager } = render(
      <Photograph photo={PHOTOS.parkPath} sizes="100vw" aspect="3 / 2" priority />
    );
    expect(eager.querySelector('img')!.getAttribute('loading')).not.toBe('lazy');
  });
});

describe('the caption is gone, and cannot come back by the side door', () => {
  it('has no caption anything left in the component', () => {
    expect(COMPONENT).not.toMatch(/figcaption/);
    expect(COMPONENT).not.toMatch(/captionClassName/i);
    expect(COMPONENT).not.toMatch(/not a plan/i);
  });

  it('takes no free-text alt, so every word a photograph can say lives in lib/photos', () => {
    // `informative` is a boolean that opts into the record's own alt. An `alt`
    // string prop would let a call site write anything, which is exactly the
    // surface photos.test.ts scans for language implying a member.
    expect(COMPONENT).toMatch(/informative\?: boolean/);
    expect(COMPONENT).not.toMatch(/\balt\?: string/);
    expect(COMPONENT).toMatch(/alt=\{informative \? photo\.alt : ''\}/);
  });

  it('is not captioned anywhere on the homepage either', () => {
    const uses = [...PAGE.matchAll(/<Photograph[\s\S]*?\/>/g)].map(m => m[0]);
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) {
      expect(use).not.toMatch(/caption/i);
      expect(use).toMatch(/sizes=/);
    }
    expect(PAGE).not.toMatch(/not a plan/i);
  });

  it('is what the docs say it is', () => {
    const assets = readFileSync(join(process.cwd(), 'docs', 'VISUAL_ASSETS.md'), 'utf8');
    // The docs must not still promise a caption that no longer renders. A stale
    // claim in the one file a person checks provenance in is worse than none.
    expect(assets).not.toMatch(/Photograph, not a plan/);
    expect(assets).toMatch(/decorative/i);
  });
});
