import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isSuspended } from '@/lib/moderation';

const BUCKET = 'avatars';
const MAX_BYTES = 2 * 1024 * 1024;

// The bucket is created by the app on first use so there is no manual
// Supabase setup step. Public read; writes only happen through this route,
// each user to their own {userId}.jpg.
async function ensureBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: ['image/jpeg']
  });
  // A concurrent first upload can lose the create race; that is fine.
  if (error && !/already exists/i.test(error.message)) throw error;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (await isSuspended(user.id)) {
    return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
  }

  let file: Blob | null = null;
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f instanceof Blob) file = f;
  } catch {
    // fall through to the invalid-input response
  }
  if (!file) return NextResponse.json({ error: 'No photo received' }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Photo too large (2 MB max)' }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  // The client always sends a canvas-produced JPEG; verify the magic bytes
  // so nothing else can be parked in the public bucket.
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return NextResponse.json({ error: 'Not a valid photo' }, { status: 400 });
  }

  try {
    await ensureBucket();
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(`${user.id}.jpg`, buf, {
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

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([`${user.id}.jpg`]);
  if (error) {
    console.error('avatar delete failed:', error);
    return NextResponse.json({ error: 'Could not remove your photo' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
