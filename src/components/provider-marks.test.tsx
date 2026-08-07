/**
 * @vitest-environment jsdom
 *
 * The Google and Apple marks.
 *
 * These are somebody else's trademarks sitting on our signup screen, so there
 * are two separate things to get right and they pull in opposite directions.
 *
 * Correctness: it has to be the real mark. A hand-drawn approximation of the
 * Google G, or a rounded rectangle standing in for the Apple logo, is worse
 * than no logo: it is a wrong trademark, and to a visitor deciding whether to
 * hand over an identity it reads as a phishing page. So the geometry and the
 * four brand colors are pinned here, and provenance is written down in
 * docs/VISUAL_ASSETS.md.
 *
 * Accessibility: the mark is decoration. The button says "Continue with
 * Google"; a screen reader that also announces the logo says it twice. So the
 * SVG is aria-hidden and unfocusable, and the accessible name lives on the
 * parent button, which is tested on the auth screen rather than here.
 *
 * Neither may cost a runtime dependency or a network request. They are inline.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GoogleMark, AppleMark } from './ProviderMarks';

const SOURCE = readFileSync(join(process.cwd(), 'src', 'components', 'ProviderMarks.tsx'), 'utf8');

afterEach(cleanup);

function svgOf(node: React.ReactElement): SVGSVGElement {
  const { container } = render(node);
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('no svg rendered');
  return svg as unknown as SVGSVGElement;
}

describe('the Google mark', () => {
  it('is the four-color G, with all four official colors', () => {
    const svg = svgOf(<GoogleMark />);
    const fills = [...svg.querySelectorAll('path')].map(p => (p.getAttribute('fill') ?? '').toUpperCase());
    for (const color of ['#4285F4', '#34A853', '#FBBC05', '#EA4335']) {
      expect(fills, `${color} is part of the mark`).toContain(color);
    }
  });

  it('keeps its official proportions', () => {
    const svg = svgOf(<GoogleMark />);
    const box = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
    expect(box).toHaveLength(4);
    // The G is drawn on a square canvas. Squashing it is a trademark misuse and
    // it also just looks wrong next to the Apple mark.
    expect(box[2]).toBe(box[3]);
  });

  it('does not recolor itself with the site palette', () => {
    // currentColor is the house rule for our own drawings and exactly the wrong
    // thing here: a green Google G is not the Google G.
    const svg = svgOf(<GoogleMark />);
    expect(svg.innerHTML).not.toMatch(/currentColor/);
    expect(svg.innerHTML).not.toMatch(/#2F6B3F|var\(--/i);
  });
});

describe('the Apple mark', () => {
  it('is one solid monochrome shape, as Apple requires', () => {
    const svg = svgOf(<AppleMark />);
    const paths = [...svg.querySelectorAll('path')];
    expect(paths).toHaveLength(1);
  });

  it('is drawn in a single flat color with no gradient or outline', () => {
    const svg = svgOf(<AppleMark />);
    const fill = svg.querySelector('path')?.getAttribute('fill') ?? '';
    expect(fill).toMatch(/^(#[0-9a-f]{3,6}|currentColor)$/i);
    expect(svg.innerHTML).not.toMatch(/gradient|stroke=/i);
  });

  it('keeps its official proportions, which are taller than wide', () => {
    const svg = svgOf(<AppleMark />);
    const [, , w, h] = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
    expect(h).toBeGreaterThan(w);
  });
});

describe('both marks', () => {
  const marks: [string, React.ReactElement][] = [
    ['google', <GoogleMark key="g" />],
    ['apple', <AppleMark key="a" />]
  ];

  it('are decoration, so nothing announces them twice', () => {
    for (const [name, node] of marks) {
      const svg = svgOf(node);
      expect(svg.getAttribute('aria-hidden'), name).toBe('true');
      expect(svg.getAttribute('focusable'), name).toBe('false');
      expect(svg.querySelector('title'), name).toBeNull();
      expect(svg.getAttribute('role'), name).not.toBe('img');
      cleanup();
    }
  });

  it('are sized in px so they hold still when the page is zoomed to 200 percent', () => {
    for (const [name, node] of marks) {
      const svg = svgOf(node);
      expect(svg.getAttribute('width'), name).toMatch(/^\d+$/);
      expect(svg.getAttribute('height'), name).toMatch(/^\d+$/);
      cleanup();
    }
  });

  it('accept a size, so the button can set one place and both agree', () => {
    const svg = svgOf(<GoogleMark size={24} />);
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
  });

  it('fetch nothing and depend on nothing', () => {
    expect(SOURCE).not.toMatch(/<image|xlink:href|href=|url\(|import .* from '(?!react)/);
    expect(SOURCE).not.toMatch(/https?:\/\//);
  });

  it('are drawn, not typed: no emoji and no letter standing in for a logo', () => {
    expect(SOURCE).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(SOURCE).not.toMatch(/<text\b/);
  });

  it('claim no endorsement anywhere in the file', () => {
    expect(SOURCE).not.toMatch(/partner|endorse|official partner|approved by/i);
  });

  it('use no em dashes, like everything else here', () => {
    expect(SOURCE).not.toMatch(/\u2014/);
  });
});
