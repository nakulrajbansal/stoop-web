import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendWelcome } from '@/lib/resend';
import { NAME_MAX, deriveInitials, normalizeFullName, publicDisplayName } from '@/lib/profile-identity';

/**
 * Your own profile, for the one screen that may see it.
 *
 * profiles.name is the private full name, and the postdeploy hardening
 * migration revokes it from anon and authenticated. /profile used to select it
 * straight from the browser, so after that migration the row came back denied,
 * the page read that as "no profile" and pushed a signed-in person to /auth.
 *
 * This route is the replacement authority, and the whole point of it is what it
 * refuses to accept: there is no profile id in the request contract. Not in the
 * path, not in the query string, not in the body. The only id it will ever use
 * is the one on the verified session, so there is nothing to tamper with. It
 * reads and writes with the service role because that is the only role that may
 * still see the column, and it answers every failure with fixed copy: a
 * database error must not describe the schema to whoever provoked it.
 *
 * auth.uid() is not reliable in this app's server routes, so the session is
 * verified here and the reads are done with the admin client.
 */
export const dynamic = 'force-dynamic';

const COPY = {
  unauthorized: 'Sign in to see your profile.',
  missing: 'Profile not found.',
  name: 'Your name is required.',
  nameLong: `Your name has to be ${NAME_MAX} characters or fewer.`,
  place: 'Pick your city and neighborhood.',
  body: 'Could not read that request.',
  read: 'Could not load your profile right now. Try again in a moment.',
  write: 'Could not save your profile right now. Try again in a moment.',
  // POST only. Each one is fixed copy: a database error must not describe the
  // schema, and an identity refusal must not describe the identity.
  provider: 'Pick a way to sign up.',
  email: 'A valid email is required for notifications.',
  rejected: 'Some of that could not be saved. Check your details and try again.',
  identity: 'We could not verify that sign in. Try again, or use your phone number.',
  duplicate: 'That phone number is already on Stoop. Sign in with it instead.',
  create: 'Could not create your account right now. Try again in a moment.'
} as const;

/** The three ways in. A claim, not a fact: the database re-checks it. */
const PROVIDERS = ['phone', 'google', 'apple'] as const;
type Provider = (typeof PROVIDERS)[number];

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' };

// Everything the editor is allowed to see. phone_e164, notify_email, blocked_at
// and the rest stay out of it: this is the edit screen, not an account dump.
const EDITABLE = `
  id, name, display_name, about, city_id, neighborhood_id, initials,
  avatar_bg, avatar_fg, is_founding_member,
  city:cities(slug, name),
  neighborhood:neighborhoods(slug, name)
`;

type ProfileRow = {
  id: string;
  name: string;
  display_name: string | null;
  about: string | null;
  city_id: string | null;
  neighborhood_id: string | null;
  initials: string | null;
  avatar_bg: string;
  avatar_fg: string;
  is_founding_member: boolean;
  city: { slug: string; name: string } | null;
  neighborhood: { slug: string; name: string } | null;
};

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: COPY.unauthorized }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(EDITABLE)
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('profile read failed:', error);
    return NextResponse.json({ error: COPY.read }, { status: 503 });
  }

  const profile = data as ProfileRow | null;
  if (!profile) return NextResponse.json({ error: COPY.missing }, { status: 404 });

  return NextResponse.json(
    {
      profile: {
        id: profile.id,
        name: profile.name,
        displayName: profile.display_name ?? publicDisplayName(profile.name),
        about: profile.about,
        city_id: profile.city_id,
        neighborhood_id: profile.neighborhood_id,
        initials: profile.initials,
        avatar_bg: profile.avatar_bg,
        avatar_fg: profile.avatar_fg,
        is_founding_member: profile.is_founding_member,
        city: profile.city,
        neighborhood: profile.neighborhood
      }
    },
    { headers: PRIVATE_HEADERS }
  );
}

