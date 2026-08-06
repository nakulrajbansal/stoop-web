import { describe, it, expect } from 'vitest';
import {
  COST_EXPECTATIONS,
  COST_EXPECTATION_LABELS,
  COST_EXPECTATION_HINTS,
  MEETING_POINT_GUIDANCE,
  PLAN_VISIBILITY_NOTE,
  isCostExpectation,
  validatePlanContract,
  planContractIssues,
  parsePlanContractBody,
  planMeetsContract,
  planSummaryRows,
  formatTimeOfDay,
  timeBandFor,
  costExpectationLabel,
  isClockTime,
  isRealCalendarDate,
  resolveDayLabel,
  localCalendarDate,
  resolveReferenceDate,
  parseReferenceDate,
  REFERENCE_DATE_ERROR,
  PLAN_WINDOW_DAYS
} from './plan-contract';

// A fixed "today" so the publication window means the same thing every run.
// Every fixture below is dated against this, never against the real clock: a
// suite that passes only in the fortnight after it was written is a suite that
// will fail on a morning when nothing is actually wrong.
const TODAY = new Date('2026-08-06T12:00:00.000Z');

const COMPLETE = {
  text: 'coffee at Partners on Wythe saturday morning before the market gets busy, come sit',
  whenDate: '2026-08-08',
  whenTimeSpecific: '9:00 AM',
  spot: 'Partners Coffee, 125 North 6th Street',
  spots: 2,
  costExpectation: 'pay-own-way'
};

const AT = { today: TODAY };

describe('cost expectation', () => {
  it('offers exactly the three settled values', () => {
    expect([...COST_EXPECTATIONS]).toEqual(['free', 'pay-own-way', 'ticket-required']);
  });

  it('narrows unknown values', () => {
    expect(isCostExpectation('free')).toBe(true);
    expect(isCostExpectation('paid')).toBe(false);
    expect(isCostExpectation(null)).toBe(false);
  });

  it('labels every value and says a ticket is separate', () => {
    for (const value of COST_EXPECTATIONS) {
      expect(COST_EXPECTATION_LABELS[value].length).toBeGreaterThan(0);
      expect(COST_EXPECTATION_HINTS[value].length).toBeGreaterThan(0);
    }
    expect(COST_EXPECTATION_HINTS['ticket-required']).toMatch(/separate/i);
    expect(COST_EXPECTATION_HINTS['ticket-required']).toMatch(/Stoop does not/i);
    expect(costExpectationLabel('free')).toBe(COST_EXPECTATION_LABELS.free);
    expect(costExpectationLabel('nonsense')).toBe('');
  });
});

describe('validatePlanContract', () => {
  it('accepts a complete pay-own-way coffee plan', () => {
    expect(validatePlanContract(COMPLETE, AT)).toEqual([]);
  });

  it('accepts a complete free plan', () => {
    expect(validatePlanContract({ ...COMPLETE, costExpectation: 'free' }, AT)).toEqual([]);
  });

  it('accepts a complete ticket-required plan', () => {
    expect(validatePlanContract({ ...COMPLETE, costExpectation: 'ticket-required' }, AT)).toEqual([]);
  });

  it('rejects a plan with no exact time', () => {
    expect(validatePlanContract({ ...COMPLETE, whenTimeSpecific: '   ' }, AT)).toEqual(['exact time']);
  });

  it('rejects a plan with no public meeting point', () => {
    expect(validatePlanContract({ ...COMPLETE, spot: '' }, AT)).toEqual(['public meeting point']);
  });

  it('rejects a plan with no cost expectation', () => {
    expect(validatePlanContract({ ...COMPLETE, costExpectation: '' }, AT)).toEqual(['cost expectation']);
    expect(validatePlanContract({ ...COMPLETE, costExpectation: 'paid' }, AT)).toEqual(['cost expectation']);
  });

  it('rejects short activity text, a bad date and an out of range group size', () => {
    expect(validatePlanContract({ ...COMPLETE, text: 'coffee' }, AT)).toEqual(['plan']);
    expect(validatePlanContract({ ...COMPLETE, whenDate: '8/8/2026' }, AT)).toEqual(['date']);
    expect(validatePlanContract({ ...COMPLETE, spots: 4 }, AT)).toEqual(['group size']);
    expect(validatePlanContract({ ...COMPLETE, spots: 0 }, AT)).toEqual(['group size']);
  });

  it('names every missing field at once, in composer order', () => {
    expect(
      validatePlanContract(
        { text: '', whenDate: '', whenTimeSpecific: '', spot: '', spots: 0, costExpectation: '' },
        AT
      )
    ).toEqual(['plan', 'date', 'exact time', 'public meeting point', 'group size', 'cost expectation']);
  });

  it('reports issues with a field id so the UI can focus the first one', () => {
    const issues = planContractIssues({ ...COMPLETE, whenTimeSpecific: '', costExpectation: '' }, AT);
    expect(issues.map(i => i.field)).toEqual(['time', 'cost']);
    expect(issues[0].label).toBe('exact time');
  });
});

