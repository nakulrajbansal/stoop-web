import Image from 'next/image';
import type { Photo } from '@/lib/photos';

/**
 * A photograph, placed.
 *
 * The only way a photograph reaches a page. It takes a record from lib/photos
 * rather than a URL, so a call site cannot introduce an image whose provenance
 * and wording have never been checked.
 *
 * DECORATIVE BY DEFAULT, and that is the whole design. Photography on Stoop is
 * atmosphere: it is not plan inventory, and nobody in a frame is a member. The
 * old build said so out loud, in a caption under every picture, which put a
 * disclaimer in the middle of the page and made each photograph read as a
 * standalone exhibit that needed explaining. The separation is now structural
 * instead: a photograph is laid in as a masked band or a panel layer, it never
 * sits inside a plan surface (src/lib/photos.test.ts scans for that), and it
 * announces nothing at all, so the only things a screen reader meets on these
 * pages are the plans themselves.
 *
 * There is deliberately no free-text alt prop. Pass `informative` where a
 * picture carries something the page does not otherwise say and the record's
 * own alt is spoken; every sentence a photograph can ever utter therefore lives
 * in lib/photos, where it is scanned for language that would imply a member.
 *
 * The box is reserved by aspect-ratio before the bytes land, and the image
 * fills it, so a slow photo costs nothing in layout shift.
 */
export default function Photograph({
  photo,
  sizes,
  aspect,
  priority = false,
  informative = false,
  className
}: {
  photo: Photo;
  /** Required: what width this image is actually painted at, per breakpoint. */
  sizes: string;
  /** A fixed ratio for the box. Leave it out to set one per breakpoint in className. */
  aspect?: string;
  priority?: boolean;
  /** Speak the record's alt. Off by default: these are atmosphere. */
  informative?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`photo ${className ?? ''}`}
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      <Image
        src={photo.src}
        alt={informative ? photo.alt : ''}
        fill
        sizes={sizes}
        placeholder="blur"
        blurDataURL={photo.blurDataURL}
        priority={priority}
        // Stated rather than inherited from next/image's default, so a glance
        // at the DOM shows which picture is allowed to block the first paint.
        loading={priority ? undefined : 'lazy'}
      />
    </div>
  );
}
