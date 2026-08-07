# Visual assets

Where every picture on Stoop comes from, and the rules the pictures live under.

Two kinds of visual exist in this repo and they are not interchangeable:

- **Authored drawings.** Inline SVG written by hand, in
  `src/components/CategoryArt.tsx` (the seven categories) and
  `src/components/StoopArt.tsx` (the noticeboard vocabulary: pinned paper, a
  conversation, a host deciding, a table, an empty board, an outage). They are
  ours, they cost no request, and they are the only visual allowed on a surface
  that carries a plan or a person.
- **Photographs.** One of them, CC0, downloaded and re-encoded into
  `public/photos`, used on the homepage only. The use goes through
  `src/components/Photograph.tsx`, which renders it decoratively: empty alt,
  no caption, laid into the page as a layer inside the closing panel.

The balance between those two shifted in this pass, and it is worth stating why
rather than leaving it to be read off a diff. A photograph of somewhere else
cannot explain a page about plans in your neighborhood. The masthead band tried,
and the founder's reading of it was that it did not look good and did not make
any sense. What opens the homepage now is the board itself: real plans, or the
labelled sample when there are none, on a drawn sheet of paper with a drawn pin
through it. Photography is down to the one frame that is arguing rather than
decorating.

## Rules

1. **Local only.** Photographs are committed to `public/photos`. Nothing is
   fetched from a remote image host at runtime, and `next.config.js` has no
   `remotePatterns`, so a third party cannot become a dependency of the page.
2. **Provenance or it does not ship.** Each photograph below has a source page
   that states its licence, a named creator, and a download date. A candidate
   whose source page could not be loaded and read was dropped rather than used.
3. **Never a member.** The enforceable rule is this: no photograph may show an
   identifiable face, and nobody appearing in one may be presented as a member,
   a host or an attendee. A frame may contain people (the masthead band that has
   since been removed had distant, out of focus pedestrians cropped below the
   shoulder); what it may not contain is a person a reader could recognise, or a
   person the page implies is on Stoop. Nobody is in the one frame that ships
   today. No alt text
   mentions a host, a member, an attendee or a neighbor, and a photograph is
   never placed inside a plan card, a roster, an inbox or a host card.
   `src/lib/photos.test.ts` enforces the alt-text and placement halves of this
   by scanning the tree; the "no identifiable face" half is a judgement made by
   looking at the picture, and is recorded per photograph below.
4. **No text in pictures.** Nothing a visitor needs to read is drawn into an
   image, so translation, zoom and screen readers all still work.
5. **Decorative, and separated by placement.** Every photograph renders with an
   empty alt and no caption, so it adds nothing for a screen reader to repeat and
   nothing for a reader to have explained. The separation from live plan data is
   structural rather than stated: a photograph is a band that fades into the page
   or a layer inside the closing panel, it is never a framed exhibit standing
   next to plans, and the placement scan in `src/lib/photos.test.ts` is what
   holds that down. `Photograph` takes no free-text alt prop; the only wording a
   photograph could ever be given is the `alt` on its record in
   `src/lib/photos.ts`, spoken only where a call site passes `informative`, and
   scanned there for language that would imply a member. Nothing passes
   `informative` today.
6. **Budget.** The one file is 83,062 bytes on disk (81.1 KiB), against the
   800 KB ceiling this pass was given, and under the 148,230 bytes the previous
   release shipped. `photos.test.ts` asserts both, and also that nothing sits in
   `public/photos` that no record references. Exact per-file sizes are in the
   encode table.

## The photograph

It is from StockSnap.io, whose photographs are released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): free for
commercial use, no attribution required. Attribution is recorded here anyway,
because knowing who took a picture is part of knowing you may use it. The
source page was loaded and checked to state the CC0 licence and the creator
named below.

| Local file | Source page | Creator | Licence | Downloaded | Where it appears |
| --- | --- | --- | --- | --- | --- |
| `public/photos/park-path.webp` | https://stocksnap.io/photo/park-trees-1POHVCH6RG | Johannes Plenio | CC0 1.0 | 2026-08-06 | Homepage closing panel |

