// Client-side photo preparation: center square crop + resize to 512px JPEG.
// Keeps uploads small and predictable regardless of what the camera produced.
// Browser-only (uses canvas); call it from client components.

export const AVATAR_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export async function toAvatarJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that image. Try a JPG or PNG.'));
      i.src = url;
    });

    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('Could not read that image. Try a JPG or PNG.');

    const out = Math.min(512, side);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that image.');

    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      out,
      out
    );

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Could not process that image.');
    if (blob.size > AVATAR_MAX_UPLOAD_BYTES) throw new Error('That photo is too large.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
