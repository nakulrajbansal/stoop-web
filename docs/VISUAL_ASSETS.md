# Visual assets

Where every picture on Stoop comes from, and the rules the pictures live under.

Two kinds of visual exist in this repo and they are not interchangeable:

- **Authored drawings.** Inline SVG written by hand, in
  `src/components/CategoryArt.tsx` (the seven categories) and
  `src/components/StoopArt.tsx` (the noticeboard vocabulary: pinned paper, a
  conversation, a host deciding, a table, an empty board, an outage). They are
  ours, they cost no request, and they are the only visual allowed on a surface
  that carries a plan or a person.
- **Photographs.** Two of them, both CC0, both downloaded and re-encoded into
  `public/photos`, both used on the homepage only. Every use goes through
  `src/components/Photograph.tsx`, which renders them decoratively: empty alt,
  no caption, laid into the page as a masked band or as a layer inside a panel.

## Rules

1. **Local only.** Photographs are committed to `public/photos`. Nothing is
   fetched from a remote image host at runtime, and `next.config.js` has no
   `remotePatterns`, so a third party cannot become a dependency of the page.
2. **Provenance or it does not ship.** Each photograph below has a source page
   that states its licence, a named creator, and a download date. A candidate
   whose source page could not be loaded and read was dropped rather than used.
3. **Never a member.** The enforceable rule is this: no photograph may show an
   identifiable face, and nobody appearing in one may be presented as a member,
   a host or an attendee. A frame may contain people (the hero has distant,
   blurred pedestrians on the pavement); what it may not contain is a person a
   reader could recognise, or a person the page implies is on Stoop. No alt text
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
6. **Budget.** The two files are 134,376 bytes on disk (131.2 KiB), against the
   800 KB ceiling this pass was given, and under the 148,230 bytes the previous
   release shipped. `photos.test.ts` asserts both, and also that nothing sits in
   `public/photos` that no record references. Exact per-file sizes are in the
   encode table.

## The photographs

Both are from StockSnap.io, whose photographs are released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): free for
commercial use, no attribution required. Attribution is recorded here anyway,
because knowing who took a picture is part of knowing you may use it. Each
source page was loaded and checked to state the CC0 licence and the creator
named below.

| Local file | Source page | Creator | Licence | Downloaded | Where it appears |
| --- | --- | --- | --- | --- | --- |
| `public/photos/sidewalk-table.webp` | https://stocksnap.io/photo/tables-chairs-WUM7VBAPS8 | Alisa Anton | CC0 1.0 | 2026-08-06 | Homepage masthead band |
| `public/photos/park-path.webp` | https://stocksnap.io/photo/park-trees-1POHVCH6RG | Johannes Plenio | CC0 1.0 | 2026-08-06 | Homepage closing panel |

Discovery was via the Openverse index (https://api.openverse.org/v1/images/,
filtered to `license=cc0,pdm` and `category=photograph`), then each candidate's
own source page was fetched directly and read for the licence line and the
creator before anything was downloaded.

### What each one is, and why it is that one

- **sidewalk-table.webp**: folding bistro chairs and a small table outside a
  shopfront. It is the storefront detail the brief asked for, and it says "sit
  down with someone" through the furniture rather than through people. It is
  not an empty street: there are pedestrians on the pavement behind the table.
  The crop cuts them off below the shoulder, so no head and no face is in the
  frame at all, and they are out of focus besides. The subject is the empty
  table, and nobody in the frame is presented as being on Stoop.
- **park-path.webp**: a dirt path between two rows of trees. Nobody is in the
  frame. It sits inside the closing panel, fading sideways into the ink beside
  the line "The best plans are three blocks away", which is the one place on the
  page where a path going somewhere is the argument rather than the decoration.

A third photograph, `coffee-counter.webp` (a latte on a wooden counter, Carli
Jean, https://stocksnap.io/photo/coffee-cafelatte-F9A95133A1, CC0 1.0,
downloaded 2026-08-06, 560 x 560, 13,854 bytes), shipped in the visual release
and was removed here. It was not a licensing or a content problem, it was a
composition one. Once the captioned figure blocks went, the placements left were
a full-bleed band and a panel layer: a 560px source is soft in any band that runs
the width of a desktop, and dark on the ink panel it went to mud beside a 960px
alternative that was both sharp and on the point. Its provenance is kept here
rather than silently dropped, so that putting it back is a decision and not a
rediscovery.

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
| `sidewalk-table.webp` | none (3:2 as shot) | 960 x 640 | 72 | 51,314 bytes |
| `park-path.webp` | none (3:2 as shot) | 960 x 640 | 72 | 83,062 bytes |

The 12px blur placeholders inlined in `src/lib/photos.ts` were produced from the
same crops at WebP quality 35. They decode to 88 bytes each, and they exist so a
slow connection shows the shape of the picture rather than an empty box. They are
not a second copy of the asset.

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

Both originals are 960px wide, which was the largest rendition the StockSnap CDN
offered. The masthead band runs full bleed, so on a 1440px desktop it is painted
about 1.5x larger than the pixels behind it, and more than that on a high density
display. Measured in Chrome at 1440 x 900: the optimizer serves the 960px file
(w=1920 is requested and capped at the source width) painted across 1440 CSS px.
It is soft, and the role tolerates it, because the band is desaturated, masked at
both edges and 188px tall. If that stops being acceptable the fix is a larger CC0
original, not a sharpen filter and not an upscale. The closing panel has no such
problem: it paints 423 CSS px from a 640px rendition, so it is downscaled and
sharp.

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