describe('parsePlanContractBody (server side)', () => {
  it('normalizes a good body', () => {
    const parsed = parsePlanContractBody({ ...COMPLETE, spot: '  Domino Park main entrance  ' }, AT);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.spot).toBe('Domino Park main entrance');
      expect(parsed.value.costExpectation).toBe('pay-own-way');
      expect(parsed.value.whenTimeSpecific).toBe('9:00 AM');
    }
  });

  it('refuses a body that skipped the client, naming the missing fields', () => {
    const parsed = parsePlanContractBody(
      { ...COMPLETE, whenTimeSpecific: undefined, costExpectation: undefined },
      AT
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.missing).toEqual(['exact time', 'cost expectation']);
      expect(parsed.error).toMatch(/exact time/);
    }
  });

  it('refuses junk types and over-long values instead of coercing them', () => {
    expect(parsePlanContractBody(null, AT).ok).toBe(false);
    expect(parsePlanContractBody({ ...COMPLETE, spots: '2' }, AT).ok).toBe(false);
    expect(parsePlanContractBody({ ...COMPLETE, spot: 'x'.repeat(200) }, AT).ok).toBe(false);
    expect(parsePlanContractBody({ ...COMPLETE, whenTimeSpecific: 'x'.repeat(60) }, AT).ok).toBe(false);
  });
});

describe('planMeetsContract (legacy plans stay readable)', () => {
  it('is true for a row carrying every required field', () => {
    expect(
      planMeetsContract({
        text: COMPLETE.text,
        when_date: '2026-08-08',
        when_time_specific: '9:00 AM',
        spot: 'Partners Coffee',
        spots_total: 2,
        cost_expectation: 'free'
      })
    ).toBe(true);
  });

  it('is false for a legacy row with no time, spot or cost, without throwing', () => {
    expect(
      planMeetsContract({
        text: COMPLETE.text,
        when_date: '2026-08-08',
        when_time_specific: null,
        spot: null,
        spots_total: 2,
        cost_expectation: null
      })
    ).toBe(false);
  });
});

describe('publish summary', () => {
  it('shows what another person will see, including the visibility statement', () => {
    const rows = planSummaryRows({
      ...COMPLETE,
      dayLabel: 'Saturday',
      neighborhoodName: 'Williamsburg',
      intentTags: ['quiet']
    });
    const labels = rows.map(r => r.label);
    expect(labels).toEqual(['What', 'When', 'Where', 'Cost', 'Spots', 'Expectations', 'Who sees this']);
    expect(rows[1].value).toBe('Saturday, 9:00 AM');
    expect(rows[2].value).toBe('Partners Coffee, 125 North 6th Street, Williamsburg');
    expect(rows[3].value).toBe('Pay your own way');
    expect(rows[4].value).toBe('2 spots open');
    expect(rows[6].value).toBe(PLAN_VISIBILITY_NOTE);
  });

  it('drops the expectations row when no tags are picked and says one spot in singular', () => {
    const rows = planSummaryRows({
      ...COMPLETE,
      spots: 1,
      dayLabel: 'Saturday',
      neighborhoodName: 'Williamsburg',
      intentTags: []
    });
    expect(rows.map(r => r.label)).toEqual(['What', 'When', 'Where', 'Cost', 'Spots', 'Who sees this']);
    expect(rows.find(r => r.label === 'Spots')?.value).toBe('1 spot open');
  });
});

