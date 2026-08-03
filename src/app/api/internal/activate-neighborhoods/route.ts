import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';

export const dynamic = 'force-dynamic';

type NeighborhoodInsert = Database['public']['Tables']['neighborhoods']['Insert'];
type NeighborhoodRow = Database['public']['Tables']['neighborhoods']['Row'];
type OpsInsert = Database['public']['Tables']['ops_items']['Insert'];

const CLAIM_ID = 'fc24a7d4-72d9-4d2d-aa46-ae1b8a3ef947';
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const MAX_LIFETIME_MS = 60 * 60 * 1000;
const NEIGHBORHOODS = [
  { slug: 'lic-waterfront', name: 'LIC Waterfront' },
  { slug: 'sunnyside', name: 'Sunnyside' },
  { slug: 'east-village', name: 'East Village' },
  { slug: 'upper-west-side', name: 'Upper West Side' },
  { slug: 'bed-stuy', name: 'Bed-Stuy' },
] as const;

function denied() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function isAuthorized(req: NextRequest): boolean {
  if (process.env.VERCEL_ENV !== 'production') return false;

  const secret = process.env.NEIGHBORHOOD_MIGRATION_SECRET;
  const expiresAt = process.env.NEIGHBORHOOD_MIGRATION_EXPIRES_AT;
  const match = req.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/);
  const supplied = match?.[1];
  const expiry = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const remaining = expiry - Date.now();

  if (
    !secret || !supplied || !TOKEN_PATTERN.test(secret) ||
    !Number.isFinite(expiry) || remaining <= 0 || remaining > MAX_LIFETIME_MS
  ) {
    return false;
  }

  return timingSafeEqual(digest(supplied), digest(secret));
}

function exactRows(rows: NeighborhoodRow[]): boolean {
  const actual = new Map(rows.map(row => [row.slug, row]));
  return actual.size === NEIGHBORHOODS.length && NEIGHBORHOODS.every(neighborhood => {
    const row = actual.get(neighborhood.slug);
    return row?.name === neighborhood.name && row.active === true;
  });
}

async function markClaim(status: 'blocked' | 'completed', notes: string): Promise<boolean> {
  const terminal = status === 'completed';
  const { data, error } = await supabaseAdmin
    .from('ops_items')
    .update({
      status,
      decision_notes: notes,
      next_action: terminal ? null : 'Inspect the one-shot NYC neighborhood migration failure.',
      completed_at: terminal ? new Date().toISOString() : null,
    } as never)
    .eq('id', CLAIM_ID)
    .eq('status', 'in_progress')
    .select('id, status')
    .single();

  const updated = data as { id: string; status: string } | null;
  return !error && updated?.id === CLAIM_ID && updated.status === status;
}

async function failedMigration(notes: string, error: string) {
  const marked = await markClaim('blocked', notes);
  return NextResponse.json(
    { error: marked ? error : 'Migration claim-state update failed' },
    { status: 500 },
  );
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return denied();

  const claim = {
    id: CLAIM_ID,
    kind: 'task',
    title: 'Activate focused NYC neighborhoods',
    summary: 'One-shot production migration marker for five verified neighborhood rows.',
    status: 'in_progress',
    owner: 'curio',
    priority: 'medium',
    next_action: 'Apply and verify the fixed neighborhood upsert.',
    sort_order: -100,
  } satisfies OpsInsert;

  const { error: claimError } = await supabaseAdmin
    .from('ops_items')
    .insert(claim as never);

  if (claimError?.code === '23505') {
    return NextResponse.json({ error: 'Already claimed' }, { status: 409 });
  }
  if (claimError) {
    return NextResponse.json({ error: 'Migration claim failed' }, { status: 500 });
  }

  const { data: city, error: cityError } = await supabaseAdmin
    .from('cities')
    .select('id')
    .eq('slug', 'nyc')
    .single();

  const cityRow = city as { id: string } | null;
  if (cityError || !cityRow) {
    return failedMigration(
      'NYC city row unavailable. No neighborhood write attempted.',
      'NYC city row unavailable',
    );
  }

  const rows = NEIGHBORHOODS.map(neighborhood => ({
    city_id: cityRow.id,
    slug: neighborhood.slug,
    name: neighborhood.name,
    active: true,
  })) satisfies NeighborhoodInsert[];

  const { error: upsertError } = await supabaseAdmin
    .from('neighborhoods')
    .upsert(rows as never, { onConflict: 'city_id,slug' });

  if (upsertError) {
    return failedMigration(
      'Neighborhood upsert failed. Inspect production rows before retrying manually.',
      'Neighborhood upsert failed',
    );
  }

  const { data: verified, error: verifyError } = await supabaseAdmin
    .from('neighborhoods')
    .select('id, city_id, slug, name, active')
    .eq('city_id', cityRow.id)
    .in('slug', NEIGHBORHOODS.map(neighborhood => neighborhood.slug));

  const verifiedRows = (verified ?? []) as unknown as NeighborhoodRow[];
  if (verifyError || !exactRows(verifiedRows)) {
    return failedMigration(
      'Neighborhood verification failed after upsert. Inspect production rows.',
      'Neighborhood verification failed',
    );
  }

  const claimCompleted = await markClaim('completed', 'Five NYC neighborhood rows applied and verified.');
  if (!claimCompleted) {
    return NextResponse.json({ error: 'Migration finalization failed' }, { status: 500 });
  }

  return NextResponse.json({
    applied: true,
    verifiedRows: verifiedRows.length,
    neighborhoods: NEIGHBORHOODS.map(neighborhood => neighborhood.name),
  });
}

export const GET = denied;
export const HEAD = denied;
export const OPTIONS = denied;
export const PUT = denied;
export const PATCH = denied;
export const DELETE = denied;
