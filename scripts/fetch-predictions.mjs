// Fetches Admiralty tidal predictions at build time (no CORS issue server-side)
// and writes them to public/data/predictions.json for the production client.

import { writeFileSync, mkdirSync } from 'fs';

const ADMIRALTY_BASE = 'https://admiraltyapi.azure-api.net/uktidalapi/api/V1';
const STATION = '0113';
const CD_TO_MAOD = -2.97;

const apiKey = process.env.VITE_ADMIRALTY_API_KEY;
if (!apiKey) {
  console.warn('No VITE_ADMIRALTY_API_KEY — skipping prediction fetch');
  process.exit(0);
}

try {
  const res = await fetch(
    `${ADMIRALTY_BASE}/Stations/${STATION}/TidalEvents?duration=3`,
    { headers: { 'Ocp-Apim-Subscription-Key': apiKey } }
  );

  if (!res.ok) {
    console.error(`Admiralty API returned ${res.status}`);
    process.exit(1);
  }

  const events = await res.json();
  const predictions = events.map((e) => ({
    type: e.EventType === 'HighWater' ? 'high' : 'low',
    time: e.DateTime + 'Z',
    level: +(e.Height + CD_TO_MAOD).toFixed(3),
  }));

  mkdirSync('public/data', { recursive: true });
  writeFileSync('public/data/predictions.json', JSON.stringify(predictions));
  console.log(`Wrote ${predictions.length} predictions to public/data/predictions.json`);
} catch (err) {
  console.error('Failed to fetch predictions:', err);
  process.exit(1);
}
