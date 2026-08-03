export type NeighborhoodOption = {
  slug: string;
  name: string;
};

export const CITY_NEIGHBORHOODS: Record<string, readonly NeighborhoodOption[]> = {
  nyc: [
    { slug: 'williamsburg', name: 'Williamsburg' },
    { slug: 'west-village', name: 'West Village' },
    { slug: 'upper-west-side', name: 'Upper West Side' },
    { slug: 'park-slope', name: 'Park Slope' },
    { slug: 'lower-east-side', name: 'Lower East Side' },
    { slug: 'east-village', name: 'East Village' },
    { slug: 'astoria', name: 'Astoria' },
    { slug: 'lic-waterfront', name: 'LIC Waterfront' },
    { slug: 'sunnyside', name: 'Sunnyside' },
    { slug: 'bushwick', name: 'Bushwick' },
    { slug: 'bed-stuy', name: 'Bed-Stuy' },
    { slug: 'greenpoint', name: 'Greenpoint' },
    { slug: 'harlem', name: 'Harlem' }
  ],
  austin: [
    { slug: 'east-austin', name: 'East Austin' },
    { slug: 'south-congress', name: 'South Congress' },
    { slug: 'mueller', name: 'Mueller' },
    { slug: 'hyde-park', name: 'Hyde Park' },
    { slug: 'east-cesar-chavez', name: 'East Cesar Chavez' },
    { slug: 'clarksville', name: 'Clarksville' }
  ]
};

export function neighborhoodsForCity(city: string): readonly NeighborhoodOption[] {
  return CITY_NEIGHBORHOODS[city] ?? [];
}
