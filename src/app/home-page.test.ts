/**
 * The homepage, checked by reading it.
 *
 * The page is an async server component that queries Supabase before it renders
 * anything, so it cannot be mounted in this suite the way a client component
 * can. What can be held still is the shape of it, and the things the visual
 * pass must not have quietly traded away while making the page look better:
 *
 *   * the contract a visitor reads before being asked for a phone number;
 *   * one dominant action, with browsing beside it rather than beside-equal;
 *   * honest supply, with the illustration labelled Sample;
 *   * the FAQ that a person sees and the FAQ that Google is told about coming
 *     from the same array, so collapsing the answers cannot make the structured
 *     data describe a page that does not exist;
 *   * photographs only through the one component, decorative, with a reserved
 *     box;
 *   * and the mobile-first shape of the page, which is what this rebuild is
 *     for. Only the parts a source read can honestly speak for are here: which
 *     order the sections are written in, that the primary action is above the
 *     board rather than below five explanatory sections, and that the phone
 *     type scale and section rhythm come from the one place they are defined.
 *     Rendered height, overflow and the focus sweep are browser facts and are
 *     measured in a browser, not asserted here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BROWSE_CONTRACT, CONTRACT_STEPS, CONTRACT_QUESTIONS } from '@/lib/product-copy';
import { categoryLabelOf } from '@/components/CategoryArt';

const SOURCE = readFileSync(join(process.cwd(), 'src', 'app', 'page.tsx'), 'utf8');

/** The block of JSX that renders one row of the featured list. */
function featuredRow(): string {
  const from = SOURCE.indexOf('plans.map((plan: any) =>');
  expect(from, 'the featured list is no longer a map over plans').toBeGreaterThan(-1);
  const to = SOURCE.indexOf('</Link>', from);
  return SOURCE.slice(from, to);
}

describe('what a visitor is told before signing up', () => {
  it('still states the whole sequence in the hero', () => {
    expect(SOURCE).toContain('{BROWSE_CONTRACT}');
    expect(BROWSE_CONTRACT).toMatch(/without an account/);
  });

  it('still answers all six contract questions on the page', () => {
    expect(SOURCE).toMatch(/CONTRACT_QUESTIONS\.map/);
    expect(CONTRACT_QUESTIONS).toHaveLength(6);
  });

  it('draws the four steps rather than only describing them', () => {
    expect(SOURCE).toMatch(/CONTRACT_STEPS\.map/);
    expect(SOURCE).toMatch(/STEP_ART\s*=\s*\[BrowseArt, MessageArt, HostChoosesArt, TableArt\]/);
    // One drawing per step, so a fifth step cannot arrive without a picture.
    expect(CONTRACT_STEPS).toHaveLength(4);
    expect(SOURCE).toMatch(/step\.short/);
  });
});

describe('one dominant action', () => {
  it('keeps posting primary and browsing secondary', () => {
    const primary = [...SOURCE.matchAll(/btn btn-accent btn-lg/g)];
    const ghost = [...SOURCE.matchAll(/btn btn-ghost btn-lg/g)];
    expect(primary).toHaveLength(1);
    expect(ghost).toHaveLength(1);
    expect(SOURCE.indexOf('btn btn-accent btn-lg')).toBeLessThan(SOURCE.indexOf('btn btn-ghost btn-lg'));
  });
});

describe('honest supply', () => {
  it('labels the illustration as a sample and invents no plans, people or counts', () => {
    expect(SOURCE).toMatch(/Sample · what a plan looks like/);
    expect(SOURCE).toMatch(/emptyNeighborhoodCopy\(\)/);
    expect(SOURCE).toMatch(/openPlanCount\(openPlans\)/);
    // No testimonial fiction, no borrowed social proof.
    expect(SOURCE).not.toMatch(/testimonial|"[^"]*loved it[^"]*"|as seen in|trusted by/i);
  });

  it('counts only what the database returned', () => {
    expect(SOURCE).toMatch(/const planCount = count \?\? 0/);
    expect(SOURCE).toMatch(/const openPlans = openCount \?\? 0/);
  });
});

describe('the FAQ a person reads and the FAQ Google is told about', () => {
  it('comes from one array, so a disclosure cannot hide an answer from only one of them', () => {
    expect(SOURCE).toMatch(/<FaqList items=\{FAQ\}/);
    expect(SOURCE).toMatch(/mainEntity: FAQ\.map/);
    expect(SOURCE).toMatch(/'@type': 'FAQPage'/);
  });
});

