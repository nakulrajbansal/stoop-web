/**
 * The minimum clarity contract every new plan has to meet.
 *
 * A visitor should not have to guess what "let's meet" means. Six facts make a
 * plan evaluable before anyone signs up: what it is, which day, the exact time,
 * a public meeting point, how many can join, and whether money is involved.
 *
 * Pure functions only, so the composer, the editor and the API route all judge
 * a plan the same way. Client-side checks alone are not enforcement: the route
 * runs parsePlanContractBody on whatever actually arrives.
 *
 * Plans published before this contract existed stay readable. They simply fail
 * planMeetsContract, which is what the editor uses to ask for the missing
 * pieces before a legacy plan can be saved again.
 */

export const COST_EXPECTATIONS = ['free', 'pay-own-way', 'ticket-required'] as const;
export type CostExpectation = (typeof COST_EXPECTATIONS)[number];

export const COST_EXPECTATION_LABELS: Record<CostExpectation, string> = {
  free: 'Free',
  'pay-own-way': 'Pay your own way',
  'ticket-required': 'Ticket required'
};

export const COST_EXPECTATION_HINTS: Record<CostExpectation, string> = {
  free: 'No purchase required.',
  'pay-own-way': 'Each person buys their own food, drink, rental, or fare.',
  'ticket-required':
    'A separate ticket or admission is required. Stoop does not sell tickets or process payment.'
};

export const PLAN_TEXT_MIN = 25;
export const PLAN_TEXT_MAX = 220;
export const MEETING_POINT_MAX = 120;
export const TIME_TEXT_MAX = 30;

/**
 * How far ahead a plan may be dated. The composer offers exactly this many day
 * chips (see getDateChips), so the server accepts exactly this many days.
 */
export const PLAN_WINDOW_DAYS = 14;

const CLOCK_TIME = /^(0?[1-9]|1[0-2]):[0-5]\d (AM|PM)$/;

/**
 * An exact time, in the display form the composer produces. "sometime" and
 * "morning" are the vagueness this release exists to remove, and a non-empty
 * check let both of them through.
 */
