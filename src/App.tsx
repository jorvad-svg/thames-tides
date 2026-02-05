import { useState, useEffect, useCallback, useRef } from 'react';
import type { Theme } from './types';
import { useTideData } from './hooks/useTideData';
import { TideCanvas } from './components/TideCanvas';
import { Overlay } from './components/Overlay';
import { LoadingScreen } from './components/LoadingScreen';
import { isDaytime, getSunTimes } from './utils/sun';
import './App.css';

export default function App() {
  const { data, loading, error } = useTideData();
  const [theme, setTheme] = useState<Theme>(() => (isDaytime() ? 'light' : 'dark'));
  const manualOverride = useRef(false);

  // Auto-switch at sunrise/sunset unless the user has manually toggled
  useEffect(() => {
    const scheduleNext = () => {
      const now = new Date();
      const { sunrise, sunset } = getSunTimes(now);

      // Find the next transition
      let next: Date;
      let nextTheme: Theme;

      if (now < sunrise) {
        next = sunrise;
        nextTheme = 'light';
      } else if (now < sunset) {
        next = sunset;
        nextTheme = 'dark';
      } else {
        // After sunset — next transition is tomorrow's sunrise
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const { sunrise: tomorrowRise } = getSunTimes(tomorrow);
        next = tomorrowRise;
        nextTheme = 'light';
      }

      const ms = next.getTime() - now.getTime();
      const id = setTimeout(() => {
        if (!manualOverride.current) {
          setTheme(nextTheme);
        }
        manualOverride.current = false; // reset override at each transition
        scheduleNext();
      }, ms);

      return id;
    };

    const id = scheduleNext();
    return () => clearTimeout(id);
  }, []);

  const toggleTheme = useCallback(() => {
    manualOverride.current = true;
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  if (loading || !data) {
    return <LoadingScreen error={error} />;
  }

  return (
    <>
      <TideCanvas data={data} theme={theme} />
      <Overlay data={data} theme={theme} onToggleTheme={toggleTheme} />
    </>
  );
}
