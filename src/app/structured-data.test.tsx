/**
 * @vitest-environment jsdom
 *
 * Structured data on the routes that are not the homepage.
 *
 * src/lib/json-ld.test.ts proves the serializer is sound and that the homepage
 * uses it. These tests cover the four other public surfaces that ship a
 * `<script type="application/ld+json">`, each of which built its payload with a
 * bare JSON.stringify until this change:
 *
 *   plan detail      SocialEvent, and the sharp one. `name` is the plan text a
 *                    neighbor typed, `location.name` is the meeting spot they
 *                    typed, and `organizer.name` comes from their display name.
 *                    None of it is filtered anywhere on the way in, so a plan
 *                    beginning "</script><script>" closed the element and put
 *                    the rest of itself into the page as markup.
 *   neighborhood     BreadcrumbList plus an ItemList of plan slugs. A slug is
 *                    built from the plan text, so it is user-derived too.
 *   city             BreadcrumbList of stored city names and slugs.
 *   guide            Article, every value a literal in that file.
 *
 * The last two are not user-authored today. They are covered the same way on
 * purpose: the security property is "no page serializes its own structured
 * data", not "no page serializes text we currently believe is safe", and a
 * carve-out is how the next block gets missed.
 *
 * The proofs are not regular expressions read back over the escaping, which
 * would only show the function doing what the function does. Each one renders
 * the real JsonLd component the way the server renders it, drops that markup
 * into a real HTML parser, and asks the resulting document what it received.
 * Every route shape also has a negative control feeding the same document the
 * pre-fix payload, which must break; if one of those ever passes, the parser is
 * not being exercised and the test above it proves nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import JsonLd from '@/components/JsonLd';
import { firstNameOf } from '@/lib/participants';

/** Plan text written by somebody trying to get out of the script element. */
const HOSTILE = '</script><script>window.__stoop_pwned = 1;</script> coffee saturday';

/** The other way out of script data: the comment opener the tokenizer honours. */
const HOSTILE_COMMENT = '<!--<script> coffee saturday, bring a friend';

/**
 * The SocialEvent from src/app/plan/[slug]/page.tsx, with every field a host
 * controls fed from the caller. firstNameOf is the real one, so the block still
 * proves the organizer is a first name and nothing more.
 */
function planEventJsonLd({ text, spot, hostName }: { text: string; spot: string; hostName: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SocialEvent',
    name: text.length > 110 ? text.substring(0, 110) + '…' : text,
    description: `A neighbor-hosted coffee plan in Williamsburg. Small group, in person, join over the thing itself.`,
    startDate: '2026-08-15',
    endDate: '2026-08-15',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    isAccessibleForFree: true,
    maximumAttendeeCapacity: 4,
    remainingAttendeeCapacity: 2,
    keywords: `coffee, Williamsburg, New York, meet neighbors, make friends`,
    organizer: { '@type': 'Person', name: firstNameOf(hostName) },
    performer: { '@type': 'Person', name: firstNameOf(hostName) },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: 'https://www.stoop.house/plan/coffee-saturday-ab12'
    },
    location: {
      '@type': 'Place',
      name: spot,
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'New York',
        addressRegion: 'NY',
        addressCountry: 'US'
      }
    },
    url: 'https://www.stoop.house/plan/coffee-saturday-ab12'
  };
}

/** The BreadcrumbList from src/app/[city]/page.tsx. */
function cityBreadcrumbJsonLd({ name, slug }: { name: string; slug: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Stoop', item: 'https://www.stoop.house/' },
      { '@type': 'ListItem', position: 2, name, item: `https://www.stoop.house/${slug}` }
    ]
  };
}

/** The BreadcrumbList from src/app/[city]/[hood]/page.tsx. */
function hoodBreadcrumbJsonLd({ hoodName, hoodSlug }: { hoodName: string; hoodSlug: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Stoop', item: 'https://www.stoop.house/' },
      { '@type': 'ListItem', position: 2, name: 'New York', item: 'https://www.stoop.house/nyc' },
      { '@type': 'ListItem', position: 3, name: hoodName, item: `https://www.stoop.house/nyc/${hoodSlug}` }
    ]
  };
}