describe('time helpers', () => {
  it('formats a 24 hour input into the display string the plan stores', () => {
    expect(formatTimeOfDay('09:00')).toBe('9:00 AM');
    expect(formatTimeOfDay('14:30')).toBe('2:30 PM');
    expect(formatTimeOfDay('00:05')).toBe('12:05 AM');
    expect(formatTimeOfDay('12:00')).toBe('12:00 PM');
  });

  it('returns null rather than guessing at an unusable time', () => {
    expect(formatTimeOfDay('')).toBeNull();
    expect(formatTimeOfDay('25:00')).toBeNull();
    expect(formatTimeOfDay('9am')).toBeNull();
  });

  it('derives the rough band the older surfaces still read', () => {
    expect(timeBandFor('07:30')).toBe('Morning');
    expect(timeBandFor('13:00')).toBe('Afternoon');
    expect(timeBandFor('18:45')).toBe('Evening');
    expect(timeBandFor('22:10')).toBe('Night');
    expect(timeBandFor('nope')).toBeNull();
  });
});

describe('meeting point guidance', () => {
  it('tells hosts to use a public place and never a home address', () => {
    expect(MEETING_POINT_GUIDANCE).toMatch(/public/i);
    expect(MEETING_POINT_GUIDANCE).toMatch(/home address/i);
    expect(MEETING_POINT_GUIDANCE).not.toMatch(/\u2014/);
  });
});

const IN_WINDOW = { ...COMPLETE, whenDate: '2026-08-08' };

describe('the exact time is an actual clock time', () => {
  it('accepts the display format the composer produces', () => {
    for (const time of ['9:00 AM', '12:05 AM', '2:30 PM', '11:59 PM']) {
      expect(validatePlanContract({ ...IN_WINDOW, whenTimeSpecific: time }, { today: TODAY })).toEqual([]);
    }
  });

  it('rejects vague text that merely happens to be non-empty', () => {
    for (const vague of ['sometime', 'morning', 'ish 9', '9', '25:00 AM', '13:00 PM', '9:60 AM', 'later']) {
      expect(
        validatePlanContract({ ...IN_WINDOW, whenTimeSpecific: vague }, { today: TODAY }),
        vague
      ).toEqual(['exact time']);
    }
  });

  it('is the same check the composer runs, so the client cannot pass what the server refuses', () => {
    expect(isClockTime('9:00 AM')).toBe(true);
    expect(isClockTime('sometime')).toBe(false);
    expect(isClockTime(formatTimeOfDay('14:30') ?? '')).toBe(true);
  });
});

describe('the date is a real day, inside the window the chips offer', () => {
  it('rejects a date that never existed', () => {
    for (const impossible of ['2026-02-30', '2026-13-01', '2026-04-31', '2027-00-10']) {
      expect(validatePlanContract({ ...IN_WINDOW, whenDate: impossible }, { today: TODAY }), impossible).toEqual(['date']);
    }
  });

  it('rejects a date outside the publication window in either direction', () => {
    expect(validatePlanContract({ ...IN_WINDOW, whenDate: '2026-07-20' }, { today: TODAY })).toEqual(['date']);
    expect(validatePlanContract({ ...IN_WINDOW, whenDate: '2027-01-01' }, { today: TODAY })).toEqual(['date']);
  });

  it('accepts every day the composer chips offer', () => {
    for (let i = 0; i < PLAN_WINDOW_DAYS; i++) {
      const d = new Date(Date.UTC(2026, 7, 6 + i));
      const iso = d.toISOString().slice(0, 10);
      expect(validatePlanContract({ ...IN_WINDOW, whenDate: iso }, { today: TODAY }), iso).toEqual([]);
    }
  });

  it('takes day 0 through day 13 and refuses the day on either side of them', () => {
    // getDateChips offers offsets 0 through PLAN_WINDOW_DAYS - 1 from today, so
    // those are the only days that exist. The window used to run from yesterday
    // to day 14, which accepted two dates no chip could produce.
    const check = (iso: string) => validatePlanContract({ ...IN_WINDOW, whenDate: iso }, { today: TODAY });
    expect(check('2026-08-05'), 'yesterday').toEqual(['date']);
    expect(check('2026-08-06'), 'today, the first chip').toEqual([]);
    expect(check('2026-08-19'), 'day 13, the last chip').toEqual([]);
    expect(check('2026-08-20'), 'day 14, one past the last chip').toEqual(['date']);
  });
});

