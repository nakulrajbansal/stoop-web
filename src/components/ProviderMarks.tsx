/**
 * The Google and Apple marks.
 *
 * These are somebody else's trademarks on our signup screen, and there are two
 * separate things to get right.
 *
 * It has to be the real mark. A hand-drawn approximation of the Google G, or a
 * rounded shape standing in for the Apple logo, is not a smaller version of the
 * right thing: it is a wrong trademark, and to somebody deciding whether to
 * hand over an identity a wrong logo reads as a phishing page. So the geometry
 * below is the published artwork, not a redraw, and provenance is written down
 * in docs/VISUAL_ASSETS.md under "Provider marks".
 *
 * And it has to be silent. The button says "Continue with Google"; a screen
 * reader that also announces the logo says it twice. Both marks are decoration:
 * aria-hidden, unfocusable, no title element. The accessible name lives on the
 * parent button.
 *
 * These are the two drawings in this app that do NOT use currentColor. Every
 * other one does, because it is ours to color. A green Google G is not the
 * Google G, and Apple's guidelines ask for one flat color, so both are pinned.
 *
 * Inline, so there is no request, no dependency, and nothing to fetch on the
 * one screen that has to work.
 */

type MarkProps = {
  /** Drawn at 18px unless the button says otherwise. Both marks share it. */
  size?: number;
};

/**
 * The Google "G". Four colors, drawn on a square canvas, with the official
 * geometry from Google's identity guidelines.
 */
export function GoogleMark({ size = 18 }: MarkProps) {
  return (
    <svg
      width={String(size)}
      height={String(size)}
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"
      />
    </svg>
  );
}

/**
 * The Apple logo. One solid shape, one flat color, its own proportions (it is
 * taller than it is wide, so the square box letterboxes it rather than
 * stretching it). Black, which is what Apple asks for on a light background,
 * and this app has no dark mode.
 */
export function AppleMark({ size = 18 }: MarkProps) {
  return (
    <svg
      width={String(size)}
      height={String(size)}
      viewBox="0 0 814 1000"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#000000"
        d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"
      />
    </svg>
  );
}
