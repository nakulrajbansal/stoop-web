/**
 * The visual system's contract with the stylesheet.
 *
 * Motion here is decoration, so the rule is not "keep it short", it is "it must
 * be able to not happen at all". Every animation the visual pass added has to
 * be removable by the OS setting, has to run once rather than loop, and has to
 * move only opacity and transform, because anything else (width, height,
 * margin, top) reflows the page and can move a control out from under a thumb
 * mid tap.
 *
 * The category tokens are checked here too. A drawing whose ink is missing
 * renders as an empty coloured tile, and a drawing whose ink disagrees with its
 * pill reads as a different category to the word beside it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORIES } from '@/components/CategoryArt';

const ROOT = process.cwd();
const CSS = readFileSync(join(ROOT, 'src', 'app', 'globals.css'), 'utf8');

/** Every component and page, so a class can be asked whether anything uses it. */
function markup(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) markup(full, out);
    else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) out.push(readFileSync(full, 'utf8'));
  }
  return out;
}

const MARKUP = markup(join(ROOT, 'src'));

/** The body of the prefers-reduced-motion block. */
function reducedMotionBlock(): string {
  const start = CSS.indexOf('@media (prefers-reduced-motion: reduce)');
  expect(start).toBeGreaterThan(-1);
  // Walk braces so the whole at-rule comes back, nested rules included.
  let depth = 0;
  let i = CSS.indexOf('{', start);
  const from = i;
  for (; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}') {
      depth--;
      if (depth === 0) return CSS.slice(from, i + 1);
    }
  }
  throw new Error('unterminated reduced motion block');
}

function keyframeBodies(): { name: string; body: string }[] {
  const found: { name: string; body: string }[] = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(CSS))) {
    let depth = 0;
    let i = CSS.indexOf('{', match.index);
    const from = i;
    for (; i < CSS.length; i++) {
      if (CSS[i] === '{') depth++;
      else if (CSS[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    found.push({ name: match[1], body: CSS.slice(from, i + 1) });
  }
  return found;
}

describe('motion can always be turned off', () => {
  const reduce = reducedMotionBlock();

  it('names the entrance classes explicitly rather than relying on the blanket rule', () => {
    expect(reduce).toMatch(/\.rise\b/);
    expect(reduce).toMatch(/\.rise-art\b/);
    expect(reduce).toMatch(/animation:\s*none/);
    // And leaves them in their finished state, never mid fade.
    expect(reduce).toMatch(/opacity:\s*1/);
    expect(reduce).toMatch(/transform:\s*none/);
  });

  it('stops the hover lift and the meter transition too', () => {
    expect(reduce).toMatch(/\.lift:hover/);
    expect(reduce).toMatch(/\.lift:focus-within/);
    expect(reduce).toMatch(/\.meter-seg/);
  });

  it('cancels every state the lift actually moves on, not the ones somebody remembered', () => {
    // The bug this replaces: the live rule fired on :focus-within while the
    // reset named :focus-visible, so pointing at a category tile still nudged
    // it 2px under the OS setting. Read the live selectors out of the
    // stylesheet rather than repeating them, so the two can never drift again.
    const live = CSS.match(/((?:\.lift:[a-z-]+,?\s*)+)\{[^}]*transform:[^}]*\}/);
    expect(live, 'no .lift rule with a transform in it').not.toBeNull();

    const selectors = live![1]
      .split(',')
      .map(selector => selector.trim())
      .filter(Boolean);
    expect(selectors.length).toBeGreaterThan(1);

    for (const selector of selectors) {
      expect(reduce, `${selector} moves but is never cancelled`).toContain(selector);
    }
  });

  it('still lets the spinner spin, because it means "working"', () => {
    expect(reduce).toMatch(/\.spinner/);
    expect(reduce).toMatch(/animation-iteration-count:\s*infinite/);
  });
});

