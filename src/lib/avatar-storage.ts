/**
 * Removing a member's profile photo from the public `avatars` bucket.
 *
 * The account-deletion route did this inside a try/catch and called it
 * "non-fatal if there was none". Supabase Storage's `remove()` does not throw
 * on a failed delete — it resolves with `{ data, error }` — so the catch never
 * ran and a failure was indistinguishable from a success. Account deletion then
 * carried on and destroyed the auth user, which is the row every other delete
 * cascades from. The photo is in a PUBLIC bucket, keyed by user id, so what was
 * left behind was a face still served to anyone with the URL, belonging to an
 * account that no longer existed to retry the deletion.
 *
 * The result is checked now, and an operational failure stops the deletion
 * before anything irreversible happens. An object that is genuinely not there
 * is success: there is nothing to orphan, and a member who never uploaded a
 * photo must still be able to delete their account.
 */

export type AvatarRemoval =
  | { ok: true; existed: boolean }
  | { ok: false; reason: string };

type RemoveResult = { data: unknown; error: { message?: string } | null };

export type AvatarStorage = {
  from(bucket: string): { remove(paths: string[]): PromiseLike<RemoveResult> };
};

export const AVATAR_BUCKET = 'avatars';

export function avatarObjectPath(userId: string): string {
  return `${userId}.jpg`;
}

/**
 * Storage answers a missing object in more than one shape depending on version
 * and on whether the request reached the object API at all. Anything that reads
 * as "not there" is treated as done; everything else is an operational failure.
 */
export function isMissingObjectError(error: { message?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? '';
  if (!message) return false;
  return (
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('no such') ||
    message.includes('nosuchkey')
  );
}

export async function removeAvatarObject(
  storage: AvatarStorage,
  userId: string
): Promise<AvatarRemoval> {
  let result: RemoveResult;
  try {
    result = await storage.from(AVATAR_BUCKET).remove([avatarObjectPath(userId)]);
  } catch (e) {
    // A thrown transport error is still a failure, not an absent object.
    return { ok: false, reason: e instanceof Error ? e.message : 'Storage request failed' };
  }

  if (result?.error) {
    if (isMissingObjectError(result.error)) return { ok: true, existed: false };
    return { ok: false, reason: result.error.message ?? 'Storage delete failed' };
  }

  // A successful call returns the objects it removed. An empty list means there
  // was nothing there, which is the other way Storage reports a missing object.
  const removed = Array.isArray(result?.data) ? result.data.length : 0;
  return { ok: true, existed: removed > 0 };
}