/**
 * Making an account.
 *
 * Until this release the browser inserted its own profiles row: it chose the
 * id, the phone number, the timestamp claiming that number was verified, and
 * the address every notification would go to. An RLS policy pinned the id to
 * auth.uid(), which made the id honest and nothing else.
 *
 * That was survivable while a verified phone was the only door. It stops being
 * survivable the moment a Google session exists, because there is no verified
 * number in the row to anchor anything to, and "which provider is this" would
 * become a string the client sends about itself.
 *
 * So this route is deliberately thin, and none of the thinking happens here. It
 * proves who is asking (from the session, never from the body), bounds what
 * they typed, and hands it to create_profile_for_verified_identity, which goes
 * and asks auth.users and auth.identities what actually happened. This route
 * cannot decide that an identity is verified. It only sees a form.
 *
 * Two things it refuses to carry. There is no actor id in the request contract,
 * anywhere. And a Google or Apple signup's notification address is not
 * forwarded even if the body contains one: the provider owns that address, and
 * the function would refuse a competing one anyway.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: COPY.unauthorized }, { status: 401, headers: PRIVATE_HEADERS });
  }

  const fail = (message: string, status: number) =>
    NextResponse.json({ error: message }, { status, headers: PRIVATE_HEADERS });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(COPY.body, 400);
  }

  const claimed = body?.provider;
  if (typeof claimed !== 'string' || !PROVIDERS.includes(claimed as Provider)) {
    return fail(COPY.provider, 400);
  }
  const provider = claimed as Provider;

  // The same normalizer the editor and the database use, so the generated
  // public name really is a first name whichever door somebody came through.
  const name = normalizeFullName(body?.name);
  if (!name) return fail(COPY.name, 400);
  if (name.length > NAME_MAX) return fail(COPY.nameLong, 400);

  const citySlug = typeof body?.city === 'string' ? body.city : '';
  const hoodSlug = typeof body?.neighborhood === 'string' ? body.neighborhood : '';
  if (!citySlug || !hoodSlug) return fail(COPY.place, 400);

  const about = typeof body?.about === 'string' ? body.about.trim().slice(0, 140) : '';

  // Only a phone signup carries an email, because only a phone signup has no
  // provider address to use instead. For Google and Apple this stays null and
  // the function reads the authoritative one out of auth.
  let notifyEmail: string | null = null;
  if (provider === 'phone') {
    const typed = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_SHAPE.test(typed) || typed.length > 254) return fail(COPY.email, 400);
    notifyEmail = typed;
  }

  // Not how the number is chosen. The function takes that from auth.users; this
  // is a second chance to notice that a session and a form have come apart.
  const phone = provider === 'phone' && typeof body?.phone === 'string' ? body.phone : null;

  const { data, error } = await supabaseAdmin.rpc('create_profile_for_verified_identity', {
    p_actor: user.id,
    p_provider: provider,
    p_name: name,
    p_city_slug: citySlug,
    p_neighborhood_slug: hoodSlug,
    p_about: about || null,
    p_notify_email: notifyEmail,
    p_phone: phone
  });

  if (error) {
    const code = (error as { code?: string }).code ?? '';
    // Two numbers on one account is the one failure worth naming, because the
    // person can act on it and the action is "sign in instead".
    if (code === '23505') return fail(COPY.duplicate, 409);
    if (code === '42501') return fail(COPY.identity, 403);
    if (code === '22023') return fail(COPY.rejected, 400);
    console.error('profile create failed:', code);
    return fail(COPY.create, 503);
  }

  const created = data as {
    id: string;
    name: string;
    display_name: string | null;
    initials: string | null;
    notify_email: string | null;
    created: boolean;
  } | null;

  if (!created?.id) {
    console.error('profile create returned no row');
    return fail(COPY.create, 503);
  }

  // The welcome email moved behind this boundary. It used to be a fetch from
  // the browser carrying an address and a name of its own choosing, which meant
  // anyone with a session could send a Stoop-branded welcome to anybody. The
  // recipient is now what Postgres actually stored, and it is sent once: a
  // repeat submit returns created: false and no second email.
  if (created.created && created.notify_email) {
    try {
      await sendWelcome(created.notify_email, created.name);
    } catch (err) {
      // A quiet mailer is not a reason to fail an account that exists.
      console.error('welcome email failed after signup');
    }
  }

  return NextResponse.json(
    {
      ok: true,
      created: created.created,
      profile: {
        displayName: created.display_name ?? publicDisplayName(created.name),
        initials: created.initials
      }
    },
    { headers: PRIVATE_HEADERS }
  );
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: COPY.unauthorized }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: COPY.body }, { status: 400 });
  }

  // The name is normalized before it is stored, not after it is read. The
  // public projection is generated from this column, so a name joined by an
  // unusual space would otherwise put the surname on every plan card.
  const name = normalizeFullName(body?.name);
  if (!name) return NextResponse.json({ error: COPY.name }, { status: 400 });
  if (name.length > NAME_MAX) return NextResponse.json({ error: COPY.nameLong }, { status: 400 });

  const citySlug = typeof body?.city === 'string' ? body.city : '';
  const hoodSlug = typeof body?.neighborhood === 'string' ? body.neighborhood : '';
  if (!citySlug || !hoodSlug) return NextResponse.json({ error: COPY.place }, { status: 400 });

  const { data: cityRow } = await supabaseAdmin
    .from('cities')
    .select('id')
    .eq('slug', citySlug)
    .maybeSingle();
  const city = cityRow as { id: string } | null;
  if (!city) return NextResponse.json({ error: COPY.place }, { status: 400 });

  // Resolved against the chosen city, so a neighborhood id cannot be pointed at
  // a place in the other one.
  const { data: hoodRow } = await supabaseAdmin
    .from('neighborhoods')
    .select('id')
    .eq('city_id', city.id)
    .eq('slug', hoodSlug)
    .maybeSingle();
  const hood = hoodRow as { id: string } | null;
  if (!hood) return NextResponse.json({ error: COPY.place }, { status: 400 });

  const about = typeof body?.about === 'string' ? body.about.trim().slice(0, 140) : '';

  // An explicit column list, built here rather than spread from the body: an
  // editor that took the body's keys would let anyone grant themselves the
  // founding badge or rewrite their notification address. display_name is
  // absent because the database generates it and will reject a write to it.
  const patch = {
    name,
    city_id: city.id,
    neighborhood_id: hood.id,
    about: about || null,
    initials: deriveInitials(name)
  };

  // The generated column comes back in the same statement, so what the client
  // is told about its public identity is what Postgres actually stored.
  const { data, error } = await (supabaseAdmin.from('profiles') as any)
    .update(patch)
    .eq('id', user.id)
    .select('name, display_name, initials')
    .maybeSingle();

  if (error) {
    console.error('profile write failed:', error);
    return NextResponse.json({ error: COPY.write }, { status: 503 });
  }

  const saved = data as { name: string; display_name: string | null; initials: string | null } | null;
  if (!saved) return NextResponse.json({ error: COPY.missing }, { status: 404 });

  return NextResponse.json(
    {
      ok: true,
      profile: {
        name: saved.name,
        displayName: saved.display_name ?? publicDisplayName(saved.name),
        initials: saved.initials
      }
    },
    { headers: PRIVATE_HEADERS }
  );
}
