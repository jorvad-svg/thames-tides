import { useState, useCallback } from 'react';
import type { Theme } from './types';
import { useTideData } from './hooks/useTideData';
import { TideCanvas } from './components/TideCanvas';
import { Overlay } from './components/Overlay';
import { LoadingScreen } from './components/LoadingScreen';
import './App.css';

export default function App() {
  const { data, loading, error } = useTideData();
  const [theme, setTheme] = useState<Theme>('dark');

  const toggleTheme = useCallback(() => {
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
