/**
 * The photographs, and the rules they live under.
 *
 * Photography on Stoop is editorial atmosphere. The risk it carries is not
 * bandwidth, it is that a picture of a person next to a plan reads as a person
 * who is going to that plan. So this file checks three separate things:
 *
 *   1. provenance, because an asset whose licence cannot be shown is an asset
 *      we cannot ship: every photo has a creator, a source page and a licence,
 *      and every one is written down in docs/VISUAL_ASSETS.md;
 *   2. privacy, because alt text is where an innocent picture starts claiming
 *      something about members: no photo may describe a host, a member or an
 *      attendee, and every photo carries the caption that separates it from
 *      live plan data;
 *   3. placement and weight, because a photograph belongs on the marketing
 *      surface and nowhere near a plan, a roster or an inbox.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { PHOTOS, ALL_PHOTOS } from './photos';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const PHOTO_DIR = join(ROOT, 'public', 'photos');

/** The ceiling the visual pass was given, in bytes. */
const TOTAL_BUDGET = 800 * 1024;
/** What we actually intend to ship, so a careless re-encode is caught early. */
const TOTAL_TARGET = 400 * 1024;

/**
 * Every module the app actually ships, test files excluded. The rules below
 * are about surfaces a visitor can reach; a test that renders a photograph in
 * order to check its caption is not one, and counting it would force this file
 * to keep an allowlist of its own suite.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(SRC).map(file => ({
  path: relative(ROOT, file).split(sep).join('/'),
  source: readFileSync(file, 'utf8')
}));

/**
 * Imports, whichever quote the file happened to use. Prettier is not installed
 * here, so both spellings are live and a rule that only saw one of them would
 * be one keystroke from silently passing.
 */
function importsFrom(source: string, specifier: string): boolean {
  const escaped = specifier.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`from\\s+['"\`]${escaped}['"\`]`).test(source);
}

const VISUAL_ASSETS = readFileSync(join(ROOT, 'docs', 'VISUAL_ASSETS.md'), 'utf8');