describe('the window is counted from the visitor day, not from UTC', () => {
  // 8:30pm on 6 August in New York is already the 7th in UTC, and Austin
  // crosses at the same instant. Both are launch cities, so an evening post is
  // the ordinary case: counting from UTC refused the "Today" chip the composer
  // had just offered, and the host could not publish at all.
  const NYC_EVENING = new Date('2026-08-07T00:30:00.000Z');
  const NYC_TODAY = '2026-08-06';
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const chip = (offset: number) => day(new Date(Date.UTC(2026, 7, 6 + offset)));

  it('accepts exactly the fourteen dates the chips offered that evening', () => {
    const today = resolveReferenceDate(NYC_TODAY, NYC_EVENING);
    for (let i = 0; i < PLAN_WINDOW_DAYS; i++) {
      expect(validatePlanContract({ ...COMPLETE, whenDate: chip(i) }, { today }), chip(i)).toEqual([]);
    }
    // The first of them is the visitor's own day, which UTC has already left.
    expect(chip(0)).toBe(NYC_TODAY);
  });

  it('still refuses the day on either side of that fortnight', () => {
    const today = resolveReferenceDate(NYC_TODAY, NYC_EVENING);
    const check = (iso: string) => validatePlanContract({ ...COMPLETE, whenDate: iso }, { today });
    expect(check(chip(-1)), 'yesterday where the visitor is').toEqual(['date']);
    expect(check(chip(PLAN_WINDOW_DAYS)), 'one past the last chip').toEqual(['date']);
  });

  it('allows the one day a timezone explains, and not two', () => {
    expect(day(resolveReferenceDate('2026-08-06', NYC_EVENING)), 'a day behind UTC').toBe('2026-08-06');
    expect(day(resolveReferenceDate('2026-08-07', NYC_EVENING)), 'the UTC day itself').toBe('2026-08-07');
    expect(day(resolveReferenceDate('2026-08-08', NYC_EVENING)), 'a day ahead of UTC').toBe('2026-08-08');
    expect(resolveReferenceDate('2026-08-05', NYC_EVENING), 'two days behind').toBe(NYC_EVENING);
    expect(resolveReferenceDate('2026-08-09', NYC_EVENING), 'two days ahead').toBe(NYC_EVENING);
  });

  it('ignores a reference date that is not a real date, rather than trusting it', () => {
    for (const junk of [undefined, null, '', 'today', '2026-8-6', '2026-02-30', '2026-08-06T00:00:00Z', 20260806, {}]) {
      expect(resolveReferenceDate(junk, NYC_EVENING), String(junk)).toBe(NYC_EVENING);
    }
  });

  it('gives a forged reference date no window of its own', () => {
    // The forgery is only worth anything if the server counts from it, so the
    // far-past and far-future dates fall back to the server day and the plan
    // they were sent to smuggle in is refused with them.
    const past = resolveReferenceDate('2020-01-01', NYC_EVENING);
    expect(past).toBe(NYC_EVENING);
    expect(validatePlanContract({ ...COMPLETE, whenDate: '2020-01-03' }, { today: past })).toEqual(['date']);

    const future = resolveReferenceDate('2030-06-01', NYC_EVENING);
    expect(future).toBe(NYC_EVENING);
    expect(validatePlanContract({ ...COMPLETE, whenDate: '2030-06-03' }, { today: future })).toEqual(['date']);

    // What is left is the server's own fortnight, unmoved.
    expect(validatePlanContract({ ...COMPLETE, whenDate: '2026-08-07' }, { today: past })).toEqual([]);
    expect(validatePlanContract({ ...COMPLETE, whenDate: '2026-08-20' }, { today: past })).toEqual([]);
    expect(validatePlanContract({ ...COMPLETE, whenDate: '2026-08-21' }, { today: past })).toEqual(['date']);
  });
});

