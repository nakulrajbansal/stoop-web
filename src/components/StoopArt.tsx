/**
 * The noticeboard vocabulary: pinned paper, a board, a conversation, a table.
 *
 * These are the drawings that explain how Stoop works and that give the feed's
 * three states a picture instead of a paragraph. Same rules as CategoryArt:
 * authored inline SVG, currentColor, no icon runtime, decorative unless a
 * caller passes a label, and a fixed viewBox with an explicit aspect so nothing
 * reflows while a page paints.
 *
 * They are deliberately literal. A drawing here has to say "a card is pinned to
 * a board" or "this request is waiting", not decorate a heading.
 */

type ArtProps = {
  /** Rendered width in px. Height follows the drawing's aspect. */
  width?: number;
  className?: string;
  /** Names the art for assistive tech. Omit where the text already says it. */
  label?: string;
};

function Frame({
  width,
  height,
  viewBox,
  className,
  label,
  name,
  children
}: ArtProps & { height: number; viewBox: string; name: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      width={width}
      height={width ? undefined : height}
      className={className}
      // Names the drawing for tests and for anyone reading the DOM. The feed's
      // three states must never be able to share a picture.
      data-art={name}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      style={width ? { height: 'auto' } : undefined}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {children}
    </svg>
  );
}

/** A pin, drawn the same way in every board picture. */
function Pin({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r="2.2" fill="currentColor" stroke="none" />;
}

/** Step 1: plans pinned up, readable by anyone. */
export function BrowseArt(props: ArtProps) {
  return (
    <Frame {...props} name="browse" viewBox="0 0 96 64" height={64}>
      <rect x="4" y="6" width="88" height="52" rx="5" opacity="0.35" />
      <rect x="12" y="14" width="34" height="26" rx="3.5" />
      <Pin x={29} y={14} />
      <path d="M18 24h20M18 30h13" opacity="0.7" />
      <rect x="52" y="20" width="32" height="26" rx="3.5" />
      <Pin x={68} y={20} />
      <path d="M58 30h18M58 36h11" opacity="0.7" />
      <path d="M12 48h26" opacity="0.45" />
    </Frame>
  );
}

/** Step 2: a message opens a private conversation, nothing more. */
export function MessageArt(props: ArtProps) {
  return (
    <Frame {...props} name="message" viewBox="0 0 96 64" height={64}>
      <path d="M10 12h44a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H26l-9 8v-8h-7a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" />
      <path d="M18 21h28M18 28h18" opacity="0.7" />
      <path d="M86 30H68a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h12l7 6v-6a4 4 0 0 0 3-4V34a4 4 0 0 0-4-4z" opacity="0.55" />
      <path d="M71 39h10" opacity="0.7" />
    </Frame>
  );
}

/** Step 3: the host reads the request and decides. */
export function HostChoosesArt(props: ArtProps) {
  return (
    <Frame {...props} name="host-chooses" viewBox="0 0 96 64" height={64}>
      <rect x="8" y="10" width="46" height="44" rx="4" />
      <circle cx="21" cy="24" r="6" />
      <path d="M14 40c1.5-4 5-6 7-6s5.5 2 7 6" />
      <path d="M36 22h12M36 29h9M36 36h12" opacity="0.7" />
      <circle cx="74" cy="24" r="10" />
      <path d="m69.5 24 3.5 3.5 6-6.5" />
      <circle cx="74" cy="46" r="7" opacity="0.45" />
      <path d="m71 43 6 6M77 43l-6 6" opacity="0.45" />
    </Frame>
  );
}

/** Step 4: four people at most, and only the confirmed ones see each other. */
export function TableArt(props: ArtProps) {
  return (
    <Frame {...props} name="table" viewBox="0 0 96 64" height={64}>
      <circle cx="48" cy="32" r="16" />
      <circle cx="48" cy="10" r="5.5" fill="currentColor" stroke="none" />
      <circle cx="70" cy="32" r="5.5" fill="currentColor" stroke="none" />
      <circle cx="48" cy="54" r="5.5" fill="currentColor" stroke="none" />
      <circle cx="26" cy="32" r="5.5" />
      <path d="M40 30h16M40 36h10" opacity="0.6" />
    </Frame>
  );
}

/**
 * The feed's true-empty state: the board is up, nothing is pinned to it yet.
 * Deliberately not the same picture as an outage.
 */
export function EmptyBoardArt(props: ArtProps) {
  return (
    <Frame {...props} name="empty-board" viewBox="0 0 120 80" height={80}>
      <rect x="6" y="8" width="108" height="60" rx="6" />
      <path d="M6 68h108" opacity="0.5" />
      <rect x="42" y="22" width="36" height="32" rx="3.5" strokeDasharray="4 4" opacity="0.8" />
      <Pin x={60} y={22} />
      <path d="M22 30h10M22 38h7" opacity="0.3" />
      <path d="M88 30h10M88 38h7" opacity="0.3" />
    </Frame>
  );
}

/**
 * The feed's failure state: the board is fine, the line to it is not. Drawn as
 * a snapped cord on purpose, because the one thing this picture must never say
 * is "the neighborhood is empty".
 */
export function OutageArt(props: ArtProps) {
  return (
    <Frame {...props} name="outage" viewBox="0 0 120 80" height={80}>
      <rect x="6" y="8" width="108" height="64" rx="6" opacity="0.3" />
      {/* A plug pulled out of its socket. The board behind it is intact. */}
      <path d="M12 40h16" opacity="0.8" />
      <rect x="28" y="30" width="18" height="20" rx="4" />
      <path d="M46 35h6M46 45h6" />
      <rect x="74" y="28" width="22" height="24" rx="5" />
      <path d="M80 36v8M90 36v8" />
      <path d="M96 40h12" opacity="0.8" />
      <path d="M58 26l4-6M66 26l-1-7M62 30l7-3" opacity="0.55" />
    </Frame>
  );
}

/** A single pinned card, used as a small mark next to headings and captions. */
export function PinnedCardArt(props: ArtProps) {
  return (
    <Frame {...props} name="pinned-card" viewBox="0 0 32 32" height={32}>
      <rect x="6" y="8" width="20" height="18" rx="3" />
      <Pin x={16} y={8} />
      <path d="M11 17h10M11 21h6" opacity="0.7" />
    </Frame>
  );
}