describe('what the animations are allowed to move', () => {
  const frames = keyframeBodies();

  it('has the entrance keyframes the components use', () => {
    const names = frames.map(f => f.name);
    expect(names).toContain('stoop-rise');
    expect(names).toContain('stoop-rise-art');
  });

  it('moves only opacity and transform, so nothing reflows', () => {
    const allowed = /^(opacity|transform)$/;
    for (const frame of frames) {
      const properties = [...frame.body.matchAll(/([a-z-]+)\s*:/g)].map(m => m[1]);
      for (const property of properties) {
        expect(property, `${frame.name} animates ${property}`).toMatch(allowed);
      }
    }
  });

  it('defines no entrance delay that nothing on the site uses', () => {
    // The stylesheet shipped .rise-2, .rise-3 and .rise-4 with no element
    // wearing any of them. Dead motion classes are how a stylesheet ends up
    // describing a page that does not exist, and they are read as evidence
    // that the staggering was considered when it was not.
    const defined = [...CSS.matchAll(/\.(rise-\d+)\s*\{/g)].map(match => match[1]);
    expect(defined.length).toBeGreaterThan(0);

    for (const name of defined) {
      const used = MARKUP.some(source => new RegExp(`\\b${name}\\b`).test(source));
      expect(used, `.${name} is defined but nothing wears it`).toBe(true);
    }
  });

  it('runs each entrance once, and loops nothing but the spinner', () => {
    const loops = [...CSS.matchAll(/animation:[^;]*infinite[^;]*;/g)].map(m => m[0]);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toMatch(/spin /);
    expect(CSS).toMatch(/\.rise\s*\{[^}]*animation:\s*stoop-rise[^;]*both/);
  });
});

describe('category tokens', () => {
  for (const category of CATEGORIES) {
    it(`${category} has both a pill and a drawing ink`, () => {
      expect(CSS).toMatch(new RegExp(`\\.tag-${category}\\s*\\{`));
      const rule = CSS.match(new RegExp(`\\.cat-${category}\\s*\\{([^}]*)\\}`));
      expect(rule, `.cat-${category} is missing`).not.toBeNull();
      expect(rule![1]).toMatch(/--cat-ink:\s*#[0-9A-Fa-f]{6}/);
      expect(rule![1]).toMatch(/--cat-wash:\s*rgba\(/);
    });
  }

  it('gives the drawing a colour even for a category the stylesheet has not met', () => {
    expect(CSS).toMatch(/\.cat-art\s*\{[^}]*color:\s*var\(--cat-ink,\s*var\(--ink2\)\)/);
  });
});

describe('a pinned action bar cannot hide the control you tabbed to', () => {
  // Measured in Chrome at 320 x 568: the composer's publish bar is 123px tall
  // and sits 12px off the bottom, so it owns the last 135px of the viewport.
  // Tabbing scrolls a control "just into view", which lands it flush with the
  // viewport bottom, which is underneath the bar. Before this rule, focusing
  // the last category button put it behind the publish button.
  const BAR_HEIGHT_PX = 123;
  const BAR_OFFSET_PX = 12;

  const rule = CSS.match(/\.has-sticky-action([^{]*)\{([^}]*)\}/);

  it('reserves more room than the bar occupies', () => {
    expect(rule, '.has-sticky-action rule is missing').not.toBeNull();
    const declared = rule![2].match(/scroll-margin-bottom:\s*(\d+)px/);
    expect(declared, 'no scroll-margin-bottom in the rule').not.toBeNull();
    expect(Number(declared![1])).toBeGreaterThanOrEqual(BAR_HEIGHT_PX + BAR_OFFSET_PX);
  });

  it('reaches everything a person can tab to, not only the buttons', () => {
    const selector = rule![1];
    for (const tag of ['a', 'button', 'input', 'textarea', 'select', 'summary']) {
      expect(selector, `${tag} is not covered by the rule`).toMatch(new RegExp(`\\b${tag}\\b`));
    }
    expect(selector).toMatch(/\[tabindex\]/);
  });

  it('is applied to the one form that pins an action, and nowhere else', () => {
    const composer = readFileSync(join(ROOT, 'src', 'app', 'post', 'page.tsx'), 'utf8');
    expect(composer).toMatch(/has-sticky-action/);
    // The thing it exists to compensate for.
    expect(composer).toMatch(/sticky bottom-3/);

    const wearers = MARKUP.filter(source => /has-sticky-action/.test(source));
    const pinners = MARKUP.filter(source => /\bsticky bottom-/.test(source));
    expect(wearers).toHaveLength(1);
    // Every surface that pins an action bar has to opt in; none is missing.
    expect(pinners.length).toBe(wearers.length);
  });
});

describe('the disclosure styling keeps the native control usable', () => {
  it('hides the default marker but keeps a visible focus ring', () => {
    expect(CSS).toMatch(/\.disclosure\s*>\s*summary::-webkit-details-marker\s*\{\s*display:\s*none/);
    expect(CSS).toMatch(/\.disclosure\s*>\s*summary:focus-visible\s*\{[^}]*outline:/);
  });

  it('gives the summary a real tap target', () => {
    const rule = CSS.match(/\.disclosure\s*>\s*summary\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/padding:\s*14px/);
    expect(rule![1]).toMatch(/cursor:\s*pointer/);
  });
});