describe('every photograph is real, local and accounted for', () => {
  it('ships three, and they all live under public/photos', () => {
    expect(ALL_PHOTOS.length).toBe(3);
    for (const photo of ALL_PHOTOS) {
      expect(photo.src.startsWith('/photos/')).toBe(true);
      expect(photo.src.endsWith('.webp')).toBe(true);
      const stat = statSync(join(PHOTO_DIR, photo.src.replace('/photos/', '')));
      expect(stat.isFile()).toBe(true);
      expect(stat.size).toBeGreaterThan(1024);
    }
  });

  it('keeps the whole set well inside the media budget', () => {
    const total = ALL_PHOTOS.reduce(
      (bytes, photo) => bytes + statSync(join(PHOTO_DIR, photo.src.replace('/photos/', ''))).size,
      0
    );
    expect(total).toBeLessThan(TOTAL_TARGET);
    expect(total).toBeLessThan(TOTAL_BUDGET);
  });

  it('carries the intrinsic size, so no image can shift a page while it loads', () => {
    for (const photo of ALL_PHOTOS) {
      expect(photo.width).toBeGreaterThan(400);
      expect(photo.height).toBeGreaterThan(300);
      expect(photo.blurDataURL.startsWith('data:image/')).toBe(true);
      // A placeholder is a hint, not a payload.
      expect(photo.blurDataURL.length).toBeLessThan(600);
    }
  });

  it('records provenance for each one', () => {
    for (const photo of ALL_PHOTOS) {
      expect(photo.credit.creator.trim().length).toBeGreaterThan(2);
      expect(photo.credit.source).toMatch(/^https:\/\//);
      expect(photo.credit.license).toMatch(/CC0/);
    }
  });

  it('writes that provenance down where a human can check it', () => {
    for (const photo of ALL_PHOTOS) {
      expect(VISUAL_ASSETS).toContain(photo.src.replace('/photos/', ''));
      expect(VISUAL_ASSETS).toContain(photo.credit.source);
      expect(VISUAL_ASSETS).toContain(photo.credit.creator);
    }
    // Downloaded on a stated day, from a stated licence page.
    expect(VISUAL_ASSETS).toMatch(/2026-08-06/);
    expect(VISUAL_ASSETS).toMatch(/creativecommons\.org\/publicdomain\/zero/);
  });

  it('states the size on disk exactly, so a quiet re-encode cannot pass', () => {
    // The docs used to give sizes as "~50 KB" alongside a claim about what the
    // image optimizer serves per breakpoint, which nothing in this repo can
    // check. Only numbers that can be checked belong in that table.
    let total = 0;
    for (const photo of ALL_PHOTOS) {
      const bytes = statSync(join(PHOTO_DIR, photo.src.replace('/photos/', ''))).size;
      total += bytes;
      expect(VISUAL_ASSETS, `${photo.src} is ${bytes} bytes, not what the docs say`)
        .toContain(bytes.toLocaleString('en-US'));
    }
    expect(VISUAL_ASSETS, `the three add up to ${total} bytes`).toContain(total.toLocaleString('en-US'));
  });
});

describe('a photograph never says anything about a member', () => {
  it('describes the picture and nothing else', () => {
    // Words that would turn a stock photograph into a claim about who is on
    // Stoop, or about a plan that exists.
    const forbidden = /\b(host|hosts|hosting|member|members|attendee|attendees|joiner|participant|neighbor|neighbors|friend|friends|group of|meet ?up|our users)\b/i;
    for (const photo of ALL_PHOTOS) {
      expect(photo.alt.length).toBeGreaterThan(20);
      expect(photo.alt).not.toMatch(forbidden);
      // House style, written as an escape so this file does not itself
      // contain the character the rule forbids.
      expect(photo.alt).not.toMatch(/\u2014/);
    }
  });

  it('is captioned as a photograph rather than as a plan', () => {
    for (const photo of ALL_PHOTOS) {
      expect(photo.caption).toMatch(/not a plan/i);
    }
  });

  it('names a scene, not a person', () => {
    expect(PHOTOS.sidewalkTable.alt).toMatch(/chairs|table/i);
    expect(PHOTOS.coffeeCounter.alt).toMatch(/cup|counter/i);
    expect(PHOTOS.parkPath.alt).toMatch(/path|trees/i);
  });
});

describe('where a photograph is allowed to appear', () => {
  const usesPhotos = FILES.filter(file => importsFrom(file.source, '@/lib/photos'));
  const usesNextImage = FILES.filter(file => importsFrom(file.source, 'next/image'));

  it('only the marketing page and the Photograph component know about them', () => {
    expect(usesPhotos.map(f => f.path).sort()).toEqual([
      'src/app/page.tsx',
      'src/components/Photograph.tsx'
    ]);
  });

  it('renders them through one component, so the frame and caption cannot be skipped', () => {
    expect(usesNextImage.map(f => f.path)).toEqual(['src/components/Photograph.tsx']);
  });

  it('sees an import whichever quote character somebody typed', () => {
    // The rule above is a string scan, and this repo has no formatter to force
    // one style. A double-quoted import used to slip straight past it.
    const real = readFileSync(join(ROOT, 'src', 'components', 'Photograph.tsx'), 'utf8');
    expect(importsFrom(real, '@/lib/photos')).toBe(true);
    expect(importsFrom(real.replace(/'/g, '"'), '@/lib/photos')).toBe(true);
    expect(importsFrom("import Image from `next/image`;", 'next/image')).toBe(true);
    // And is not fooled by a longer path that merely ends the same way.
    expect(importsFrom("import x from '@/lib/photos-archive';", '@/lib/photos')).toBe(false);
  });

  it('keeps them off every surface that carries a plan or a person', () => {
    // The neighborhood routes are in here because they render PlanCard: they
    // are the busiest plan-carrying pages in the app and were not being
    // scanned at all. Their directory names contain regex metacharacters,
    // which is the other reason they were easy to leave out.
    const planSurfaces = FILES.filter(file =>
      /^src\/app\/(feed|plan|inbox|my-plans|profile|post|\[city\]|\[city\]\/\[hood\])\//.test(file.path) ||
      /^src\/components\/(PlanCard|PlanSummary|ConfirmedRoster|RequesterCard|Avatar)\.tsx$/.test(file.path)
    );
    const paths = planSurfaces.map(f => f.path);

    // Named so the scan cannot quietly shrink to nothing and still pass.
    expect(paths).toContain('src/app/[city]/page.tsx');
    expect(paths).toContain('src/app/[city]/[hood]/page.tsx');
    expect(paths).toContain('src/app/feed/FeedContent.tsx');
    expect(paths).toContain('src/components/PlanCard.tsx');
    expect(planSurfaces.length).toBeGreaterThan(8);

    for (const file of planSurfaces) {
      expect(file.source, file.path).not.toMatch(/\/photos\//);
      expect(file.source, file.path).not.toMatch(/lib\/photos/);
      expect(file.source, file.path).not.toMatch(/<Photograph\b/);
    }
  });

  it('never points at a remote image host at runtime', () => {
    for (const photo of ALL_PHOTOS) {
      expect(photo.src).not.toMatch(/^https?:/);
    }
    // The source pages are recorded in the credit and in the docs, and are not
    // fetched by the app.
    const config = readFileSync(join(ROOT, 'next.config.js'), 'utf8');
    expect(config).not.toMatch(/remotePatterns|domains:/);
  });
});
