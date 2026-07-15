'use client';

import { useState } from 'react';

// Profile photos live in the public "avatars" storage bucket at {userId}.jpg,
// so any surface can build the URL from a user id alone (no DB column needed).
export function avatarSrc(userId: string, version?: number | string | null): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/avatars/${userId}.jpg${version ? `?v=${version}` : ''}`;
}

type Props = {
  userId?: string | null;
  name?: string | null;
  initials?: string | null;
  bg?: string | null;
  fg?: string | null;
  size: number;
  radius?: number;
  version?: number | string | null;
  className?: string;
};

// One avatar for the whole app: shows the person's photo when they have one,
// falls back to their initials block when they don't (or while it loads).
export default function Avatar({ userId, name, initials, bg, fg, size, radius, version, className }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(userId) && !failed;

  return (
    <span
      className={`relative inline-flex items-center justify-center font-semibold flex-shrink-0 overflow-hidden ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.28),
        background: bg ?? '#eee',
        color: fg ?? '#666',
        fontSize: Math.max(10, Math.round(size * 0.34))
      }}
    >
      {!(showPhoto && loaded) && (initials || name?.[0]?.toUpperCase() || '?')}
      {showPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarSrc(userId!, version)}
          alt={name ? `${name}'s photo` : ''}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
