/**
 * The page's main landmark, and the skip link's destination.
 *
 * Every page renders `<Nav />` and then its content, so the main landmark has
 * to be created by the page rather than by the root layout: wrapping
 * `{children}` in the layout would put the nav (and, on public pages, the
 * footer) inside `<main>`, which both breaks the landmark structure and lands
 * the skip link above the navigation it is meant to skip.
 *
 * This component replaces the page's existing outer content container rather
 * than adding a level, so it costs no extra DOM node. One per page: the id is
 * fixed here so it cannot drift from the `href="#main"` in the root layout, and
 * `tabIndex={-1}` is what lets the skip link actually move focus in Safari.
 */
export default function PageMain({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main" tabIndex={-1} className={className}>
      {children}
    </main>
  );
}
