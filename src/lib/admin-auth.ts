import { createClient } from '@/lib/supabase/server';

// Single source of truth for the founder-only gate used by /admin/*.
// Returns the signed-in admin user, or null for everyone else (including
// signed-out visitors and any signed-in member who is not the founder).
export async function getAdminUser() {
  const adminUserId = process.env.ADMIN_USER_ID;
  if (!adminUserId) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== adminUserId) return null;

  return user;
}

export async function isAdminRequest(): Promise<boolean> {
  return (await getAdminUser()) !== null;
}
