import sharp from 'sharp';

/**
 * Server-side avatar processing.
 *
 * The upload route used to check two magic bytes (`FF D8`) and store whatever
 * followed. Those two bytes are trivially prefixed to anything, so the public
 * avatars bucket would happily serve arbitrary attacker-chosen content under a
 * .jpg name, and any EXIF the phone attached — including GPS coordinates from
 * the original photo — was stored and served with it.
 *
 * Every upload is now decoded and re-encoded. What lands in the bucket is a
 * fresh JPEG produced here, so:
 *   - anything that is not a real, decodable image is rejected outright;
 *   - no metadata survives (sharp writes none unless asked);
 *   - dimensions and byte size are bounded regardless of what was sent;
 *   - a decompression bomb is refused before it is rasterised.
 *
 * sharp is pinned to a patched release (>= 0.35.0): the libvips CVEs fixed
 * there are exactly the class of bug that matters when you decode untrusted
 * images, and this is the only place Stoop decodes one.
 *
 * What this does NOT do: judge what the picture is *of*. That is stated plainly
 * in the release notes rather than implied. Report + human review is the
 * control for image content.
 */

export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
export const MAX_DIMENSION = 640;
export const MAX_OUTPUT_BYTES = 400 * 1024;
/** Refuse anything that would rasterise larger than this, before decoding it. */
export const MAX_SOURCE_PIXELS = 40_000_000;

export type AvatarResult =
  | { ok: true; buffer: Buffer; width: number; height: number; bytes: number }
  | { ok: false; error: string; status: 400 | 413 };

const ALLOWED_INPUT = new Set(['jpeg', 'jpg', 'png', 'webp', 'heif', 'avif', 'gif', 'tiff']);

export async function processAvatar(input: Buffer): Promise<AvatarResult> {
  if (input.length === 0) return { ok: false, error: 'No photo received', status: 400 };
  if (input.length > MAX_UPLOAD_BYTES) {
    return { ok: false, error: 'Photo too large (6 MB max)', status: 413 };
  }

  let image = sharp(input, {
    // Bound work before any pixels are produced.
    limitInputPixels: MAX_SOURCE_PIXELS,
    // Animated input is flattened to its first frame by default; be explicit.
    animated: false,
    failOn: 'error'
  });

  let meta;
  try {
    meta = await image.metadata();
  } catch {
    return { ok: false, error: 'That file is not a photo Stoop can read.', status: 400 };
  }

  if (!meta.format || !ALLOWED_INPUT.has(meta.format)) {
    return { ok: false, error: 'That file is not a photo Stoop can read.', status: 400 };
  }
  if (!meta.width || !meta.height) {
    return { ok: false, error: 'That file is not a photo Stoop can read.', status: 400 };
  }
  if (meta.width * meta.height > MAX_SOURCE_PIXELS) {
    return { ok: false, error: 'That photo is too large to process.', status: 413 };
  }

  // rotate() with no argument applies the EXIF orientation and then drops it,
  // so the stored image is upright with nothing left to leak.
  image = image.rotate();

  let quality = 82;
  let out: Buffer | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      out = await image
        .clone()
        .resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: 'cover',
          position: 'centre',
          withoutEnlargement: true
        })
        .jpeg({ quality, progressive: true, mozjpeg: true })
        .toBuffer();
    } catch {
      return { ok: false, error: 'Stoop could not process that photo.', status: 400 };
    }
    if (out.length <= MAX_OUTPUT_BYTES) break;
    quality -= 15;
  }

  if (!out) return { ok: false, error: 'Stoop could not process that photo.', status: 400 };
  if (out.length > MAX_OUTPUT_BYTES) {
    return { ok: false, error: 'That photo could not be shrunk enough. Try a simpler one.', status: 413 };
  }

  const finalMeta = await sharp(out).metadata();
  return {
    ok: true,
    buffer: out,
    width: finalMeta.width ?? 0,
    height: finalMeta.height ?? 0,
    bytes: out.length
  };
}
