/**
 * @vitest-environment jsdom
 *
 * Structured data cannot be allowed to escape its own script element.
 *
 * The homepage's ItemList block carries plan text a neighbor typed, truncated
 * to 90 characters and dropped into `<script type="application/ld+json">` with
 * `dangerouslySetInnerHTML`. React does not escape that string, and neither
 * does `JSON.stringify`, which treats `<` as an ordinary character. A plan that
 * began "</script><script>..." would therefore have closed the element and put
 * the rest of the plan into the document as markup.
 *
 * These tests do not check the escaping by reading it back with a regular
 * expression, which would only prove the function does what the function does.
 * They hand the finished payload to a real HTML parser inside a real script
 * element and ask the resulting document what it thinks it received. The last
 * test feeds the same document the old unescaped payload and requires it to
 * break, so a parser that had quietly stopped being exercised could not let
 * the rest of them pass.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serializeJsonLd } from './json-ld';

/** Plan text written by somebody trying to get out of the script element. */
const HOSTILE = '</script><script>window.__stoop_pwned = 1;</script> coffee saturday';

/** The other way out of script data: the comment opener the tokenizer honours. */
const HOSTILE_COMMENT = '<!--<script> coffee saturday, bring a friend';

/** The shape src/app/page.tsx builds, with a hostile plan in the list. */
function itemList(text: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Featured neighbor plans this week',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        url: 'https://www.stoop.house/plan/coffee-saturday-ab12',
        name: text
      }
    ]
  };
}

/**
 * Parse a whole document with the payload inside a real ld+json element, and a
 * marker element after it. If the payload ends the script early, the marker
 * stops being the script's only sibling and the stray text lands in the body.
 */
function parseWithPayload(payload: string) {
  // DOMParser rather than the jsdom package directly: it is a full document
  // parse either way, and jsdom ships no type declarations, which this repo's
  // typecheck baseline is not allowed to grow for.
  const document = new DOMParser().parseFromString(
    `<!doctype html><html><head></head><body>` +
      `<script type="application/ld+json">${payload}</script>` +
      `<div id="marker">only this</div>` +
      `</body></html>`,
    'text/html'
  );
  // Everything the document says that is not inside a script element. A
  // payload that ends its element early turns into exactly this.
  const body = document.body.cloneNode(true) as HTMLElement;
  for (const script of [...body.querySelectorAll('script')]) script.remove();

  return {
    scripts: [...document.querySelectorAll('script')],
    /** Document text with script data taken out: what a reader would see. */
    escapedText: (body.textContent ?? '').trim(),
    elementCount: document.body.children.length,
    markerCount: document.querySelectorAll('#marker').length
  };
}

describe('serializeJsonLd', () => {
  it('leaves no character the HTML tokenizer can use to end the element', () => {
    const payload = serializeJsonLd(itemList(HOSTILE));
    expect(payload).not.toContain('<');
    expect(payload).not.toContain('>');
    expect(payload.toLowerCase()).not.toContain('</script');
    expect(payload).toContain('\\u003c');
  });

  it('is still JSON, and still says exactly what it was given', () => {
    const source = itemList(HOSTILE);
    const parsed = JSON.parse(serializeJsonLd(source));
    // Round trips through the escaping: a crawler reads the plan text the host
    // actually wrote, hostile characters and all.
    expect(parsed).toEqual(source);
    expect(parsed.itemListElement[0].name).toBe(HOSTILE);
  });

  it('survives a real HTML parse with hostile plan text inside it', () => {
    const { scripts, escapedText, elementCount, markerCount } = parseWithPayload(
      serializeJsonLd(itemList(HOSTILE))
    );

    // One script element, the one we opened. No second one was smuggled in.
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute('type')).toBe('application/ld+json');
    // Nothing from the plan text became document content.
    expect(escapedText).toBe('only this');
    expect(escapedText).not.toContain('window.__stoop_pwned');
    expect(elementCount).toBe(2);
    expect(markerCount).toBe(1);
    // And what the parser handed back is the payload, intact and parseable.
    expect(JSON.parse(scripts[0].textContent ?? '')).toEqual(itemList(HOSTILE));
  });

  it('closes the comment-opener route out of script data too', () => {
    const { scripts, escapedText } = parseWithPayload(serializeJsonLd(itemList(HOSTILE_COMMENT)));

    expect(scripts).toHaveLength(1);
    expect(escapedText).toBe('only this');
    expect(JSON.parse(scripts[0].textContent ?? '').itemListElement[0].name).toBe(HOSTILE_COMMENT);
  });

  it('shows the same document is breakable without it, so the test is not vacuous', () => {
    // The exact thing page.tsx used to do. If this ever stops failing, the
    // parser is not being exercised and the tests above prove nothing.
    const { scripts, escapedText } = parseWithPayload(JSON.stringify(itemList(HOSTILE)));

    // A second script element the page never wrote, holding runnable code.
    expect(scripts.length).toBeGreaterThan(1);
    expect(scripts.some(script => (script.textContent ?? '').includes('window.__stoop_pwned'))).toBe(true);
    // And the tail of the structured data spilled into the document as text.
    expect(escapedText).not.toBe('only this');
    expect(escapedText).toContain('coffee saturday');
  });

  it('escapes the line separators that are legal JSON but not legal JavaScript', () => {
    const payload = serializeJsonLd({ text: `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c` });
    expect(payload).toContain('\\u2028');
    expect(payload).toContain('\\u2029');
    expect(payload).not.toContain(String.fromCharCode(0x2028));
    expect(payload).not.toContain(String.fromCharCode(0x2029));
    expect(JSON.parse(payload).text).toBe(`a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c`);
  });

  it('answers an inert block rather than throwing on something it cannot represent', () => {
    expect(serializeJsonLd(undefined)).toBe('null');
    expect(() => JSON.parse(serializeJsonLd(undefined))).not.toThrow();
  });
});

describe('the homepage cannot write structured data any other way', () => {
  const PAGE = readFileSync(join(process.cwd(), 'src', 'app', 'page.tsx'), 'utf8');
  const COMPONENT = readFileSync(join(process.cwd(), 'src', 'components', 'JsonLd.tsx'), 'utf8');

  it('routes every block through the component, and names no dangerous prop itself', () => {
    expect(PAGE).not.toMatch(/dangerouslySetInnerHTML/);
    expect(PAGE).not.toMatch(/JSON\.stringify/);
    // Three blocks: the featured list, the site, and the FAQ.
    expect([...PAGE.matchAll(/<JsonLd\b/g)]).toHaveLength(3);
    // The featured list is the one with user-authored text in it.
    expect(PAGE).toMatch(/<JsonLd data=\{itemListJsonLd\}/);
  });

  it('and the component is the one thing that escapes', () => {
    expect(COMPONENT).toMatch(/type="application\/ld\+json"/);
    expect(COMPONENT).toMatch(/serializeJsonLd/);
    expect(COMPONENT).not.toMatch(/JSON\.stringify/);
  });
});