describe('photography', () => {
  it('goes through the one component and nothing else', () => {
    expect(SOURCE).toMatch(/<Photograph/);
    expect(SOURCE).not.toMatch(/<img\b/);
    expect(SOURCE).not.toMatch(/from 'next\/image'/);
  });

  it('gives every photograph a sizes hint and a reserved box, so none of them shifts the page', () => {
    const photographs = [...SOURCE.matchAll(/<Photograph[\s\S]*?\/>/g)].map(m => m[0]);
    // One, and only one: the layer inside the closing panel.
    expect(photographs).toHaveLength(1);
    for (const photograph of photographs) {
      expect(photograph).toMatch(/sizes=/);
      // A ratio or a stated height. Both settle the layout before the bytes
      // land; the bands use a height because their shape is the crop.
      expect(photograph).toMatch(/aspect=|aspect-\[|h-\[\d+px\]|photo-layer/);
    }
  });

  it('loads none of them eagerly, because none of them is above the fold any more', () => {
    // The masthead band was the one picture that blocked the first paint. It is
    // gone, so nothing on this page may claim priority: the remaining
    // photograph is a layer inside the last panel and a visitor scrolls the
    // whole page before meeting it.
    expect([...SOURCE.matchAll(/\bpriority\b/g)]).toHaveLength(0);
  });

  it('is laid in as atmosphere, never as a captioned exhibit', () => {
    expect(SOURCE).not.toMatch(/caption/i);
    expect(SOURCE).not.toMatch(/not a plan/i);
    // Decorative by default: no call site opts into speaking.
    expect(SOURCE).not.toMatch(/informative/);
    // Every placement is a fade or a panel layer rather than a bordered frame.
    for (const use of [...SOURCE.matchAll(/<Photograph[\s\S]*?\/>/g)].map(m => m[0])) {
      expect(use).toMatch(/photo-fade-|photo-layer/);
    }
  });
});

/**
 * What the top of the page leads with.
 *
 * It led with a photograph of empty bistro chairs, laid in as a band under the
 * nameplate. The founder's reading of it: it does not look good and it does not
 * make any sense. It was right on both counts, because a stock photograph is
 * the one thing on a page about concrete neighborhood plans that is not one:
 * it says nothing about what you get, and it spent the first 104px of a 320px
 * screen saying it.
 *
 * What replaced it is not another picture. It is the board itself, drawn as
 * paper pinned to the page, holding whatever is genuinely on it: real plans
 * when there are real plans, and the labelled sample when there are none.
 */
describe('the top of the page', () => {
  /** Everything above the first explanatory section. */
  const hero = SOURCE.slice(0, SOURCE.indexOf('how-it-works-heading'));

  it('carries no masthead photograph', () => {
    expect(SOURCE).not.toMatch(/sidewalkTable/);
    // The band's own mask. Gone with it, rather than left styling nothing.
    expect(SOURCE).not.toMatch(/photo-fade-b\b/);
    expect(hero).not.toMatch(/<Photograph/);
  });

  it('left no empty band behind where it used to be', () => {
    // A picture removed by deleting the <Image> and keeping its 104px box is
    // the same hole with nothing in it. Nothing may stand between the page
    // wrapper and the hero but comments.
    const between = SOURCE.slice(
      SOURCE.indexOf('<PageMain>') + '<PageMain>'.length,
      SOURCE.indexOf('<section', SOURCE.indexOf('<PageMain>'))
    );
    expect(between.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trim()).toBe('');
    expect(SOURCE).not.toMatch(/h-\[104px\]/);
  });

  it('replaces it with the board itself, drawn as paper on a noticeboard', () => {
    // Authored drawing, from the noticeboard vocabulary we already speak,
    // rather than a second stock photograph in a smaller box.
    expect(hero).toMatch(/board-panel/);
    expect(SOURCE).toMatch(/BoardPinArt/);
    expect(SOURCE).toMatch(/from '@\/components\/StoopArt'/);

    const pin = hero.match(/<BoardPinArt[\s\S]*?\/>/);
    expect(pin, 'the drawn pin is not in the hero').not.toBeNull();
    // Decorative. The heading beside it already says "On the board", and a
    // drawing that repeats a heading only makes a screen reader say it twice.
    expect(pin![0]).not.toMatch(/label=/);
    expect(pin![0]).not.toMatch(/aria-label=/);
  });

  it('puts nothing on that board that neighbors did not', () => {
    // The failure mode of drawing a board: filling it with plausible-looking
    // plans. The rows come from the query, and the one hand-written note is
    // labelled Sample and counted nowhere.
    // Stripped of its own commentary first: the note explaining what a featured
    // row reads like quotes the sample text, and a comment is not a plan.
    const board = hero.slice(hero.indexOf('board-panel')).replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '');
    expect(board).toMatch(/plans\.map\(\(plan: any\) =>/);
    expect(board).toMatch(/emptyNeighborhoodCopy\(\)/);

    // Exactly one hand-written plan on the board, and it is inside the block
    // that calls itself Sample. The rows that come from the query carry none.
    const sample = board.slice(
      board.indexOf('Sample · what a plan looks like'),
      board.indexOf('EmptyBoardArt')
    );
    expect(sample).toMatch(/farmers market/);
    expect(board.slice(board.indexOf('plans.map'))).not.toMatch(/farmers market/);

    // No urgency, no borrowed proof, no invented headcount.
    expect(board).not.toMatch(/almost full|filling up|hurry|only \d+ left|\d+ (people|neighbors) /i);
  });
});

describe('the shape of the page on a phone', () => {
  /** Where each landmark first appears in the source, i.e. in document order. */
  function at(pattern: RegExp): number {
    const found = SOURCE.search(pattern);
    expect(found, `not on the page: ${pattern}`).toBeGreaterThan(-1);
    return found;
  }

  it('puts the promise and the primary action ahead of the board and everything after it', () => {
    // The rejected build opened with a headline, a photograph in a frame, and
    // then four explanatory sections before a visitor reached a plan.
    expect(at(/Plans,<br \/>not /)).toBeLessThan(at(/btn btn-accent btn-lg/));
    expect(at(/btn btn-accent btn-lg/)).toBeLessThan(at(/On the board/));
    expect(at(/On the board/)).toBeLessThan(at(/how-it-works-heading/));
  });

  it('runs the board before the explaining, and the explaining before the FAQ', () => {
    const order = [
      /On the board/,
      /how-it-works-heading/,
      /categories-heading/,
      /before-signup-heading/,
      /faq-heading/,
      /three blocks away/
    ].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('takes its section rhythm and heading size from the stylesheet, not from each section', () => {
    // Five sections each carrying their own clamp() is how the phone ended up
    // with five different 28px headlines and 56px of air between every block.
    expect(SOURCE).not.toMatch(/text-\[clamp\(2[0-9]px/);
    const headings = [...SOURCE.matchAll(/<h2[^>]*className="([^"]*)"/g)].map(m => m[1]);
    expect(headings.length).toBeGreaterThan(3);
    const sectionHeadings = headings.filter(cls => /font-serif/.test(cls) && !/text-cream/.test(cls));
    for (const cls of sectionHeadings) {
      expect(cls, `a section heading sets its own size: ${cls}`).toMatch(/\bh-sec\b/);
    }
    expect(SOURCE).toMatch(/className="[^"]*\bsec\b/);
    expect(SOURCE).toMatch(/className="[^"]*\bgut\b/);
  });

  it('states the six contract answers as rows rather than as six bordered cards', () => {
    const block = SOURCE.slice(SOURCE.indexOf('before-signup-heading'));
    const list = block.slice(0, block.indexOf('</ul>'));
    expect(list).toMatch(/\brows\b/);
    // A card here is a border plus a radius plus padding, six times, in a
    // 284px column. The answers are the content; the chrome was not.
    expect(list).not.toMatch(/border-\[var\(--border\)\] rounded-2xl/);
  });
});

describe('what a featured row says about the kind of plan', () => {
  it('gives the drawing an accessible name, because the row has no room for the word', () => {
    // Every other surface writes the category out next to the art, which is
    // why the art is decorative there. These rows do not, so on this one
    // surface the drawing has to carry it.
    const row = featuredRow();
    expect(row).toMatch(/<CategoryArt/);
    expect(row).toMatch(/label=\{categoryLabelOf\(plan\.category\) \?\? undefined\}/);
  });

  it('names a category we draw, and says nothing for one we do not', () => {
    expect(categoryLabelOf('coffee')).toBe('Coffee');
    expect(categoryLabelOf('music')).toBe('Music');
    // A legacy row still gets the fallback picture; it does not get called
    // Coffee out loud.
    expect(categoryLabelOf('pottery')).toBeNull();
  });

  it('leaves the plan text, the host and the logistics as text, not as pictures', () => {
    const row = featuredRow();
    expect(row).toMatch(/plan\.text/);
    expect(row).toMatch(/firstNameOf\(plan\.poster\?\.name\)/);
    expect(row).toMatch(/\{plan\.when_day\}/);
    expect(row).toMatch(/\{plan\.neighborhood\?\.name\}/);
  });
});

describe('structured data', () => {
  it('goes out through the escaping component, never straight into a script', () => {
    // Plan text is user-authored and reaches the ItemList block. See
    // src/lib/json-ld.test.ts for the parser-level proof.
    expect(SOURCE).not.toMatch(/dangerouslySetInnerHTML/);
    expect([...SOURCE.matchAll(/<JsonLd\b/g)]).toHaveLength(3);
  });
});
