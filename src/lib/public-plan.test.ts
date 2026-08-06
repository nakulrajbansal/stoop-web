import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toPublicPlan, toPublicPlans, toPublicPoster, ogPlanFields } from './public-plan';

const PLAN = {
  id: 'plan-1',
  slug: 'coffee-at-partners-ab12',
  text: 'coffee at Partners on Wythe saturday morning',
  spot: 'Partners Coffee',
  cost_expectation: 'pay-own-way',
  neighborhood: { name: 'Williamsburg' },
  poster: {
    id: 'user-host',
    name: 'Maya Rodriguez',
    initials: 'MR',
    avatar_bg: '#D4E8D8',
    avatar_fg: '#2A4232',
    about: 'lives by the park',
    is_founding_member: true
  }
};

describe('what a public plan may carry about its host', () => {
  it('replaces the full name with the first name', () => {
    expect(toPublicPlan(PLAN).poster?.name).toBe('Maya');
  });

  it('never serializes the surname, which is the part that leaks in page source', () => {
    expect(JSON.stringify(toPublicPlan(PLAN))).not.toMatch(/Rodriguez/);
  });

  it('keeps everything else the public card needs', () => {
    const publicPlan = toPublicPlan(PLAN);
    expect(publicPlan.poster).toMatchObject({
      id: 'user-host',
      initials: 'MR',
      about: 'lives by the park',
      is_founding_member: true
    });
    expect(publicPlan.spot).toBe('Partners Coffee');
    expect(publicPlan.cost_expectation).toBe('pay-own-way');
  });

  it('does not mutate the row it was handed', () => {
    const row = { ...PLAN, poster: { ...PLAN.poster } };
    toPublicPlan(row);
    expect(row.poster.name).toBe('Maya Rodriguez');
  });

  it('copes with a missing or nameless poster', () => {
    expect(toPublicPlan({ ...PLAN, poster: null }).poster).toBeNull();
    expect(toPublicPoster({ name: null })?.name).toBe('A neighbor');
    expect(toPublicPoster(undefined)).toBeNull();
  });

  it('maps a whole list', () => {
    const list = toPublicPlans([PLAN, { ...PLAN, poster: { ...PLAN.poster, name: 'Theo Park' } }]);
    expect(list.map(p => p.poster?.name)).toEqual(['Maya', 'Theo']);
    expect(JSON.stringify(list)).not.toMatch(/Rodriguez|Park/);
  });
});

describe('the link preview image', () => {
  const OG_ROW = {
    text: 'coffee at Partners on Wythe saturday morning',
    when_day: 'Saturday',
    when_time: 'Morning',
    when_time_specific: '9:00 AM',
    neighborhood: { name: 'Williamsburg' },
    city: { name: 'New York City' },
    poster: { name: 'Maya Rodriguez' }
  };

  it('names the host by first name only, like every other public surface', () => {
    expect(ogPlanFields(OG_ROW).poster).toBe('Maya');
  });

  it('never lets a surname into the rendered image or its inputs', () => {
    // This is the one public surface a crawler fetches on its own, so the
    // serialized fields are checked, not just the visible string.
    expect(JSON.stringify(ogPlanFields(OG_ROW))).not.toMatch(/Rodriguez/);
  });

  it('still says when and where, and survives a missing plan', () => {
    const fields = ogPlanFields(OG_ROW);
    expect(fields.when).toBe('Saturday · 9:00 AM');
    expect(fields.where).toBe('Williamsburg, New York City');
    expect(fields.text).toMatch(/coffee at Partners/);

    const empty = ogPlanFields(null);
    expect(empty.poster).toBe('');
    expect(empty.text.length).toBeGreaterThan(0);
  });

  it('falls back to the neutral label rather than an empty byline', () => {
    expect(ogPlanFields({ ...OG_ROW, poster: { name: null } }).poster).toBe('A neighbor');
  });
});

// Rendering the first name is not enough on its own: the review found the
// surname sitting in the serialized props of a client component even where the
// visible text was already correct. These scans keep both halves honest.
const PUBLIC_SURFACES = [
  'src/components/PlanCard.tsx',
  'src/app/feed/page.tsx',
  'src/app/page.tsx',
  'src/app/plan/[slug]/page.tsx',
  'src/app/[city]/[hood]/page.tsx',
  'src/app/api/plans/route.ts',
  // Fetched by crawlers and unfurled into every shared link, so it is as public
  // as the plan page itself.
  'src/app/plan/[slug]/opengraph-image.tsx'
];

describe('every public surface maps the host name', () => {
  it('renders or serializes a poster name only through the first-name helpers', () => {
    const offenders: string[] = [];
    for (const file of PUBLIC_SURFACES) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      source.split('\n').forEach((line, index) => {
        if (!/poster[?.]*\.name/.test(line)) return;
        if (/firstNameOf|toPublicPlan|toPublicPoster/.test(line)) return;
        offenders.push(`${file}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('hands the plan page client component a mapped plan', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/plan/[slug]/page.tsx'), 'utf8');
    expect(source).toMatch(/toPublicPlan/);
    expect(source).not.toMatch(/initialPlan=\{plan\}/);
  });
});

// The database withholds profiles.name from anon and authenticated, so any
// query that still asks for it on an API-role client would simply fail. This
// keeps the call sites honest without waiting for a runtime error.
const PROFILE_READERS = [
  'src/app/api/plans/route.ts',
  'src/app/api/conversations/route.ts',
  'src/app/api/messages/route.ts',
  'src/app/api/digest/route.ts',
  'src/app/page.tsx',
  'src/app/plan/[slug]/page.tsx',
  'src/app/plan/[slug]/opengraph-image.tsx',
  'src/app/[city]/[hood]/page.tsx',
  'src/app/inbox/[id]/page.tsx',
  'src/app/report/page.tsx'
];

describe('no source path asks profiles for a full name', () => {
  it('reads the first-name projection everywhere a profile name is selected', () => {
    const offenders: string[] = [];
    for (const file of PROFILE_READERS) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      // Track which table the current chain reads, so a `.select('name')` on
      // neighborhoods is not mistaken for a profile read.
      let table = '';
      source.split('\n').forEach((line, index) => {
        const from = line.match(/from\('(\w+)'\)/);
        if (from) table = from[1];
        const embedded = /profiles!?[^)]*\bname\b/.test(line);
        const direct = table === 'profiles' && /select\('[^']*\bname\b/.test(line);
        if (!embedded && !direct) return;
        if (/name:display_name/.test(line)) return;
        offenders.push(`${file}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