/** The ItemList of plans from src/app/[city]/[hood]/page.tsx. */
function hoodItemListJsonLd({ hoodName, slugs }: { hoodName: string; slugs: string[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Plans in ${hoodName} this week`,
    itemListElement: slugs.map((slug, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://www.stoop.house/plan/${slug}`
    }))
  };
}

/** The Article from src/app/guides/[slug]/page.tsx. */
function guideArticleJsonLd({ headline, slug }: { headline: string; slug: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description: 'A practical guide to making friends as an adult.',
    author: { '@type': 'Organization', name: 'Stoop', url: 'https://www.stoop.house' },
    publisher: { '@type': 'Organization', name: 'Stoop', url: 'https://www.stoop.house' },
    mainEntityOfPage: `https://www.stoop.house/guides/${slug}`
  };
}

/**
 * Parse a whole document with `markup` in it and a marker element after it. If
 * the payload ends its script early, the marker stops being the script's only
 * sibling and the spilled text lands in the body.
 */
function parseDocument(markup: string) {
  const document = new DOMParser().parseFromString(
    `<!doctype html><html><head></head><body>${markup}<div id="marker">only this</div></body></html>`,
    'text/html'
  );
  const body = document.body.cloneNode(true) as HTMLElement;
  for (const script of [...body.querySelectorAll('script')]) script.remove();

  return {
    scripts: [...document.querySelectorAll('script')],
    /** Document text with script data taken out: what a reader would see. */
    escapedText: (body.textContent ?? '').trim(),
    markerCount: document.querySelectorAll('#marker').length
  };
}

/** Render the real component the way the server does, then parse the result. */
function renderAndParse(data: unknown) {
  return parseDocument(renderToStaticMarkup(<JsonLd data={data} />));
}

