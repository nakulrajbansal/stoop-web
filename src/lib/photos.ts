/**
 * The photographs, in one place.
 *
 * Three of them, all local under public/photos, all CC0, all editorial
 * atmosphere. Provenance for each (source page, creator, licence, the crop and
 * encode recipe, the day it was downloaded) is recorded in docs/VISUAL_ASSETS.md.
 *
 * Two rules govern where these may appear, and they are the reason this file
 * exists rather than a string in a component:
 *
 *  1. A photograph is never plan data. It carries a caption saying so, it is
 *     never placed inside a plan card or a roster, and nothing on the page may
 *     read it as "who is going". Nobody in these frames is a member, a host or
 *     a participant, and no frame shows an identifiable face.
 *  2. Nothing here may shift a page while it loads. Photograph renders these
 *     with next/image in `fill` mode, which does not take width and height at
 *     all: the frame reserves the space with an aspect-ratio box and the image
 *     fills it, so the layout is settled before any byte arrives. The width and
 *     height below are the real intrinsic pixels of the file. They document
 *     what was encoded and let a caller pick an honest aspect ratio; they are
 *     not passed to the image.
 */

export type Photo = {
  src: string;
  width: number;
  height: number;
  /** Describes the photograph itself. Never implies a plan or a person. */
  alt: string;
  /** The visible line that keeps the picture separate from live plan data. */
  caption: string;
  /** 12px WebP, inlined: 88 to 104 bytes each, and it removes the empty flash. */
  blurDataURL: string;
  credit: { creator: string; source: string; license: string };
};

const CC0 = 'CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)';

export const PHOTOS = {
  sidewalkTable: {
    src: '/photos/sidewalk-table.webp',
    width: 960,
    height: 640,
    alt: 'Folding bistro chairs and a small table set out on a sidewalk beside a shopfront window.',
    caption: 'Photograph, not a plan',
    blurDataURL:
      'data:image/webp;base64,UklGRlQAAABXRUJQVlA4IEgAAADQAQCdASoMAAgAA8BgJYwCdADZoRp/AAD8FS36OOjK7et3G3quuI+lqu+FW9Xh96Do1nrbhs0DeVLg7kUxF9fwghkSp4frgAA=',
    credit: {
      creator: 'Alisa Anton',
      source: 'https://stocksnap.io/photo/tables-chairs-WUM7VBAPS8',
      license: CC0
    }
  },
  coffeeCounter: {
    src: '/photos/coffee-counter.webp',
    width: 560,
    height: 560,
    alt: 'A latte in a dark cup and saucer on a wooden cafe counter, next to a brass service bell.',
    caption: 'Photograph, not a plan',
    blurDataURL:
      'data:image/webp;base64,UklGRmAAAABXRUJQVlA4IFQAAAAQAgCdASoMAAwAA8BgJZgCdAEOz37lsbgAAP7vaOQfFgSjKs6vXNHshkVIBtOTyvU3D5M6sv0EOvfvmdapAvJtp1fatQsTdsa4zAg5/YamlYPAAAA=',
    credit: {
      creator: 'Carli Jean',
      source: 'https://stocksnap.io/photo/coffee-cafelatte-F9A95133A1',
      license: CC0
    }
  },
  parkPath: {
    src: '/photos/park-path.webp',
    width: 960,
    height: 640,
    alt: 'A narrow dirt path running between two rows of old trees, with grass on either side.',
    caption: 'Photograph, not a plan',
    blurDataURL:
      'data:image/webp;base64,UklGRlAAAABXRUJQVlA4IEQAAACwAQCdASoMAAgAA8BgJbACdADZnSRgAP7vJvT3do3qlr0wzLx/nh4GxXobuvhacwE8RbTths3SITBLp8LJq7TqGRgAAA==',
    credit: {
      creator: 'Johannes Plenio',
      source: 'https://stocksnap.io/photo/park-trees-1POHVCH6RG',
      license: CC0
    }
  }
} as const satisfies Record<string, Photo>;

export const ALL_PHOTOS: readonly Photo[] = Object.values(PHOTOS);
