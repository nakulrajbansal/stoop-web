/**
 * What a name is, decided once.
 *
 * profiles.name is the private full name. profiles.display_name is the public
 * projection of it, and Postgres generates that column, so no client can write
 * one and leave the other behind. These helpers exist so the server stores a
 * name whose projection really is a first name, and so the TypeScript rule and
 * the SQL rule can be pinned to each other in a test.
 *
 * Why the separator list is this long: the first version of the projection split
 * on an ASCII space. A name joined by a no-break space (an ordinary paste from a
 * document, and what several phone keyboards insert) contains no ASCII space at
 * all, so the split returned the whole string and the surname became publicly
 * readable. The list below is the same one the generated column uses.
 */

/**
 * Every code point that separates one part of a name from another: space, tab,
 * newline, carriage return, form feed, vertical tab, then the Unicode
 * separators a keyboard or a paste can produce, then the zero width ones.
 *
 * Written as numbers rather than as characters on purpose. A literal no-break
 * space in the source is invisible in review, which is exactly the bug this
 * list closes. Kept as one source of truth with the generated column in
 * supabase/migrations/20260805211500_conversation_withdrawal.sql: change one and
 * src/lib/profile-identity.test.ts fails until you change the other.
 */
export const NAME_SEPARATOR_CODE_POINTS: readonly number[] = [
  0x20, // space
  0x09, // tab
  0x0a, // line feed
  0x0d, // carriage return
  0x0c, // form feed
  0x0b, // vertical tab
  0xa0, // no-break space
  0x1680, // ogham space mark
  0x2000, // en quad, through the run of Unicode spaces below
  0x2001,
  0x2002,
  0x2003,
  0x2004,
  0x2005,
  0x2006,
  0x2007, // figure space
  0x2008,
  0x2009,
  0x200a, // hair space
  0x200b, // zero width space
  0x2028, // line separator
  0x2029, // paragraph separator
  0x202f, // narrow no-break space
  0x205f, // medium mathematical space
  0x3000, // ideographic space
  0xfeff // zero width no-break space
];

const SEPARATORS = new RegExp(
  `[${NAME_SEPARATOR_CODE_POINTS.map(c => `\\u${c.toString(16).padStart(4, '0')}`).join('')}]+`,
  'g'
);

/** The profiles.name column, and what the composer allows. */
export const NAME_MAX = 50;

/**
 * The full name as it should be stored: one ordinary space between parts, no
 * leading or trailing space. Never throws, never truncates. Length is the
 * caller's decision, so a too-long name can be refused rather than cut in half.
 */
export function normalizeFullName(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.replace(SEPARATORS, ' ').trim();
}

/**
 * The public identity: first name only. Matches the generated column exactly,
 * so the server can say what the database will store before it stores it.
 */
export function publicDisplayName(input: unknown): string {
  return normalizeFullName(input).split(' ')[0] ?? '';
}

/** The avatar fallback, unchanged: up to two uppercase initials. */
export function deriveInitials(input: unknown): string {
  return normalizeFullName(input)
    .split(' ')
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}
