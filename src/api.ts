import type { EAReading, TideReading, TidalEvent } from './types';

// ── EA Flood Monitoring (observed readings) ──

const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring';
const EA_STATION = '0007'; // Tower Pier

export async function fetchStationName(): Promise<string> {
  const res = await fetch(`${EA_BASE}/id/stations/${EA_STATION}`);
  if (!res.ok) throw new Error(`Station fetch failed: ${res.status}`);
  const data = await res.json();
  return data.items?.label ?? 'Tower Pier';
}

export async function fetchTodayReadings(): Promise<TideReading[]> {
  const res = await fetch(
    `${EA_BASE}/id/stations/${EA_STATION}/readings?_sorted&_limit=200&parameter=level`
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

// ── Admiralty Tidal API (predicted highs/lows) ──

const ADMIRALTY_BASE = import.meta.env.DEV
  ? '/api/admiralty/uktidalapi/api/V1'
  : 'https://admiraltyapi.azure-api.net/uktidalapi/api/V1';
const ADMIRALTY_STATION = '0113'; // London Bridge (Tower Pier)
// Chart Datum to mAOD offset for London Bridge: CD is ~2.97m below OD
const CD_TO_MAOD = -2.97;

export async function fetchTidalPredictions(): Promise<TidalEvent[]> {
  // In dev mode, use the Vite proxy to hit the live API
  const apiKey = import.meta.env.VITE_ADMIRALTY_API_KEY;
  if (import.meta.env.DEV && apiKey) {
    try {
      const res = await fetch(
        `${ADMIRALTY_BASE}/Stations/${ADMIRALTY_STATION}/TidalEvents?duration=3`,
        { headers: { 'Ocp-Apim-Subscription-Key': apiKey } }
      );
      if (res.ok) {
        const events: {
          EventType: string;
          DateTime: string;
          Height: number;
        }[] = await res.json();

        return events.map((e) => ({
          type: e.EventType === 'HighWater' ? 'high' as const : 'low' as const,
          time: new Date(e.DateTime + 'Z'),
          level: e.Height + CD_TO_MAOD,
        }));
      }
    } catch {
      // fall through to static file
    }
  }

  // In production (or if live API fails), use build-time predictions
  try {
    const base = import.meta.env.BASE_URL;
    const res = await fetch(`${base}data/predictions.json`);
    if (!res.ok) return [];

    const predictions: {
      type: 'high' | 'low';
      time: string;
      level: number;
    }[] = await res.json();

    return predictions.map((p) => ({
      type: p.type,
      time: new Date(p.time),
      level: p.level,
    }));
  } catch {
    return [];
  }
}
