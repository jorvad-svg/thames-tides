import type { EAReading, TideReading } from './types';

const BASE_URL = 'https://environment.data.gov.uk/flood-monitoring';
const STATION_ID = '0007'; // Tower Pier

export async function fetchStationName(): Promise<string> {
  const res = await fetch(`${BASE_URL}/id/stations/${STATION_ID}`);
  if (!res.ok) throw new Error(`Station fetch failed: ${res.status}`);
  const data = await res.json();
  return data.items?.label ?? 'Tower Pier';
}

export async function fetchTodayReadings(): Promise<TideReading[]> {
  // Fetch the last 24 hours of readings
  const res = await fetch(
    `${BASE_URL}/id/stations/${STATION_ID}/readings?_sorted&_limit=200&parameter=level`
  );
  if (!res.ok) throw new Error(`Readings fetch failed: ${res.status}`);
  const data = await res.json();

  const items: EAReading[] = data.items ?? [];

  return items
    .filter((r) => typeof r.value === 'number' && !isNaN(r.value))
    .map((r) => ({
      time: new Date(r.dateTime),
      level: r.value,
    }))
    .sort((a, b) => a.time.getTime() - b.time.getTime());
}