Discovery was via the Openverse index (https://api.openverse.org/v1/images/,
filtered to `license=cc0,pdm` and `category=photograph`), then each candidate's
own source page was fetched directly and read for the licence line and the
creator before anything was downloaded.

### What it is, and why it is that one

- **park-path.webp**: a dirt path between two rows of trees. Nobody is in the
  frame. It sits inside the closing panel, fading sideways into the ink beside
  the line "The best plans are three blocks away", which is the one place on the
  page where a path going somewhere is the argument rather than the decoration.

### The two that were removed, and why

Provenance for both is kept here rather than silently dropped, so that putting
one back is a decision and not a rediscovery.

- **sidewalk-table.webp** (folding bistro chairs and a small table outside a
  shopfront, Alisa Anton, https://stocksnap.io/photo/tables-chairs-WUM7VBAPS8,
  CC0 1.0, downloaded 2026-08-06, 960 x 640, 51,314 bytes). It ran as a masked
  band under the nameplate and was the first thing on the site. It was not a
  licensing or a content problem either: there were pedestrians on the pavement
  behind the table, the crop cut them off below the shoulder so no face was in
  the frame, and nobody in it was presented as being on Stoop. It was a
  relevance problem. The homepage's job in its first screen is to say what a
  Stoop plan is, and a photograph of furniture outside a shopfront somewhere
  else cannot; it read as an unrelated picture, and on a 320px screen it spent
  104px reading that way before a visitor got to the promise. The band is gone
  and nothing decorative took its place: the drawn board panel that opens the
  page now holds real plans, or the labelled sample.
- **coffee-counter.webp** (a latte on a wooden counter, Carli Jean,
  https://stocksnap.io/photo/coffee-cafelatte-F9A95133A1, CC0 1.0, downloaded
  2026-08-06, 560 x 560, 13,854 bytes) shipped in the visual release and went a
  pass earlier, for a composition reason. Once the captioned figure blocks went,
  the placements left were a full-bleed band and a panel layer: a 560px source
  is soft in any band that runs the width of a desktop, and dark on the ink
  panel it went to mud beside a 960px alternative that was both sharp and on the
  point.

Candidates that were rejected, and why, so the next person does not re-litigate
them: a posed model at a food truck (a recognisable person, reads as a member),
a picnic basket with wine (alcohol, and a date-night cue), a mural basketball
court (palette fights the cream and green), and a bread market stall (good
picture, but its source page no longer resolves, so the licence could not be
verified on the day).

## The encode recipe

Originals were the 960px wide StockSnap CDN renditions
(`https://cdn.stocksnap.io/img-thumbs/960w/<ID>.jpg`). Each was cropped and
re-encoded once, with sharp (already present as a transitive dependency of
Next, so no new package was added):

Sizes are the exact bytes on disk, so a re-encode that drifts is visible here.

| File | Crop | Output | WebP quality | Size on disk |
| --- | --- | --- | --- | --- |
| `park-path.webp` | none (3:2 as shot) | 960 x 640 | 72 | 83,062 bytes |

The 12px blur placeholder inlined in `src/lib/photos.ts` was produced from the
same crop at WebP quality 35. It decodes to 88 bytes, and it exists so a slow
connection shows the shape of the picture rather than an empty box. It is not a
second copy of the asset.

Responsive delivery is Next's: `Photograph` renders `next/image` with `fill`,
real `sizes` per breakpoint, and a box whose shape is set either by an
`aspect-ratio` or by a stated height. Three consequences worth being precise
about. The layout is reserved by that box before any byte arrives, which is what
prevents layout shift. `fill` takes no width or height, so the intrinsic
dimensions recorded in `src/lib/photos.ts` document the file and choose the crop
rather than being handed to the image. And the optimizer re-encodes each
photograph per requested width at request time, so what a given breakpoint
actually costs over the wire is a property of the deployed environment; the only
figures stated here are the ones that can be checked against the repository.

### The resolution ceiling, stated plainly

