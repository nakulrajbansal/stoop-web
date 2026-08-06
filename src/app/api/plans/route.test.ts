/**
 * Route-level checks for the server side of the clarity contract.
 *
 * Written after the module-level tests in src/lib/plan-contract.test.ts, to
 * verify the thing those cannot: that a client which skips the composer gets a
 * 400 from the API, before anything is written, and that a complete plan
 * carries the new fields all the way into the insert.
 *
 * Supabase is stubbed. Nothing here touches a database or a network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PLAN_WINDOW_DAYS, REFERENCE_DATE_ERROR } from '@/lib/plan-contract';

type Result = { data?: any; count?: number; error?: any };

const calls: { table: string; op: string; args: any[] }[] = [];
let results: Record<string, Result[]> = {};
let currentUser: { id: string } | null = { id: 'user-host' };

// Every builder method returns the builder; awaiting it yields the next queued
// result for that table. Enough to stand in for the query chains this route uses.
function builder(table: string) {
  const proxy: any = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'then') {
          return (resolve: (value: Result) => unknown) =>
            resolve(results[table]?.shift() ?? { data: null });
        }
        return (...args: any[]) => {
          calls.push({ table, op: prop, args });
          return proxy;
        };
      }
    }
  );
  return proxy;
}

const admin = { from: (table: string) => builder(table) };

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: (table: string) => builder(table)
  })
}));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: admin }));
vi.mock('@/lib/moderation', () => ({ isSuspended: async () => false }));
vi.mock('@/lib/blocks', () => ({ getBlockedIds: async () => [] }));
vi.mock('@/lib/indexnow', () => ({ pingIndexNow: async () => {} }));

// Two days out, computed rather than hard coded, so the publication window
// check means the same thing whenever this suite runs.
const IN_WINDOW_DATE = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const IN_WINDOW_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
  new Date(IN_WINDOW_DATE + 'T00:00:00.000Z').getUTCDay()
];

const COMPLETE_BODY = {
  text: 'coffee at Partners on Wythe saturday morning before the market gets busy, come sit',
  category: 'coffee',
  spot: 'Partners Coffee, 125 North 6th Street',
  whenDate: IN_WINDOW_DATE,
  whenDayLabel: IN_WINDOW_DAY,
  whenTime: 'Morning',
  whenTimeSpecific: '9:00 AM',
  costExpectation: 'pay-own-way',
  spots: 2,
  neighborhoodSlug: 'williamsburg',
  intentTags: ['quiet']
};

function post(body: unknown) {
  return new Request('http://localhost/api/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as any;
}

function patch(body: unknown) {
  return new Request('http://localhost/api/plans', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as any;
}

// 8:30pm on 6 August in New York (7:30pm in Austin) is already the 7th in UTC.
// The composer offers the 6th through the 19th; a server counting from UTC
// offered a different fortnight and refused the first chip on the screen.
const NYC_EVENING = new Date('2026-08-07T00:30:00.000Z');
const NYC_TODAY = '2026-08-06';
const chip = (offset: number) => new Date(Date.UTC(2026, 7, 6 + offset)).toISOString().slice(0, 10);

// Only Date is faked. The route awaits promises, and faking the microtask queue
// with them would hang the test rather than test it.
function atNycEvening() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NYC_EVENING);
}

// What the route needs on hand before it will reach the insert.
function readyToInsert() {
  return {
    profiles: [{ data: { city_id: 'city-1', neighborhood_id: 'hood-1', is_founding_member: true } }],
    neighborhoods: [{ data: { id: 'hood-1' } }, { data: { slug: 'williamsburg' } }],
    plans: [{ count: 0 }, { data: null }, { data: { id: 'plan-1', slug: 'coffee-ab12' } }],
    cities: [{ data: { slug: 'nyc' } }]
  };
}

beforeEach(() => {
  calls.length = 0;
  results = {};
  currentUser = { id: 'user-host' };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/plans', () => {
  it('refuses an anonymous post', async () => {
    currentUser = null;
    const { POST } = await import('./route');
    const res = await POST(post(COMPLETE_BODY));
    expect(res.status).toBe(401);
  });

  it('returns 400 when the client is bypassed, naming every missing field', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      post({ ...COMPLETE_BODY, whenTimeSpecific: undefined, spot: undefined, costExpectation: undefined })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.missing).toEqual(['exact time', 'public meeting point', 'cost expectation']);
    // Nothing was written on the way to that answer.
    expect(calls.some(c => c.op === 'insert')).toBe(false);
  });

  it('rejects an invented cost value', async () => {
    const { POST } = await import('./route');
    const res = await POST(post({ ...COMPLETE_BODY, costExpectation: 'donation' }));
    expect(res.status).toBe(400);
    expect((await res.json()).missing).toEqual(['cost expectation']);
    expect(calls.some(c => c.op === 'insert')).toBe(false);
  });

  it('rejects a group size above three joiners', async () => {
    const { POST } = await import('./route');
    const res = await POST(post({ ...COMPLETE_BODY, spots: 4 }));
    expect(res.status).toBe(400);
    expect((await res.json()).missing).toEqual(['group size']);
  });

  it('writes the exact time, meeting point and cost when the plan is complete', async () => {
    results = {
      profiles: [
        { data: { city_id: 'city-1', neighborhood_id: 'hood-1', is_founding_member: true } }
      ],
      neighborhoods: [{ data: { id: 'hood-1' } }, { data: { slug: 'williamsburg' } }],
      plans: [
        { count: 0 }, // weekly rate limit check
        { data: null }, // slug collision check
        { data: { id: 'plan-1', slug: 'coffee-at-partners-ab12' } } // the insert
      ],
      cities: [{ data: { slug: 'nyc' } }]
    };

    const { POST } = await import('./route');
    const res = await POST(post(COMPLETE_BODY));
    expect(res.status).toBe(200);

    const insert = calls.find(c => c.table === 'plans' && c.op === 'insert');
    expect(insert).toBeDefined();
    expect(insert!.args[0]).toMatchObject({
      spot: 'Partners Coffee, 125 North 6th Street',
      when_time_specific: '9:00 AM',
      cost_expectation: 'pay-own-way',
      spots_total: 2,
      spots_left: 2
    });
  });
});

describe('PATCH /api/plans', () => {
  it('makes a legacy plan meet the contract before it can be saved again', async () => {
    results = { plans: [{ data: { user_id: 'user-host', spots_total: 2, cost_expectation: null } }] };
    const { PATCH } = await import('./route');
    const res = await PATCH(
      patch({
        planId: 'plan-1',
        text: COMPLETE_BODY.text,
        whenDate: COMPLETE_BODY.whenDate,
        whenDayLabel: IN_WINDOW_DAY
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).missing).toEqual(['exact time', 'public meeting point', 'cost expectation']);
    expect(calls.some(c => c.op === 'update')).toBe(false);
  });

  it('refuses to edit a plan that is not yours, before validating anything', async () => {
    results = { plans: [{ data: { user_id: 'someone-else', spots_total: 2, cost_expectation: null } }] };
    const { PATCH } = await import('./route');
    const res = await PATCH(patch({ planId: 'plan-1', ...COMPLETE_BODY }));
    expect(res.status).toBe(403);
    expect(calls.some(c => c.op === 'update')).toBe(false);
  });
});

describe('the API enforces the same date and time rules as the composer', () => {
  it('refuses a vague time even though it is not empty', async () => {
    const { POST } = await import('./route');
    for (const vague of ['sometime', 'morning', 'ish']) {
      const res = await POST(post({ ...COMPLETE_BODY, whenTimeSpecific: vague }));
      expect(res.status, vague).toBe(400);
      expect((await res.json()).missing, vague).toEqual(['exact time']);
    }
    expect(calls.some(c => c.op === 'insert')).toBe(false);
  });

  it('refuses a date that never existed', async () => {
    const { POST } = await import('./route');
    const res = await POST(post({ ...COMPLETE_BODY, whenDate: '2026-02-30' }));
    expect(res.status).toBe(400);
    expect((await res.json()).missing).toEqual(['date']);
  });

  it('refuses a date outside the window the chips offer', async () => {
    const { POST } = await import('./route');
    const farOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const longGone = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const date of [farOut, longGone]) {
      const res = await POST(post({ ...COMPLETE_BODY, whenDate: date }));
      expect(res.status, date).toBe(400);
      expect((await res.json()).missing, date).toEqual(['date']);
    }
    expect(calls.some(c => c.op === 'insert')).toBe(false);
  });

  it('writes a day label that matches the date it stored', async () => {
    results = {
      profiles: [{ data: { city_id: 'city-1', neighborhood_id: 'hood-1', is_founding_member: true } }],
      neighborhoods: [{ data: { id: 'hood-1' } }, { data: { slug: 'williamsburg' } }],
      plans: [{ count: 0 }, { data: null }, { data: { id: 'plan-1', slug: 'coffee-ab12' } }],
      cities: [{ data: { slug: 'nyc' } }]
    };
    const { POST } = await import('./route');
    // A label left over from a different day, the way a stale client would send it.
    await POST(post({ ...COMPLETE_BODY, whenDayLabel: 'Monday' }));

    const insert = calls.find(c => c.table === 'plans' && c.op === 'insert');
    expect(insert!.args[0].when_date).toBe(IN_WINDOW_DATE);
    expect(['Today', 'Tomorrow', IN_WINDOW_DAY]).toContain(insert!.args[0].when_day);
  });
});

describe('PATCH keeps the day label and the date together', () => {
  it('replaces a stale label when the edit moves the date', async () => {
    results = { plans: [{ data: { user_id: 'user-host', spots_total: 2, cost_expectation: 'free' } }] };
    const { PATCH } = await import('./route');
    const res = await PATCH(
      patch({ planId: 'plan-1', ...COMPLETE_BODY, whenDayLabel: 'Monday' })
    );
    expect(res.status).toBe(200);

    const update = calls.find(c => c.table === 'plans' && c.op === 'update');
    expect(update!.args[0].when_date).toBe(IN_WINDOW_DATE);
    expect(update!.args[0].when_day).not.toBe('Monday');
    expect(['Today', 'Tomorrow', IN_WINDOW_DAY]).toContain(update!.args[0].when_day);
  });

  it('refuses an edit that moves the date outside the window', async () => {
    results = { plans: [{ data: { user_id: 'user-host', spots_total: 2, cost_expectation: 'free' } }] };
    const { PATCH } = await import('./route');
    const res = await PATCH(
      patch({
        planId: 'plan-1',
        ...COMPLETE_BODY,
        whenDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      })
    );
    expect(res.status).toBe(400);
    expect(calls.some(c => c.op === 'update')).toBe(false);
  });
});

describe('POST counts the window from the visitor day', () => {
  const evening = (extra: Record<string, unknown>) => ({
    ...COMPLETE_BODY,
    clientToday: NYC_TODAY,
    whenDate: NYC_TODAY,
    whenDayLabel: 'Today',
    ...extra
  });

  it('takes the "Today" chip a New York host is looking at after 8pm', async () => {
    atNycEvening();
    results = readyToInsert();
    const { POST } = await import('./route');
    const res = await POST(post(evening({})));
    expect(res.status).toBe(200);

    const insert = calls.find(c => c.table === 'plans' && c.op === 'insert');
    expect(insert!.args[0].when_date).toBe(NYC_TODAY);
    expect(insert!.args[0].when_day).toBe('Today');
  });

  it('takes both ends of that fortnight and refuses the day outside each', async () => {
    atNycEvening();
    const { POST } = await import('./route');

    for (const offset of [0, PLAN_WINDOW_DAYS - 1]) {
      calls.length = 0;
      results = readyToInsert();
      const res = await POST(post(evening({ whenDate: chip(offset), whenDayLabel: '' })));
      expect(res.status, chip(offset)).toBe(200);
    }

    // chip(-1) is yesterday where the host is. chip(14) is the day UTC would
    // have allowed and no chip ever offered.
    for (const offset of [-1, PLAN_WINDOW_DAYS]) {
      calls.length = 0;
      results = readyToInsert();
      const res = await POST(post(evening({ whenDate: chip(offset), whenDayLabel: '' })));
      expect(res.status, chip(offset)).toBe(400);
      expect((await res.json()).missing, chip(offset)).toEqual(['date']);
      expect(calls.some(c => c.op === 'insert'), chip(offset)).toBe(false);
    }
  });

  it('refuses a reference date the client cannot honestly be on', async () => {
    atNycEvening();
    const { POST } = await import('./route');
    const forged = [
      // Malformed: not a calendar date at all, however it is dressed up.
      'today',
      '',
      '2026-8-6',
      '2026-02-30',
      '2026-08-06T00:00:00Z',
      20260806,
      // Drifted: one day is a timezone, more is a claim about the calendar.
      '2026-08-05',
      '2026-08-09',
      '2020-01-01',
      '2030-06-01'
    ];
    for (const clientToday of forged) {
      calls.length = 0;
      results = readyToInsert();
      // The plan itself is in the UTC fortnight, so the only thing wrong with
      // this request is the day it claims to be sent from.
      const res = await POST(
        post({ ...COMPLETE_BODY, clientToday, whenDate: '2026-08-08', whenDayLabel: '' })
      );
      expect(res.status, String(clientToday)).toBe(400);
      expect((await res.json()).error, String(clientToday)).toBe(REFERENCE_DATE_ERROR);
      // The old behaviour dropped the bad value, counted from UTC and posted
      // this plan happily. Nothing reaches the database now.
      expect(calls.some(c => c.op === 'insert'), String(clientToday)).toBe(false);
    }
  });

  it('falls back to the server day when no reference date is sent at all', async () => {
    atNycEvening();
    results = readyToInsert();
    const { POST } = await import('./route');
    // An older client, or one that stripped the field. The UTC fortnight is
    // what is left, and it is still enforced.
    const res = await POST(post({ ...COMPLETE_BODY, whenDate: '2026-08-07', whenDayLabel: '' }));
    expect(res.status).toBe(200);
    expect(calls.find(c => c.op === 'insert')!.args[0].when_date).toBe('2026-08-07');

    calls.length = 0;
    const past = await POST(post({ ...COMPLETE_BODY, whenDate: NYC_TODAY, whenDayLabel: '' }));
    expect(past.status).toBe(400);
    expect(calls.some(c => c.op === 'insert')).toBe(false);

    // Explicit null is how JSON says the field is absent, and it is read that
    // way: the UTC day, not a rejection and not a window of the client's own.
    calls.length = 0;
    results = readyToInsert();
    const nulled = await POST(
      post({ ...COMPLETE_BODY, clientToday: null, whenDate: '2026-08-07', whenDayLabel: '' })
    );
    expect(nulled.status).toBe(200);
    expect(calls.find(c => c.op === 'insert')!.args[0].when_date).toBe('2026-08-07');
  });

  it('drops a day label the visitor day does not make true', async () => {
    atNycEvening();
    results = readyToInsert();
    const { POST } = await import('./route');
    // The 8th is a Saturday, sent with copy from a day it is not on.
    const res = await POST(post(evening({ whenDate: '2026-08-08', whenDayLabel: 'Today' })));
    expect(res.status).toBe(200);
    expect(calls.find(c => c.op === 'insert')!.args[0].when_day).toBe('Saturday');
  });
});

describe('PATCH counts the window the same way POST does', () => {
  const owned = () => ({
    plans: [{ data: { user_id: 'user-host', spots_total: 2, cost_expectation: 'free' } }]
  });

  it('takes the "Today" chip on an edit made after 8pm in New York', async () => {
    atNycEvening();
    results = owned();
    const { PATCH } = await import('./route');
    const res = await PATCH(
      patch({ planId: 'plan-1', ...COMPLETE_BODY, clientToday: NYC_TODAY, whenDate: NYC_TODAY, whenDayLabel: 'Today' })
    );
    expect(res.status).toBe(200);

    const update = calls.find(c => c.table === 'plans' && c.op === 'update');
    expect(update!.args[0].when_date).toBe(NYC_TODAY);
    expect(update!.args[0].when_day).toBe('Today');
  });

  it('refuses the day on either side of that fortnight, like POST', async () => {
    atNycEvening();
    const { PATCH } = await import('./route');
    const attempts = [
      { clientToday: NYC_TODAY, whenDate: chip(PLAN_WINDOW_DAYS) },
      { clientToday: NYC_TODAY, whenDate: chip(-1) }
    ];
    for (const attempt of attempts) {
      calls.length = 0;
      results = owned();
      const res = await PATCH(patch({ planId: 'plan-1', ...COMPLETE_BODY, ...attempt, whenDayLabel: '' }));
      expect(res.status, attempt.whenDate).toBe(400);
      expect((await res.json()).missing, attempt.whenDate).toEqual(['date']);
      expect(calls.some(c => c.op === 'update'), attempt.whenDate).toBe(false);
    }
  });

  it('refuses a reference date the client cannot honestly be on, like POST', async () => {
    atNycEvening();
    const { PATCH } = await import('./route');
    const forged = ['today', '', '2026-8-6', '2026-02-30', 20260806, '2026-08-05', '2026-08-09', '2020-01-01'];
    for (const clientToday of forged) {
      calls.length = 0;
      results = owned();
      // The plan is the owner's and sits in the UTC fortnight. The claimed day
      // is the only problem, and it stops the edit rather than being dropped.
      const res = await PATCH(
        patch({ planId: 'plan-1', ...COMPLETE_BODY, clientToday, whenDate: '2026-08-08', whenDayLabel: '' })
      );
      expect(res.status, String(clientToday)).toBe(400);
      expect((await res.json()).error, String(clientToday)).toBe(REFERENCE_DATE_ERROR);
      expect(calls.some(c => c.op === 'update'), String(clientToday)).toBe(false);
    }
  });

  it('still counts from UTC on an edit that sends no reference date', async () => {
    atNycEvening();
    results = owned();
    const { PATCH } = await import('./route');
    const res = await PATCH(
      patch({ planId: 'plan-1', ...COMPLETE_BODY, whenDate: '2026-08-07', whenDayLabel: '' })
    );
    expect(res.status).toBe(200);
    expect(calls.find(c => c.op === 'update')!.args[0].when_date).toBe('2026-08-07');

    // The UTC fortnight is still enforced: the visitor's own day is behind it.
    calls.length = 0;
    results = owned();
    const past = await PATCH(
      patch({ planId: 'plan-1', ...COMPLETE_BODY, whenDate: NYC_TODAY, whenDayLabel: '' })
    );
    expect(past.status).toBe(400);
    expect(calls.some(c => c.op === 'update')).toBe(false);
  });

  it('replaces a label from a day the edited plan is no longer on', async () => {
    atNycEvening();
    results = owned();
    const { PATCH } = await import('./route');
    const res = await PATCH(
      patch({ planId: 'plan-1', ...COMPLETE_BODY, clientToday: NYC_TODAY, whenDate: '2026-08-08', whenDayLabel: 'Today' })
    );
    expect(res.status).toBe(200);
    expect(calls.find(c => c.op === 'update')!.args[0].when_day).toBe('Saturday');
  });
});
