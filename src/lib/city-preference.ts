'use client';

import { useEffect, useState } from 'react';

const KEY = 'stoop_city';
const EVENT = 'stoop:city-changed';
export type CityPref = 'nyc' | 'austin' | null;

export function getCityPreference(): CityPref {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(KEY);
  return v === 'nyc' || v === 'austin' ? v : null;
}

export function setCityPreference(c: CityPref) {
  if (typeof window === 'undefined') return;
  if (c) localStorage.setItem(KEY, c); else localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: c }));
}

export function useCityPreference() {
  const [city, setCity] = useState<CityPref>(null);
  useEffect(() => {
    setCity(getCityPreference());
    const handler = (e: Event) => setCity((e as CustomEvent).detail);
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  return [city, setCityPreference] as const;
}

export function cityLabel(c: CityPref): string {
  if (c === 'austin') return 'Austin';
  if (c === 'nyc') return 'New York';
  return 'Pick a city';
}