describe('parseReferenceDate (the claim the server actually judges)', () => {
  // The same half past midnight UTC: evening of the 6th in both launch cities.
  const NOW = new Date('2026-08-07T00:30:00.000Z');

  it('counts from UTC when the client says nothing, so an older client still posts', () => {
    // Absent, and the JSON way of saying absent. Neither buys anything: UTC is
    // the server's own day.
    for (const absent of [undefined, null]) {
      const parsed = parseReferenceDate(absent, NOW);
      expect(parsed.ok, String(absent)).toBe(true);
      if (parsed.ok) expect(parsed.today, String(absent)).toBe(NOW);
    }
  });

  it('takes the one day of drift a timezone explains', () => {
    for (const day of ['2026-08-06', '2026-08-07', '2026-08-08']) {
      const parsed = parseReferenceDate(day, NOW);
      expect(parsed.ok, day).toBe(true);
      if (parsed.ok) expect(parsed.today.toISOString().slice(0, 10), day).toBe(day);
    }
  });

  it('refuses a malformed day rather than ignoring it', () => {
    for (const junk of ['', 'today', '2026-8-6', '2026-02-30', '2026-08-06T00:00:00Z', 20260806, {}, true]) {
      const parsed = parseReferenceDate(junk, NOW);
      expect(parsed.ok, String(junk)).toBe(false);
      if (!parsed.ok) expect(parsed.error, String(junk)).toBe(REFERENCE_DATE_ERROR);
    }
  });

  it('refuses a day no timezone could put the visitor on', () => {
    for (const far of ['2026-08-05', '2026-08-09', '2020-01-01', '2030-06-01']) {
      expect(parseReferenceDate(far, NOW).ok, far).toBe(false);
    }
  });

  it('judges exactly what the client form judges, and answers instead of shrugging', () => {
    // The client passes its own clock to both arguments, so it never reaches a
    // rejection. The two only part company on what happens once one is reached.
    expect(resolveReferenceDate('2020-01-01', NOW)).toBe(NOW);
    expect(parseReferenceDate('2020-01-01', NOW).ok).toBe(false);
  });
});

describe('localCalendarDate (the day the composer counted from)', () => {
  // Restoring an IANA name rather than deleting the variable, so the worker is
  // left on a real zone whatever it started on.
  const SYSTEM_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  function inZone<T>(tz: string, run: () => T): T {
    const previous = process.env.TZ;
    process.env.TZ = tz;
    try {
      return run();
    } finally {
      process.env.TZ = previous ?? SYSTEM_TZ;
    }
  }

  // Half past midnight UTC: evening of the 6th in both launch cities.
  const INSTANT = '2026-08-07T00:30:00.000Z';

  it('reads the day in the visitor timezone, not in UTC', () => {
    expect(inZone('America/New_York', () => localCalendarDate(new Date(INSTANT)))).toBe('2026-08-06');
    expect(inZone('America/Chicago', () => localCalendarDate(new Date(INSTANT)))).toBe('2026-08-06');
    expect(inZone('UTC', () => localCalendarDate(new Date(INSTANT)))).toBe('2026-08-07');
    expect(inZone('Asia/Tokyo', () => localCalendarDate(new Date(INSTANT)))).toBe('2026-08-07');
  });

  it('pads month and day so the result is a parseable calendar date', () => {
    const early = inZone('America/New_York', () => localCalendarDate(new Date('2026-01-09T17:00:00.000Z')));
    expect(early).toBe('2026-01-09');
    expect(isRealCalendarDate(early)).toBe(true);
  });

  it('always produces a day the server will accept, whatever the timezone', () => {
    // The client-side check and the server-side check only agree if the day the
    // browser sends survives resolveReferenceDate. UTC+14 through UTC-11.
    for (const tz of ['Pacific/Kiritimati', 'Asia/Tokyo', 'UTC', 'America/New_York', 'America/Chicago', 'Pacific/Midway']) {
      const sent = inZone(tz, () => localCalendarDate(new Date(INSTANT)));
      expect(resolveReferenceDate(sent, new Date(INSTANT)).toISOString().slice(0, 10), tz).toBe(sent);
    }
  });
});

