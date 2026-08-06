/**
 * Who is still allowed to read a full name.
 *
 * After the postdeploy hardening migration, anon and authenticated can select
 * profiles.display_name and nothing else name-shaped. Any query that still asks
 * PostgREST for profiles.name through the browser session or the cookie-free
 * public client comes back denied, and the surface using it either breaks or,
 * worse, quietly decides the user is signed out.
 *
 * The rule this file enforces on the whole tree:
 *   * a read through the browser client, the SSR server client or the public
 *     anon client asks for name:display_name, never bare name;
 *   * a read through supabaseAdmin (service role) may ask for the full name,
 *     because the roster and the emails legitimately need it;
 *   * nothing renders a full name on a public surface.
 *
 * It scans source rather than mocking, because the failure mode is a query
 * string in a file nobody thought to open.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(SRC).map(f => ({ path: relative(process.cwd(), f).split(sep).join('/'), source: readFileSync(f, 'utf8') }));

/** Every `.select('...')` argument in a file, with the table it was called on. */
function selectsWithTable(source: string): { table: string; select: string; index: number }[] {
  const found: { table: string; select: string; index: number }[] = [];
  const re = /from\(\s*'(\w+)'\s*\)([\s\S]{0,400}?)\.select\(\s*(`[^`]*`|'[^']*')/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    found.push({ table: match[1], select: match[3].slice(1, -1), index: match.index });
  }
  return found;
}

/**
 * True when this particular from() call is made through the service role.
 *
 * Reads the receiver immediately before `.from(`, rather than looking for the
 * word anywhere nearby: `supabase.from(...)` two lines under an unrelated
 * supabaseAdmin call is exactly the case that must not pass.
 */
function isAdmin(source: string, index: number): boolean {
  const before = source.slice(0, index).replace(/[\s.]*$/, '');
  return /supabaseAdmin(\s+as\s+any)?\s*\)?$/.test(before.slice(-60));
}

/** The client behind an embedded join, found from the from() call that owns it. */
function isAdminJoin(source: string, joinIndex: number): boolean {
  const froms = [...source.slice(0, joinIndex).matchAll(/from\(\s*'\w+'\s*\)/g)];
  const owner = froms[froms.length - 1];
  return owner ? isAdmin(source, owner.index!) : false;
}

/** A select list that asks for the full name column. */
function asksForFullName(select: string): boolean {
  const fields = select.split(/[,\n]/).map(f => f.trim());
  return fields.some(f => /^name$/.test(f));
}

describe('nothing but the service role reads profiles.name', () => {
  for (const file of FILES) {
    const profileSelects = selectsWithTable(file.source).filter(s => s.table === 'profiles');
    for (const found of profileSelects) {
      if (!asksForFullName(found.select)) continue;
      it(`${file.path} uses the service role for its full-name read`, () => {
        expect(isAdmin(file.source, found.index), `select('${found.select}')`).toBe(true);
      });
    }
  }

  it('scanned something, so a broken scanner cannot pass silently', () => {
    const all = FILES.flatMap(f => selectsWithTable(f.source)).filter(s => s.table === 'profiles');
    expect(all.length).toBeGreaterThan(5);
  });
});

describe('embedded profile joins ask for the projection', () => {
  // poster:profiles!fk(...) and friends. An embedded join runs as whichever
  // role the surrounding query used, so the rule is the same as above: the
  // browser and the anon client get the projection, the service role may have
  // the full name (the moderation queue needs it to be useful).
  for (const file of FILES) {
    const joins = [...file.source.matchAll(/profiles![\w]*\(([^)]*)\)/g)];
    for (const join_ of joins) {
      const fields = join_[1].split(',').map(f => f.trim());
      if (!fields.some(f => /^name$/.test(f))) continue;
      it(`${file.path} embeds a full name only through the service role`, () => {
        expect(isAdminJoin(file.source, join_.index!), join_[0]).toBe(true);
      });
    }
  }

  it('scanned some joins, so a broken scanner cannot pass silently', () => {
    const all = FILES.flatMap(f => [...f.source.matchAll(/profiles![\w]*\(([^)]*)\)/g)]);
    expect(all.length).toBeGreaterThan(5);
  });
});

describe('the two surfaces the review named', () => {
  const nav = FILES.find(f => f.path === 'src/components/Nav.tsx')!;
  const profile = FILES.find(f => f.path === 'src/app/profile/page.tsx')!;

  it('Nav asks for the projection, so the signed-in header still knows who you are', () => {
    expect(nav.source).toMatch(/name:display_name/);
    const select = selectsWithTable(nav.source).find(s => s.table === 'profiles');
    expect(select).toBeDefined();
    expect(asksForFullName(select!.select)).toBe(false);
  });

  it('the profile editor no longer selects its own name from the browser', () => {
    const select = selectsWithTable(profile.source).find(s => s.table === 'profiles');
    expect(select === undefined || !asksForFullName(select.select)).toBe(true);
  });

  it('the profile editor gets the private name from the server endpoint instead', () => {
    expect(profile.source).toMatch(/fetch\(\s*'\/api\/profile'/);
  });

  it('the profile editor only sends people to /auth when the session is gone', () => {
    // A denied column used to look exactly like a missing session here, which
    // is how a signed-in user got told to sign in.
    const redirects = [...profile.source.matchAll(/router\.push\('\/auth'\)/g)];
    expect(redirects.length).toBeGreaterThan(0);
    for (const redirect of redirects) {
      const context = profile.source.slice(Math.max(0, redirect.index! - 220), redirect.index!);
      expect(context).toMatch(/401|!user|signed out/i);
    }
  });
});