/** What each page used to emit, for the negative controls. */
function legacyMarkup(data: unknown) {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

/**
 * The whole assertion, run against every route shape: one script element, the
 * marker untouched, nothing from the payload loose in the document, and the
 * payload still parsing back to the object that went in.
 *
 * Note what is deliberately NOT asserted. The hostile text is still in there,
 * spelled out, because a crawler has to read the plan the host actually wrote.
 * Sealed does not mean laundered; it means the tokenizer cannot act on it.
 */
function expectSealed(data: unknown) {
  const { scripts, escapedText, markerCount } = renderAndParse(data);

  expect(scripts).toHaveLength(1);
  expect(scripts[0].getAttribute('type')).toBe('application/ld+json');
  expect(escapedText).toBe('only this');
  expect(markerCount).toBe(1);

  // What the parser handed back holds no character it could have acted on.
  const text = scripts[0].textContent ?? '';
  expect(text).not.toContain('<');
  expect(text).not.toContain('>');
  expect(text.toLowerCase()).not.toContain('</script');
  // Semantically identical after a real parse: crawlers read what was written.
  expect(JSON.parse(text)).toEqual(data);

  return text;
}

describe('plan detail structured data', () => {
  it('seals hostile plan text, spot and host name inside the script element', () => {
    const data = planEventJsonLd({ text: HOSTILE, spot: HOSTILE, hostName: HOSTILE });
    const text = expectSealed(data);

    // Round trip, field by field: the escaping did not eat the host's words.
    const parsed = JSON.parse(text);
    expect(parsed.name).toBe(HOSTILE);
    expect(parsed.location.name).toBe(HOSTILE);
    // A display name is still cut to its first token before it is published.
    expect(parsed.organizer.name).toBe('</script><script>window.__stoop_pwned');
    expect(parsed.organizer.name).toBe(firstNameOf(HOSTILE));
    expect(parsed.performer.name).toBe(parsed.organizer.name);
  });

  it('seals the comment opener out of script data too', () => {
    const data = planEventJsonLd({ text: HOSTILE_COMMENT, spot: 'Devocion', hostName: 'Maya Chen' });
    const parsed = JSON.parse(expectSealed(data));

    expect(parsed.name).toBe(HOSTILE_COMMENT);
    expect(parsed.organizer.name).toBe('Maya');
  });

  it('keeps the SocialEvent schema the crawler expects', () => {
    const parsed = JSON.parse(expectSealed(planEventJsonLd({ text: HOSTILE, spot: HOSTILE, hostName: 'Maya Chen' })));

    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@type']).toBe('SocialEvent');
    expect(parsed.maximumAttendeeCapacity).toBe(4);
    expect(parsed.offers.availability).toBe('https://schema.org/InStock');
    expect(parsed.location['@type']).toBe('Place');
  });

  it('breaks the same document the old way, so the test above is not vacuous', () => {
    const { scripts, escapedText } = parseDocument(
      legacyMarkup(planEventJsonLd({ text: HOSTILE, spot: HOSTILE, hostName: HOSTILE }))
    );

    // A second script element the page never wrote, with no type attribute,
    // which is to say a runnable classic script holding the host's payload.
    expect(scripts.length).toBeGreaterThan(1);
    const injected = scripts.filter(script => script.getAttribute('type') === null);
    expect(injected.length).toBeGreaterThan(0);
    expect(injected.some(script => (script.textContent ?? '').includes('window.__stoop_pwned'))).toBe(true);
    expect(escapedText).not.toBe('only this');
  });
});

describe('neighborhood structured data', () => {
  it('seals a hostile neighborhood name in the breadcrumb', () => {
    const parsed = JSON.parse(expectSealed(hoodBreadcrumbJsonLd({ hoodName: HOSTILE, hoodSlug: HOSTILE })));

    expect(parsed.itemListElement).toHaveLength(3);
    expect(parsed.itemListElement[2].name).toBe(HOSTILE);
    expect(parsed.itemListElement[2].item).toBe(`https://www.stoop.house/nyc/${HOSTILE}`);
  });

  it('seals a hostile plan slug in the plan list', () => {
    const data = hoodItemListJsonLd({ hoodName: HOSTILE, slugs: ['coffee-saturday-ab12', HOSTILE] });
    const parsed = JSON.parse(expectSealed(data));

    expect(parsed['@type']).toBe('ItemList');
    expect(parsed.name).toBe(`Plans in ${HOSTILE} this week`);
    expect(parsed.itemListElement[1].url).toBe(`https://www.stoop.house/plan/${HOSTILE}`);
    // Positions still start at 1 and run in order, which is what the list means.
    expect(parsed.itemListElement.map((item: { position: number }) => item.position)).toEqual([1, 2]);
  });

  it('breaks the same document the old way, so the tests above are not vacuous', () => {
    const breadcrumb = parseDocument(legacyMarkup(hoodBreadcrumbJsonLd({ hoodName: HOSTILE, hoodSlug: HOSTILE })));
    const list = parseDocument(legacyMarkup(hoodItemListJsonLd({ hoodName: HOSTILE, slugs: [HOSTILE] })));

    expect(breadcrumb.scripts.length).toBeGreaterThan(1);
    expect(breadcrumb.escapedText).not.toBe('only this');
    expect(list.scripts.length).toBeGreaterThan(1);
    expect(list.escapedText).not.toBe('only this');
  });
});

describe('city structured data', () => {
  it('seals a hostile city name in the breadcrumb', () => {
    const parsed = JSON.parse(expectSealed(cityBreadcrumbJsonLd({ name: HOSTILE, slug: HOSTILE })));

    expect(parsed['@type']).toBe('BreadcrumbList');
    expect(parsed.itemListElement).toHaveLength(2);
    expect(parsed.itemListElement[0].name).toBe('Stoop');
    expect(parsed.itemListElement[1].name).toBe(HOSTILE);
  });

  it('breaks the same document the old way, so the test above is not vacuous', () => {
    const { scripts, escapedText } = parseDocument(legacyMarkup(cityBreadcrumbJsonLd({ name: HOSTILE, slug: HOSTILE })));

    expect(scripts.length).toBeGreaterThan(1);
    expect(escapedText).not.toBe('only this');
  });
});

describe('guide structured data', () => {
  it('goes through the same authority even though every value is a literal', () => {
    const parsed = JSON.parse(expectSealed(guideArticleJsonLd({ headline: HOSTILE, slug: 'how-to-make-friends-in-nyc' })));

    expect(parsed['@type']).toBe('Article');
    expect(parsed.headline).toBe(HOSTILE);
    expect(parsed.mainEntityOfPage).toBe('https://www.stoop.house/guides/how-to-make-friends-in-nyc');
  });
});

describe('no route serializes its own structured data', () => {
  const ROUTES = {
    'plan detail': join('src', 'app', 'plan', '[slug]', 'page.tsx'),
    city: join('src', 'app', '[city]', 'page.tsx'),
    neighborhood: join('src', 'app', '[city]', '[hood]', 'page.tsx'),
    guide: join('src', 'app', 'guides', '[slug]', 'page.tsx')
  };

  /** How many blocks each route ships, so a deletion is a failure too. */
  const BLOCK_COUNT: Record<string, number> = {
    'plan detail': 1,
    city: 1,
    neighborhood: 2,
    guide: 1
  };

  for (const [label, path] of Object.entries(ROUTES)) {
    it(`${label} hands its block to JsonLd and names no dangerous prop`, () => {
      const source = readFileSync(join(process.cwd(), path), 'utf8');

      expect(source).not.toMatch(/dangerouslySetInnerHTML/);
      expect(source).not.toMatch(/ld\+json/);
      expect(source).not.toMatch(/JSON\.stringify/);
      expect(source).toMatch(/from '@\/components\/JsonLd'/);
      expect([...source.matchAll(/<JsonLd\b/g)]).toHaveLength(BLOCK_COUNT[label]);
    });
  }

  it('the plan page still passes the event block it built', () => {
    const source = readFileSync(join(process.cwd(), ROUTES['plan detail']), 'utf8');
    expect(source).toMatch(/<JsonLd data=\{eventJsonLd\}/);
    // And the organizer is still published as a first name only.
    expect(source).toMatch(/organizer: \{ '@type': 'Person', name: firstNameOf\(/);
    expect(source).toMatch(/performer: \{ '@type': 'Person', name: firstNameOf\(/);
  });
});

describe('nothing under src/app can write structured data by hand', () => {
  /** Every source file under src/app, tests excluded: they quote the pattern. */
  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sourceFiles(full));
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  const FILES = sourceFiles(join(process.cwd(), 'src', 'app'));

  it('finds files to check at all', () => {
    // A walker that silently returned nothing would pass every test below it.
    expect(FILES.length).toBeGreaterThan(20);
  });

  it('has no ld+json script outside the JsonLd component', () => {
    const offenders = FILES.filter(file => readFileSync(file, 'utf8').includes('ld+json'));
    expect(offenders).toEqual([]);
  });

  it('never feeds JSON.stringify to dangerouslySetInnerHTML', () => {
    const offenders = FILES.filter(file => {
      const source = readFileSync(file, 'utf8');
      return source.includes('dangerouslySetInnerHTML') && source.includes('JSON.stringify');
    });
    expect(offenders).toEqual([]);
  });

  it('leaves exactly one hand-written inline script, the referrer shim', () => {
    const withDangerousHtml = FILES.filter(file => readFileSync(file, 'utf8').includes('dangerouslySetInnerHTML'))
      .map(file => file.replace(process.cwd(), '').replace(/\\/g, '/'));

    // layout.tsx inlines a compile-time constant from lib/referrer-shim, which
    // carries no runtime value at all. Anything else appearing here is new and
    // wants reading before it ships.
    expect(withDangerousHtml).toEqual(['/src/app/layout.tsx']);
  });
});
