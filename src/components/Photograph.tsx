import Image from 'next/image';
import type { Photo } from '@/lib/photos';

/**
 * A photograph, framed and captioned.
 *
 * The only way a photograph reaches a page. It takes a record from lib/photos
 * rather than a URL, so the alt text and the caption cannot be forgotten at a
 * call site.
 *
 * The caption is not optional, and there is deliberately no prop to turn it
 * off. "Photograph, not a plan" is the one thing keeping editorial atmosphere
 * visibly separate from live plan data, and an opt-out is exactly how that rule
 * quietly stops being true on one surface. A caption that needs different
 * colour on a dark panel says so with captionClassName; it still says it.
 *
 * The box is reserved by aspect-ratio before the bytes land, and the image
 * fills it, so a slow photo costs nothing in layout shift.
 */
export default function Photograph({
  photo,
  sizes,
  aspect,
  priority = false,
  className,
  frameClassName,
  captionClassName
}: {
  photo: Photo;
  /** Required: what width this image is actually painted at, per breakpoint. */
  sizes: string;
  /** A fixed ratio for the frame. Leave it out to set one per breakpoint in frameClassName. */
  aspect?: string;
  priority?: boolean;
  className?: string;
  frameClassName?: string;
  /** Restyle the caption (a dark panel needs light type). Never hide it. */
  captionClassName?: string;
}) {
  return (
    <figure className={className}>
      <div
        className={`photo-frame ${frameClassName ?? ''}`}
        style={aspect ? { aspectRatio: aspect } : undefined}
      >
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes={sizes}
          placeholder="blur"
          blurDataURL={photo.blurDataURL}
          priority={priority}
        />
      </div>
      <figcaption
        className={`text-[10.5px] font-mono uppercase tracking-[0.1em] mt-2 ${
          captionClassName ?? 'text-muted'
        }`}
      >
        {photo.caption}
      </figcaption>
    </figure>
  );
}