The original is 960px wide, which was the largest rendition the StockSnap CDN
offered. That ceiling used to bind: the masthead band ran full bleed, so on a
1440px desktop it was painted about 1.5x larger than the pixels behind it, and
more than that on a high density display. With the band gone, nothing on the
site paints a photograph across a full desktop width. The closing panel takes
423 CSS px from a 640px rendition, so it is downscaled and sharp with room to
spare.

The rule survives the case that made it: if a photograph is ever put back on a
surface wider than its source, the fix is a larger CC0 original, not a sharpen
filter and not an upscale.

## Re-encoding, or adding one

1. Find a candidate with a source page that states a CC0 or public domain
   licence and names a creator. If either is missing, stop.
2. Download the original, crop and encode with sharp, and put the file in
   `public/photos`.
3. Add it to `src/lib/photos.ts` with its intrinsic size, alt text (describe the
   scene, never a person's role), a blur placeholder and its credit. There is no
   caption field, and it must not come back: see rule 5.
4. Add a row to the table above, including the download date.
5. Check it against the resolution ceiling above: whatever the widest surface
   paints it at, the file should be at least that many pixels wide.
6. Run `npx vitest run src/lib/photos.test.ts src/components/Photograph.test.tsx`.
   They fail if the file is missing, if the set has grown past its budget or past
   what the previous release shipped, if an unreferenced file is left in
   `public/photos`, if the alt text implies a member, if a caption reappears in
   the data or in the markup, if the provenance is not written down here, or if
   the photograph has been used anywhere other than the marketing surface.

## Provider marks (Google and Apple)

Added by the three-path signup release. These are the only drawings in the app
that are not ours, and the only ones that do not use `currentColor`. They live
in `src/components/ProviderMarks.tsx`, inline, with no runtime dependency and no
network request.

| Mark | Where it came from | Licence / permission | Colors | Geometry |
|---|---|---|---|---|
| Google "G" | Google Identity branding guidelines for "Sign in with Google" (developers.google.com/identity/branding-guidelines). Retrieved 7 August 2026. | Google trademark, used under the branding guidelines for a sign-in button that starts a Google OAuth flow. Not licensed to us; used as permitted, not owned. | `#4285F4`, `#34A853`, `#FBBC05`, `#EA4335` | Four paths on a square `0 0 18 18` canvas |
| Apple logo | Apple "Sign in with Apple" Human Interface Guidelines button specification (developer.apple.com/design/human-interface-guidelines/sign-in-with-apple). Retrieved 7 August 2026. | Apple trademark, used under the Sign in with Apple button guidance. Not licensed to us. | `#000000`, one flat fill | One path on `0 0 814 1000`, taller than wide |

### The rules that come with them

1. **They are the real marks, not lookalikes.** A redrawn Google G or a
   stand-in shape for the Apple logo is not a smaller version of the right
   thing; it is a wrong trademark. To somebody deciding whether to hand over an
   identity, a wrong logo reads as a phishing page. `provider-marks.test.tsx`
   pins the four Google hex values, the single Apple path, and both viewBoxes.
2. **Proportions are preserved.** Both are drawn with a viewBox and a
   `preserveAspectRatio` default, so a square box letterboxes the Apple mark
   rather than stretching it. Squashing a trademark is a misuse.
3. **No recoloring.** The house rule everywhere else is `currentColor`. Here it
   is banned: a green Google G is not the Google G. Apple asks for one flat
   color, and black is the one for a light background. Stoop has no dark mode,
   so there is no second case to handle.
4. **They are decoration.** `aria-hidden="true"`, `focusable="false"`, no
   `<title>`, no `role="img"`. The accessible name is on the parent button
   ("Continue with Google"), which is where a screen reader should hear it once.
5. **No endorsement.** Nothing on the screen or in the file says partner,
   official, approved or endorsed. The buttons say what they do: they start a
   sign-in with that provider.
6. **The label is the provider's name.** "Continue with Google", not "Continue
   with Gmail". A Gmail address signs in through Google; that is said in a
   separate line of body copy, never on the button.
7. **If either company changes its mark or its guidance**, replace the path data
   and update the retrieval date in the table above. Do not tidy, simplify or
   re-trace the geometry.
