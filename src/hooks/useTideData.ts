import { useState, useEffect, useCallback } from 'react';
import type { TideData, TideReading, TideState, TidalEvent } from '../types';
import { fetchTodayReadings, fetchStationName, fetchTidalPredictions } from '../api';

const POLL_INTERVAL = 15 * 60 * 1000; // 15 minutes
const SLACK_THRESHOLD = 0.05; // m/hour — below this is "slack"

function deriveTideState(readings: TideReading[], predictions: TidalEvent[]): {
  state: TideState;
  rateOfChange: number;
  currentLevel: number;
} {
  if (readings.length < 2) {
    return { state: 'rising', rateOfChange: 0, currentLevel: readings[0]?.level ?? 0 };
  }

  const latest = readings[readings.length - 1];

  // Average rate of change over the last ~4 readings for stability
  const window = Math.min(readings.length, 5);
  const recent = readings.slice(-window);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = (last.time.getTime() - first.time.getTime()) / (1000 * 3600);
  const dLevel = last.level - first.level;
  const rate = dt > 0 ? dLevel / dt : 0;

  // Use predictions to determine state more accurately near turning points
  if (predictions.length > 0) {
    const now = Date.now();
    // Find the nearest past and next future event
    let lastEvent: TidalEvent | null = null;
    let nextEvent: TidalEvent | null = null;
    for (const e of predictions) {
      if (e.time.getTime() <= now) lastEvent = e;
      if (e.time.getTime() > now && !nextEvent) nextEvent = e;
    }

    if (lastEvent && nextEvent) {
      const timeSinceLast = now - lastEvent.time.getTime();
      const timeToNext = nextEvent.time.getTime() - now;
      const slackWindow = 20 * 60 * 1000; // 20 minutes

      if (timeSinceLast < slackWindow) {
        return {
          state: lastEvent.type === 'high' ? 'high_slack' : 'low_slack',
          rateOfChange: rate,
          currentLevel: latest.level,
        };
      }
      if (timeToNext < slackWindow) {
        return {
          state: nextEvent.type === 'high' ? 'high_slack' : 'low_slack',
          rateOfChange: rate,
          currentLevel: latest.level,
        };
      }

      // Between events: if last was low, we're rising; if last was high, we're falling
      return {
        state: lastEvent.type === 'low' ? 'rising' : 'falling',
        rateOfChange: rate,
        currentLevel: latest.level,
      };
    }
  }

  // Fallback: use rate of change
  let state: TideState;
  if (Math.abs(rate) < SLACK_THRESHOLD) {
    state = latest.level > 1.0 ? 'high_slack' : 'low_slack';
  } else {
    state = rate > 0 ? 'rising' : 'falling';
  }

  return { state, rateOfChange: rate, currentLevel: latest.level };
}

export function useTideData(): { data: TideData | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<TideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stationName, setStationName] = useState('Tower Pier');
  const [predictions, setPredictions] = useState<TidalEvent[]>([]);
  const [predictionsReady, setPredictionsReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const readings = await fetchTodayReadings();
      if (readings.length === 0) {
        setError('No readings available');
        return;
      }

      const { state, rateOfChange, currentLevel } = deriveTideState(readings, predictions);

      setData({
        readings,
        predictions,
        currentLevel,
        tideState: state,
        lastUpdated: new Date(),
        stationName,
        rateOfChange,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [stationName, predictions]);

  // Fetch predictions once on mount (they don't change frequently)
  useEffect(() => {
    fetchTidalPredictions()
      .then(setPredictions)
      .catch(() => {})
      .finally(() => setPredictionsReady(true));
  }, []);

  useEffect(() => {
    fetchStationName().then(setStationName).catch(() => {});
  }, []);

  // Only start the polling loop once predictions have been fetched
  useEffect(() => {
    if (!predictionsReady) return;
    load();
    const interval = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [load, predictionsReady]);

  return { data, loading, error };
}
