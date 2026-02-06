import { useState, useEffect, useCallback, useRef } from 'react';
import type { TideData, TideReading, TideState, TidalEvent } from '../types';
import type { Station } from '../stations';
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

export function useTideData(station: Station): { data: TideData | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<TideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stationName, setStationName] = useState(station.name);
  const [predictions, setPredictions] = useState<TidalEvent[]>([]);
  const [predictionsReady, setPredictionsReady] = useState(false);

  // Track station ID so we can discard stale responses
  const stationRef = useRef(station.id);

  // Reset state when station changes
  useEffect(() => {
    stationRef.current = station.id;
    setData(null);
    setLoading(true);
    setError(null);
    setStationName(station.name);
    setPredictions([]);
    setPredictionsReady(false);
  }, [station.id, station.name]);

  const load = useCallback(async () => {
    try {
      const readings = await fetchTodayReadings(station.eaStation);
      // Discard if station changed while fetching
      if (stationRef.current !== station.id) return;

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
      if (stationRef.current !== station.id) return;
      setError(e instanceof Error ? e.message : 'Failed to fetch data');
    } finally {
      if (stationRef.current === station.id) {
        setLoading(false);
      }
    }
  }, [station.id, station.eaStation, stationName, predictions]);

  // Fetch predictions when station changes
  useEffect(() => {
    setPredictionsReady(false);
    fetchTidalPredictions(station.admiraltyStation, station.cdToMaod)
      .then((p) => {
        if (stationRef.current === station.id) setPredictions(p);
      })
      .catch(() => {})
      .finally(() => {
        if (stationRef.current === station.id) setPredictionsReady(true);
      });
  }, [station.id, station.admiraltyStation, station.cdToMaod]);

  // Fetch EA station name
  useEffect(() => {
    fetchStationName(station.eaStation)
      .then((name) => {
        if (stationRef.current === station.id) setStationName(name);
      })
      .catch(() => {});
  }, [station.id, station.eaStation]);

  // Only start the polling loop once predictions have been fetched
  useEffect(() => {
    if (!predictionsReady) return;
    load();
    const interval = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [load, predictionsReady]);

  return { data, loading, error };
}
