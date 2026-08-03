import { NextRequest, NextResponse } from 'next/server';
import { getRouteAuth, requireUser } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { suspensionGate } from '@/lib/moderation';
import { MAX_UPLOAD_BYTES, processAvatar } from '@/lib/avatar-processing';

const BUCKET = 'avatars';

// sharp is a native module; this route cannot run on the edge runtime.
export const runtime = 'nodejs';

// The bucket is created by the app on first use so there is no manual
// Supabase setup step. Public read; writes only happen through this route,
// each user to their own {userId}.jpg.
async function ensureBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_UPLOAD_BYTES,
    allowedMimeTypes: ['image/jpeg']
  });
  // A concurrent first upload can lose the create race; that is fine.
  if (error && !/already exists/i.test(error.message)) throw error;
}

export async function POST(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const user = auth.user!;

  const suspended = await suspensionGate(user.id);
  if (suspended) return suspended;

  let file: Blob | null = null;
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f instanceof Blob) file = f;
  } catch {
    // fall through to the invalid-input response
  }
  if (!file) return NextResponse.json({ error: 'No photo received' }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Photo too large (6 MB max)' }, { status: 413 });
  }

  // Decode and re-encode server side. Nothing the client sent is stored: what
  // lands in the public bucket is a JPEG this process produced, stripped of
  // metadata and bounded in size. See @/lib/avatar-processing.
  const processed = await processAvatar(Buffer.from(await file.arrayBuffer()));
  if (!processed.ok) {
    return NextResponse.json({ error: processed.error }, { status: processed.status });
  }

  try {
    await ensureBucket();
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(`${user.id}.jpg`, processed.buffer, {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '300'
      });
    if (error) throw error;
  } catch (e) {
    console.error('avatar upload failed:', e);
    return NextResponse.json({ error: 'Could not save your photo. Try again.' }, { status: 500 });
  }

  // version lets the client bust the browser cache right after an upload
  return NextResponse.json({ ok: true, version: Date.now() });
}

export async function DELETE(req: NextRequest) {
  const auth = await getRouteAuth(req);
  const denied = requireUser(auth);
  if (denied) return denied;
  const user = auth.user!;

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([`${user.id}.jpg`]);
  if (error) {
    console.error('avatar delete failed:', error);
    return NextResponse.json({ error: 'Could not remove your photo' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
