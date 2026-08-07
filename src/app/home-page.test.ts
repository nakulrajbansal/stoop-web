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
 *   * photographs only through the framed, captioned component.
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
  it('goes through the framed component and nothing else', () => {
    expect(SOURCE).toMatch(/<Photograph/);
    expect(SOURCE).not.toMatch(/<img\b/);
    expect(SOURCE).not.toMatch(/from 'next\/image'/);
  });

  it('gives every photograph a sizes hint and a fixed shape, so none of them shifts the page', () => {
    const photographs = [...SOURCE.matchAll(/<Photograph[\s\S]*?\/>/g)].map(m => m[0]);
    expect(photographs.length).toBeGreaterThan(2);
    for (const photograph of photographs) {
      expect(photograph).toMatch(/sizes=/);
      expect(photograph).toMatch(/aspect=|aspect-\[/);
    }
  });

  it('loads the one above the fold eagerly and leaves the rest lazy', () => {
    expect([...SOURCE.matchAll(/\bpriority\b/g)]).toHaveLength(1);
  });

  it('captions all three, with no opt-out anywhere on the page', () => {
    // Photograph renders the caption unconditionally now, so this is here to
    // catch a call site trying to reintroduce the exception rather than to
    // check the component. The rendered proof is in Photograph.test.tsx.
    expect(SOURCE).not.toMatch(/showCaption/);
    expect([...SOURCE.matchAll(/<Photograph\b/g)]).toHaveLength(3);
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
    expect(row).toMatch(/\{plan\.text/);
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
