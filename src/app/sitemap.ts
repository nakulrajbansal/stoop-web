import type { MetadataRoute } from 'next';
import { supabasePublic } from '@/lib/supabase/public';

const BASE = 'https://www.stoop.house';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/feed`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE}/post`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/terms`, changeFrequency: 'yearly', priority: 0.2 }
  ];

  const { data: cities } = await supabasePublic.from('cities').select('id, slug');
  const { data: hoods } = await supabasePublic.from('neighborhoods').select('slug, city_id');
  const citySlug = new Map(((cities ?? []) as any[]).map(c => [c.id, c.slug]));

  for (const c of (cities ?? []) as any[]) {
    entries.push({ url: `${BASE}/${c.slug}`, changeFrequency: 'daily', priority: 0.8 });
  }
  for (const h of (hoods ?? []) as any[]) {
    const cs = citySlug.get(h.city_id);
    if (cs) entries.push({ url: `${BASE}/${cs}/${h.slug}`, changeFrequency: 'daily', priority: 0.7 });
  }

  return entries;
}
