-- Focused NYC neighborhood expansion. Safe to re-run.
INSERT INTO public.neighborhoods (city_id, slug, name, active)
SELECT c.id, v.slug, v.name, true
FROM public.cities c
CROSS JOIN (VALUES
  ('lic-waterfront', 'LIC Waterfront'),
  ('sunnyside', 'Sunnyside'),
  ('east-village', 'East Village'),
  ('upper-west-side', 'Upper West Side'),
  ('bed-stuy', 'Bed-Stuy')
) AS v(slug, name)
WHERE c.slug = 'nyc'
ON CONFLICT (city_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    active = true;
