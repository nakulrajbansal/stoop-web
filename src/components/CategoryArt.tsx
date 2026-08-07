/**
 * The seven categories, drawn once.
 *
 * Every surface that names a category (the feed row, the plan header, the plan
 * card, the composer picker) draws it from here, so a category looks the same
 * everywhere and a new surface cannot invent its own vocabulary. The drawings
 * are hand-authored inline SVG: one 48 unit square each, the same 1.7 stroke,
 * the same round caps, no icon runtime and no network request.
 *
 * Colour comes from CSS. The wrapper carries `cat-{category}`, which sets
 * --cat-ink and --cat-wash in globals.css next to the matching .tag-{category}
 * pill, and the drawing itself is currentColor throughout.
 *
 * Decorative by default. Every place this is used already names the category in
 * text next to it, so the art is aria-hidden and adds nothing for a screen
 * reader to repeat. Pass `label` only where the art is the only thing carrying
 * the meaning; then it becomes role="img" with that accessible name.
 */

export const CATEGORIES = ['coffee', 'outdoors', 'sports', 'arts', 'food', 'books', 'music'] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

/** Sentence case, for the surfaces that show a category as a word. */
export const CATEGORY_LABELS: Record<Category, string> = {
  coffee: 'Coffee',
  outdoors: 'Outdoors',
  sports: 'Sports',
  arts: 'Arts',
  food: 'Food',
  books: 'Books',
  music: 'Music'
};

/**
 * The word to hand `label` on a surface where the drawing is the only thing
 * saying which kind of plan this is.
 *
 * Null for a stored value we do not draw, and that is the whole point of it.
 * The drawing falls back to the coffee tokens so a legacy row still gets a
 * picture, but calling a pottery plan "Coffee" out loud would be a lie, and a
 * silent decoration is better than a confident wrong answer. The plan's own
 * text is on every one of these surfaces and carries the activity anyway.
 */
export function categoryLabelOf(value: unknown): string | null {
  return isCategory(value) ? CATEGORY_LABELS[value] : null;
}

const DRAWINGS: Record<Category, React.ReactNode> = {
  coffee: (
    <>
      <path d="M14 19h18v7a9 9 0 0 1-9 9 9 9 0 0 1-9-9z" />
      <path d="M32 21.5a5 5 0 0 1 0 10" />
      <path d="M10 38c5 1.6 9.5 2.2 14 2.2S32.5 39.6 38 38" />
      <path d="M20 14.5c1.8-2.4-1.4-4 0-6.5" />
      <path d="M26.5 14.5c1.8-2.4-1.4-4 0-6.5" />
    </>
  ),
  outdoors: (
    <>
      <circle cx="35" cy="13" r="4.5" />
      <path d="M5 33c5.5-8 11-8 16.5-.5 4-5 8-6 12.5-2.5" />
      <path d="M43 32.5c-2.6-2.2-5-3-7.4-2.4" />
      <path d="M17.5 41c1.4-5 4.6-7.2 5.2-11.4.4-3 2.4-4.6 5.3-5" />
      <path d="M6 41h36" />
    </>
  ),
  sports: (
    <>
      <ellipse cx="20" cy="19" rx="9.5" ry="11" />
      <path d="M20 30.5 18.5 41" />
      <circle cx="35" cy="32" r="6.5" />
      <circle cx="33" cy="30" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="37" cy="31.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="34.5" cy="34.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  arts: (
    <>
      <rect x="7" y="12" width="21" height="21" rx="2.5" />
      <path d="M10.5 28.5 16 22l4.5 5 3-3.4 3.5 4" />
      <circle cx="22" cy="17.5" r="1.8" />
      {/* Brush: handle, ferrule, then a tip that reads as loaded with paint. */}
      <path d="M41 12.5 35 24" />
      <path d="m33 22.5 4.2 2.2" />
      <path d="M32.6 25c-1 2-2.6 3-4.6 3 1.6 2.4 4 3 6.6 1.6 1.7-.9 2.2-2.7 1.2-4.2z" />
    </>
  ),
  food: (
    <>
      <path d="M9 24h22a11 11 0 0 1-22 0z" />
      <path d="M7.5 24h25" />
      <path d="M16 18.5c1.8-2.4-1.4-4 0-6.5" />
      <path d="M24 18.5c1.8-2.4-1.4-4 0-6.5" />
      {/* Spoon, beside the bowl. */}
      <ellipse cx="38.5" cy="17" rx="3.6" ry="5" />
      <path d="M38.5 22v16" />
    </>
  ),
  books: (
    <>
      <path d="M24 16.5c-5-3.2-9.5-3.6-15-1.6v18.4c5.5-2 10-1.6 15 1.6z" />
      <path d="M24 16.5c5-3.2 9.5-3.6 15-1.6v18.4c-5.5-2-10-1.6-15 1.6z" />
      <path d="M24 16.5v17.9" />
      <path d="M13.5 21.5c2.6-.6 4.8-.5 6.6.3" />
      <path d="M27.9 21.8c1.8-.8 4-.9 6.6-.3" />
    </>
  ),
  music: (
    <>
      <circle cx="17" cy="33.5" r="5" />
      <path d="M22 33.5V12" />
      <path d="M22 12c5.5 1 8 3.6 8 7.6" />
      <path d="M34.5 20.5c2.8 2.6 2.8 6.4 0 9" />
      <path d="M39 16.5c5 4.6 5 12.4 0 17" />
    </>
  )
};

type Props = {
  category: string;
  /** Rendered box, in px. The drawing scales with it. */
  size?: number;
  /** The rounded wash tile behind the drawing. Off for art on its own. */
  tile?: boolean;
  /** Give the art an accessible name. Omit wherever the category is in text. */
  label?: string;
  className?: string;
};

export default function CategoryArt({ category, size = 40, tile = true, label, className }: Props) {
  const cat: Category = isCategory(category) ? category : 'coffee';
  const described = label ?? '';
  // A 1.7 stroke in a 48 unit box is a hairline once the box is 22px on a
  // phone, so the line gets heavier as the drawing gets smaller and the
  // drawing reads at every size it is used at.
  const strokeWidth = size <= 24 ? 2.6 : size <= 34 ? 2.1 : 1.7;
  // Sized in px rather than as a percentage of the wrapper. A percentage here
  // collapses to zero in a flex row (the wrapper is a flex item with no
  // definite cross size to resolve against), which is how the drawings once
  // vanished on the homepage while still rendering in a column.
  const inner = tile ? Math.round(size * 0.76) : size;

  return (
    <span
      className={`cat-art cat-${cat}${tile ? ' cat-art-tile' : ''} ${className ?? ''}`}
      style={{ width: size, height: size }}
      {...(described
        ? { role: 'img', 'aria-label': described }
        : { 'aria-hidden': 'true' as const })}
    >
      <svg
        viewBox="0 0 48 48"
        width={inner}
        height={inner}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {DRAWINGS[cat]}
      </svg>
    </span>
  );
}