export function isClockTime(value: unknown): boolean {
  return typeof value === 'string' && CLOCK_TIME.test(value.trim());
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Round trips only if the day actually exists: 2026-02-30 does not.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** A real day on the calendar, not merely four digits and two dashes. */
export function isRealCalendarDate(value: unknown): boolean {
  return parseIsoDate(value) !== null;
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `today` to `date`, counted on the calendar rather than in hours. */
function dayOffset(date: Date, today: Date): number {
  return Math.round((startOfUtcDay(date) - startOfUtcDay(today)) / DAY_MS);
}

/**
 * The visitor's own calendar day, as YYYY-MM-DD, read in their timezone.
 *
 * getDateChips builds the day chips from the browser's local day, so this is
 * the day the composer counted from, and it is what the client tells the API it
 * counted from. Local getters, deliberately: at 8pm in New York the UTC day is
 * already tomorrow, and that one hour of difference is the whole bug.
 */
export function localCalendarDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * How far the client's day may sit from the server's UTC day. Every real
 * timezone runs from UTC-12 to UTC+14, so a browser's calendar date is the UTC
 * date, the day before it, or the day after it. Never further.
 */
export const REFERENCE_DRIFT_DAYS = 1;

/**
 * What a request is told when the day it claims to be on cannot be true. A
 * refresh fixes the honest version of this (a tab left open past midnight), so
 * that comes first; a device clock that is genuinely days out is the other.
 */
export const REFERENCE_DATE_ERROR =
  "Your device's calendar day does not match ours. Refresh the page and try again, and check the date on your device if it keeps happening.";

export type ReferenceDateParse = { ok: true; today: Date } | { ok: false; error: string };

/**
 * The day the publication window is counted from, judged rather than assumed.
 *
 * The client sends its own day because it is the only party that knows the
 * visitor's timezone, but it does not get to choose freely.
 *
 * Leaving the field out (or sending null, which is how JSON says the same
 * thing) is allowed and means "count from UTC". That is what a client built
 * before this field existed gets, and it grants nothing: UTC is the server's
 * own day, the most restrictive honest answer available.
 *
 * Supplying a value is a claim, and a claim that is not a real calendar date,
 * or is further from the server's UTC day than any timezone can explain, is
 * refused. Quietly falling back to UTC instead would accept a plan against a
 * fortnight the client never showed anyone, and never say so.
 */
export function parseReferenceDate(clientToday: unknown, now: Date = new Date()): ReferenceDateParse {
  if (clientToday === undefined || clientToday === null) return { ok: true, today: now };
  const date = parseIsoDate(clientToday);
  if (!date || Math.abs(dayOffset(date, now)) > REFERENCE_DRIFT_DAYS) {
    return { ok: false, error: REFERENCE_DATE_ERROR };
  }
  return { ok: true, today: date };
}

/**
 * The same judgement, for the client, where `now` is the same browser clock the
 * date came from and the drift is 0 by construction. Server routes call
 * parseReferenceDate instead, so a claim that cannot be true is answered rather
 * than ignored.
 */
export function resolveReferenceDate(clientToday: unknown, now: Date = new Date()): Date {
  const parsed = parseReferenceDate(clientToday, now);
  return parsed.ok ? parsed.today : now;
}

/**
 * Inside the window the chips offer, and nothing outside it. getDateChips
 * builds offsets 0 through PLAN_WINDOW_DAYS - 1 counting from today, so those
 * are exactly the days a plan may land on. The slack this used to allow at each
 * end took two days the composer never offered, one of them yesterday.
 *
 * `today` is the reference day, not necessarily the server's: pass the value
 * resolveReferenceDate returned, or the window means UTC's fourteen days rather
 * than the fourteen the visitor was shown.
 */
export function isWithinPublicationWindow(value: unknown, today: Date = new Date()): boolean {
  const date = parseIsoDate(value);
  if (!date) return false;
  const days = dayOffset(date, today);
  return days >= 0 && days <= PLAN_WINDOW_DAYS - 1;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The public day copy, kept consistent with the date.
 *
 * The client computes the label in the visitor's timezone and we keep that
 * wording when it agrees with the date, because recomputing it server side is
 * what mislabels "Tomorrow" as a weekday (see the UTC gotcha in CLAUDE.md). What
 * this refuses to do is store a label from a date the plan no longer has, which
 * is what an edit that moved the date used to leave behind.
 */
export function resolveDayLabel(
  whenDate: string,
  supplied: string | null | undefined,
  today: Date = new Date()
): string {
  const date = parseIsoDate(whenDate);
  if (!date) return '';

  const days = dayOffset(date, today);
  const weekday = WEEKDAYS[date.getUTCDay()];

  const label = (supplied ?? '').trim();
  if (label) {
    // A calendar date has the same weekday in every timezone, so a neighbouring
    // weekday is never slack: it is copy from a day the plan is not on, which is
    // exactly what an edit that moved the date by one used to leave behind.
    const acceptable = new Set<string>([weekday, `Next ${weekday}`]);
    // The relative words are judged against the reference day, which is the
    // visitor's own whenever they sent one and is otherwise UTC. Either way it
    // is a day, so each word has exactly one date that makes it true. The slack
    // this used to allow (a day either side, for the timezone gap) is what let
    // an edit that moved a plan by one day keep the word from the old day.
    if (days === 0) acceptable.add('Today');
    if (days === 1) acceptable.add('Tomorrow');
    if (acceptable.has(label)) return label;
  }

  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return weekday;
}

export const MEETING_POINT_GUIDANCE =
  'Name a public place: a cafe, a venue, a park entrance, a landmark. Never a home address.';

export const PLAN_VISIBILITY_NOTE = 'Public plan. Your phone and email stay private.';

export function isCostExpectation(value: unknown): value is CostExpectation {
  return typeof value === 'string' && (COST_EXPECTATIONS as readonly string[]).includes(value);
}

export function costExpectationLabel(value: unknown): string {
  return isCostExpectation(value) ? COST_EXPECTATION_LABELS[value] : '';
}

export type PlanContractInput = {
  text: string;
  whenDate: string;
  whenTimeSpecific: string;
  spot: string;
  spots: number;
  costExpectation: string;
};

/** The field each issue belongs to, so the composer can focus the first one. */
export type PlanContractField = 'text' | 'date' | 'time' | 'spot' | 'spots' | 'cost';

export type PlanContractIssue = { field: PlanContractField; label: string };

export type PlanContractOptions = { today?: Date };

/** Ordered the way the composer is ordered, so "first missing" means first on screen. */
export function planContractIssues(
  input: PlanContractInput,
  options: PlanContractOptions = {}
): PlanContractIssue[] {
  const issues: PlanContractIssue[] = [];
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (text.length < PLAN_TEXT_MIN || text.length > PLAN_TEXT_MAX) {
    issues.push({ field: 'text', label: 'plan' });
  }
  if (!isRealCalendarDate(input.whenDate) || !isWithinPublicationWindow(input.whenDate, options.today)) {
    issues.push({ field: 'date', label: 'date' });
  }
  if (!isClockTime(input.whenTimeSpecific)) {
    issues.push({ field: 'time', label: 'exact time' });
  }
  if (typeof input.spot !== 'string' || !input.spot.trim()) {
    issues.push({ field: 'spot', label: 'public meeting point' });
  }
  if (![1, 2, 3].includes(input.spots)) {
    issues.push({ field: 'spots', label: 'group size' });
  }
  if (!isCostExpectation(input.costExpectation)) {
    issues.push({ field: 'cost', label: 'cost expectation' });
  }
  return issues;
}

/** Every field this plan is still missing, named the way the UI names it. */
export function validatePlanContract(input: PlanContractInput, options: PlanContractOptions = {}): string[] {
  return planContractIssues(input, options).map(issue => issue.label);
}

export type NormalizedPlanContract = {
  text: string;
  whenDate: string;
  whenTimeSpecific: string;
  spot: string;
  spots: number;
  costExpectation: CostExpectation;
};

export type PlanContractParse =
  | { ok: true; value: NormalizedPlanContract }
  | { ok: false; error: string; missing: string[] };

function tooLong(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.trim().length > max;
}

/**
 * Server-side gate. Anything that arrives from a client, however it was built,
 * has to survive this before it reaches the database.
 */
export function parsePlanContractBody(
  body: unknown,
  options: PlanContractOptions = {}
): PlanContractParse {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body', missing: [] };
  }
  const input = body as Record<string, unknown>;

  const candidate: PlanContractInput = {
    text: typeof input.text === 'string' ? input.text : '',
    whenDate: typeof input.whenDate === 'string' ? input.whenDate : '',
    whenTimeSpecific: typeof input.whenTimeSpecific === 'string' ? input.whenTimeSpecific : '',
    spot: typeof input.spot === 'string' ? input.spot : '',
    spots: typeof input.spots === 'number' ? input.spots : NaN,
    costExpectation: typeof input.costExpectation === 'string' ? input.costExpectation : ''
  };

  const missing = validatePlanContract(candidate, options);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Every plan needs ${missing.join(', ')}.`,
      missing
    };
  }

  if (tooLong(candidate.spot, MEETING_POINT_MAX)) {
    return {
      ok: false,
      error: `Keep the meeting point under ${MEETING_POINT_MAX} characters.`,
      missing: ['public meeting point']
    };
  }
  if (tooLong(candidate.whenTimeSpecific, TIME_TEXT_MAX)) {
    return {
      ok: false,
      error: `Keep the time under ${TIME_TEXT_MAX} characters.`,
      missing: ['exact time']
    };
  }

  return {
    ok: true,
    value: {
      text: candidate.text.trim(),
      whenDate: candidate.whenDate,
      whenTimeSpecific: candidate.whenTimeSpecific.trim(),
      spot: candidate.spot.trim(),
      spots: candidate.spots,
      costExpectation: candidate.costExpectation as CostExpectation
    }
  };
}

export type PlanContractRow = {
  text?: string | null;
  when_date?: string | null;
  when_time_specific?: string | null;
  spot?: string | null;
  spots_total?: number | null;
  cost_expectation?: string | null;
};

/** Does a stored plan already carry everything the contract asks for? */
export function planMeetsContract(plan: PlanContractRow): boolean {
  // A plan that already happened still met the contract when it was posted, so
  // the window is not part of this judgement.
  return (
    planContractIssues({
      text: plan.text ?? '',
      whenDate: plan.when_date ?? '',
      whenTimeSpecific: plan.when_time_specific ?? '',
      spot: plan.spot ?? '',
      spots: plan.spots_total ?? 0,
      costExpectation: plan.cost_expectation ?? ''
    }).filter(issue => !(issue.field === 'date' && isRealCalendarDate(plan.when_date))).length === 0
  );
}

export type PlanSummaryInput = PlanContractInput & {
  dayLabel: string;
  neighborhoodName: string;
  intentTags: string[];
};

export type PlanSummaryRow = { label: string; value: string };

/**
 * What another person will see, in their words not ours, shown before publish.
 * Missing values read as "Still needed" rather than disappearing quietly.
 */
export function planSummaryRows(input: PlanSummaryInput): PlanSummaryRow[] {
  const missing = 'Still needed';
  const time = input.whenTimeSpecific.trim();
  const day = input.dayLabel.trim();
  const spot = input.spot.trim();
  // A row is only complete when the whole fact is. "Saturday" with no time is
  // exactly the vagueness the contract exists to catch, so it does not get to
  // look finished in the summary.
  const when = day && time ? `${day}, ${time}` : '';
  const where = spot ? [spot, input.neighborhoodName.trim()].filter(Boolean).join(', ') : '';
  const spots = [1, 2, 3].includes(input.spots)
    ? `${input.spots} ${input.spots === 1 ? 'spot' : 'spots'} open`
    : missing;

  const rows: PlanSummaryRow[] = [
    { label: 'What', value: input.text.trim() || missing },
    { label: 'When', value: when || missing },
    { label: 'Where', value: where || missing },
    { label: 'Cost', value: costExpectationLabel(input.costExpectation) || missing },
    { label: 'Spots', value: spots }
  ];

  if (input.intentTags.length > 0) {
    rows.push({ label: 'Expectations', value: input.intentTags.join(', ') });
  }

  rows.push({ label: 'Who sees this', value: PLAN_VISIBILITY_NOTE });
  return rows;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Turn the native time input's 24 hour value into the string a plan stores. */
export function formatTimeOfDay(value: string): string | null {
  const match = typeof value === 'string' ? value.match(HHMM) : null;
  if (!match) return null;
  const hours = Number(match[1]);
  const suffix = hours < 12 ? 'AM' : 'PM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${match[2]} ${suffix}`;
}

/** The rough band older surfaces still read from plans.when_time. */
export function timeBandFor(value: string): 'Morning' | 'Afternoon' | 'Evening' | 'Night' | null {
  const match = typeof value === 'string' ? value.match(HHMM) : null;
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours < 12) return 'Morning';
  if (hours < 17) return 'Afternoon';
  if (hours < 21) return 'Evening';
  return 'Night';
}
