import { useState, useEffect, useCallback } from 'react';
import type { TideData, TideReading, TideState } from '../types';
import { fetchTodayReadings, fetchStationName } from '../api';

const POLL_INTERVAL = 15 * 60 * 1000; // 15 minutes
const SLACK_THRESHOLD = 0.05; // m/hour — below this is "slack"

function deriveTideState(readings: TideReading[]): {
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
  const dt = (last.time.getTime() - first.time.getTime()) / (1000 * 3600); // hours
  const dLevel = last.level - first.level;
  const rate = dt > 0 ? dLevel / dt : 0;

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

  const load = useCallback(async () => {
    try {
      const readings = await fetchTodayReadings();
      if (readings.length === 0) {
        setError('No readings available');
        return;
      }

      const { state, rateOfChange, currentLevel } = deriveTideState(readings);

      setData({
        readings,
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
  }, [stationName]);

  useEffect(() => {
    fetchStationName().then(setStationName).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  return { data, loading, error };
}
