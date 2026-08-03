/**
 * The objectionable-text filter, in TypeScript.
 *
 * The *enforcement* lives in the database (migration 0008: triggers on plans,
 * messages and profiles). That is deliberate — the website, the iOS app and
 * anything else holding an anon key write to those tables directly, so a check
 * in a route handler or in the app would be trivially bypassed.
 *
 * This module exists so the API can answer with a sentence a person can read
 * instead of letting a raw Postgres check_violation surface as a 500. It is a
 * mirror, not the source of truth, and `text-moderation.test.ts` fails if the
 * two lists ever drift apart.
 *
 * What this is not: complete moderation. A blocklist cannot catch novel
 * phrasing, misspellings it has not seen, or anything harmful said in ordinary
 * words. Human review of reports (/admin/reports, with Warn and Suspend) is the
 * real backstop, and the product claims exactly that and nothing more.
 */

/**
 * Matched on word boundaries after normalisation.
 *
 * Terms with a common innocent sense are deliberately absent even when they are
 * also used as slurs — see the same note in migration 0008. The test in for a
 * false positive is "would a neighbour plausibly write this and mean something
 * ordinary?": "fag" (cigarette), "dyke" (levee, and a reclaimed
 * self-description), "spic" ("spic and span"), "cum" ("cum laude"), "escort"
 * ("I can escort you from the station"), "bareback" (riding), "kill you"
 * ("that hill will kill you"), "underage" (warning about it). "chink" stays:
 * the narrow-opening sense is rare enough in American speech that the trade
 * goes the other way.
 *
 * A false positive rejects a real post. A false negative still reaches report
 * review, which is the actual backstop.
 */
export const WORD_TERMS: readonly string[] = [
  'nigger', 'nigga', 'faggot', 'tranny', 'retard', 'retarded', 'kike',
  'chink', 'wetback', 'coon', 'shemale',
  'whore', 'slut', 'rape', 'raped', 'raping', 'rapist',
  'molest', 'molested', 'molesting', 'pedophile', 'paedophile',
  'hooker', 'prostitute', 'incall', 'outcall',
  'blowjob', 'handjob', 'creampie', 'deepthroat', 'gangbang',
  'kys', 'kill yourself', 'shoot you', 'stab you', 'beat you up',
  'child porn', 'cp for sale'
];

/**
 * Matched after every separator is removed, so `f-a-g-g-o-t` and `f a g g o t`
 * are caught. Only long terms live here: matching a short word against a string
 * with no word boundaries is what produces Scunthorpe-style false positives.
 */
export const SQUASHED_TERMS: readonly string[] = [
  'nigger', 'faggot', 'childporn', 'killyourself', 'rapeyou', 'prostitute',
  'blowjob', 'gangbang', 'pedophile', 'paedophile'
];

const LEET_FROM = '0134578@$!|';
const LEET_TO = 'oieastbasil';

/**
 * Lowercase, undo common letter/digit substitution, and collapse a letter
 * repeated three or more times (`fuuuuck` -> `fuuck`). Word boundaries survive.
 * Must stay identical to `public.moderation_normalize` in migration 0008.
 */
export function normalizeForModeration(input: string): string {
  const lowered = (input ?? '').toLowerCase();
  let translated = '';
  for (const ch of lowered) {
    const i = LEET_FROM.indexOf(ch);
    translated += i === -1 ? ch : LEET_TO[i];
  }
  return translated.replace(/(.)\1{2,}/g, '$1$1');
}

/** The same string with every non-alphanumeric character removed. */
export function squashForModeration(input: string): string {
  return normalizeForModeration(input).replace(/[^a-z0-9]/g, '');
}

/**
 * Build the match for one term. Two allowances, both mirrored by
 * `public.contains_blocked_language`:
 *
 *   - every letter may repeat (`s+l+u+t+`), so `sluuut` is caught. Normalising
 *     3-or-more repeats down to two is not enough on its own — it turns
 *     `sluuut` into `sluut`, which is still not `slut`. Collapsing all the way
 *     to one instead would mangle ordinary words like `bookkeeper`.
 *   - a space means "one or more separators", so `kill yourself` also matches
 *     `kill-yourself`.
 *
 * The surrounding `(^|[^a-z0-9])` / `([^a-z0-9]|$)` are what keep `grape` and
 * `assignment` out of it.
 */
function wordPattern(term: string): RegExp {
  if (!/^[a-z0-9 ]+$/.test(term)) {
    throw new Error(`blocklist term must be lowercase letters, digits and spaces: ${term}`);
  }
  const body = term
    .split(' ')
    .map(part => part.replace(/[a-z0-9]/g, '$&+'))
    .join('[^a-z0-9]+');
  return new RegExp(`(^|[^a-z0-9])${body}([^a-z0-9]|$)`);
}

const WORD_PATTERNS = WORD_TERMS.map(wordPattern);

/**
 * True when the text trips the blocklist. Must stay behaviourally identical to
 * `public.contains_blocked_language`.
 */
export function containsBlockedLanguage(input: string | null | undefined): boolean {
  if (!input || !input.trim()) return false;

  const normalized = normalizeForModeration(input);
  if (WORD_PATTERNS.some(pattern => pattern.test(normalized))) return true;

  const squashed = squashForModeration(input);
  return SQUASHED_TERMS.some(term => squashed.includes(term));
}

/** The message every surface shows. Never quotes back what was written. */
export const BLOCKED_LANGUAGE_MESSAGE =
  'That wording breaks the Community Standard. Rewrite it and try again.';

/**
 * Returns the first field that trips the filter, or null. Routes use this to
 * refuse before writing, so the database trigger stays a backstop rather than
 * the thing members meet.
 */
export function firstBlockedField(
  fields: Record<string, string | null | undefined>
): string | null {
  for (const [name, value] of Object.entries(fields)) {
    if (containsBlockedLanguage(value)) return name;
  }
  return null;
}

/** True when a Postgres error came from the 0008 language triggers. */
export function isBlockedLanguageError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes('stoop_blocked_language');
}