describe('the public day label cannot contradict the date', () => {
  it('keeps a label the client computed in its own timezone', () => {
    expect(resolveDayLabel('2026-08-08', 'Saturday', TODAY)).toBe('Saturday');
    expect(resolveDayLabel('2026-08-07', 'Tomorrow', TODAY)).toBe('Tomorrow');
  });

  it('replaces a label that belongs to a different day', () => {
    // Stale label left over from an edit that moved the date.
    expect(resolveDayLabel('2026-08-12', 'Saturday', TODAY)).toBe('Wednesday');
    expect(resolveDayLabel('2026-08-12', 'Today', TODAY)).toBe('Wednesday');
  });

  it('derives one when the client sent nothing at all', () => {
    expect(resolveDayLabel('2026-08-12', '', TODAY)).toBe('Wednesday');
    expect(resolveDayLabel('2026-08-12', null, TODAY)).toBe('Wednesday');
  });

  it('replaces a neighbouring weekday, which a one day edit used to leave behind', () => {
    // 2026-08-12 is a Wednesday, and it is a Wednesday in every timezone. Moving
    // a plan from Tuesday the 11th to Wednesday the 12th once kept the word
    // "Tuesday", because a neighbouring weekday was allowed as timezone slack.
    expect(resolveDayLabel('2026-08-12', 'Tuesday', TODAY)).toBe('Wednesday');
    expect(resolveDayLabel('2026-08-12', 'Thursday', TODAY)).toBe('Wednesday');
    // The weekday the date actually has still survives, in both its forms.
    expect(resolveDayLabel('2026-08-12', 'Wednesday', TODAY)).toBe('Wednesday');
    expect(resolveDayLabel('2026-08-19', 'Next Wednesday', TODAY)).toBe('Next Wednesday');
  });

  it('keeps an honest Today and an honest Tomorrow', () => {
    // The reference day is 2026-08-06, so these are the only two dates the two
    // relative words can be true of.
    expect(resolveDayLabel('2026-08-06', 'Today', TODAY)).toBe('Today');
    expect(resolveDayLabel('2026-08-07', 'Tomorrow', TODAY)).toBe('Tomorrow');
  });

  it('replaces a stale Tomorrow on a plan an edit moved to today', () => {
    // The plan was tomorrow, the host pulled it forward to today, and the old
    // word travelled with it. It used to survive, so the page said "Tomorrow"
    // above a plan happening in four hours.
    expect(resolveDayLabel('2026-08-06', 'Tomorrow', TODAY)).toBe('Today');
  });

  it('replaces a stale Tomorrow on a plan an edit moved a day further out', () => {
    // Pushed the other way, to the day after tomorrow. 2026-08-08 is a Saturday
    // and nothing about it is "Tomorrow".
    expect(resolveDayLabel('2026-08-08', 'Tomorrow', TODAY)).toBe('Saturday');
  });

  it('replaces a stale Today on any day but the reference day', () => {
    expect(resolveDayLabel('2026-08-07', 'Today', TODAY)).toBe('Tomorrow');
    expect(resolveDayLabel('2026-08-08', 'Today', TODAY)).toBe('Saturday');
    expect(resolveDayLabel('2026-08-09', 'Tomorrow', TODAY)).toBe('Sunday');
  });

  it('reads a stale label the same way when it counts from the visitor day', () => {
    // NYC evening again: the visitor's day is the 6th, the server clock says
    // the 7th. Counting from the visitor's day is what makes "Today" true, and
    // it does not soften what happens to copy from a day the plan is not on.
    const nycToday = resolveReferenceDate('2026-08-06', new Date('2026-08-07T00:30:00.000Z'));
    expect(resolveDayLabel('2026-08-06', 'Today', nycToday)).toBe('Today');
    expect(resolveDayLabel('2026-08-07', 'Tomorrow', nycToday)).toBe('Tomorrow');
    // The date moved and the old copy came along. The date wins, both ways.
    expect(resolveDayLabel('2026-08-08', 'Today', nycToday)).toBe('Saturday');
    expect(resolveDayLabel('2026-08-15', 'Tomorrow', nycToday)).toBe('Saturday');
    expect(resolveDayLabel('2026-08-12', 'Tuesday', nycToday)).toBe('Wednesday');
  });
});
