import { useState, useEffect, useRef } from 'react';
import type { TideData, TideState, TidalEvent, Theme } from '../types';
import type { Station } from '../stations';
import { STATIONS } from '../stations';
import { needsDarkText } from '../engine/color';

interface OverlayProps {
  data: TideData;
  station: Station;
  theme: Theme;
  onToggleTheme: () => void;
  onSelectStation: (station: Station) => void;
}

function tideStateLabel(state: TideState): string {
  switch (state) {
    case 'rising': return 'Rising';
    case 'falling': return 'Falling';
    case 'high_slack': return 'High slack';
    case 'low_slack': return 'Low slack';
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function depthAboveLow(currentLevel: number, predictions: TidalEvent[], tideState: TideState): number {
  const now = Date.now();
  const lows = predictions.filter((e) => e.type === 'low');
  if (lows.length === 0) return currentLevel;

  let refLow: TidalEvent | undefined;
  if (tideState === 'rising' || tideState === 'low_slack') {
    refLow = [...lows].reverse().find((e) => e.time.getTime() <= now);
    if (!refLow) refLow = lows[0];
  } else {
    refLow = lows.find((e) => e.time.getTime() >= now);
    if (!refLow) refLow = lows[lows.length - 1];
  }

  return Math.max(0, currentLevel - refLow.level);
}

function timeUntilLabel(predictions: TidalEvent[], tideState: TideState): string | null {
  const now = Date.now();
  const targetType = (tideState === 'rising' || tideState === 'low_slack') ? 'high' : 'low';
  const next = predictions.find((e) => e.type === targetType && e.time.getTime() > now);
  if (!next) return null;

  const diffMs = next.time.getTime() - now;
  const totalMins = Math.round(diffMs / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;

  const timePart = h > 0 ? `${h}h ${m}m` : `${m}m`;
  const label = targetType === 'high' ? 'high tide' : 'low tide';
  return `${timePart} until ${label}`;
}

export function Overlay({ data, station, theme, onToggleTheme, onSelectStation }: OverlayProps) {
  const { currentLevel, tideState, lastUpdated, predictions } = data;
  const dark = needsDarkText(currentLevel, theme === 'light' ? 1 : 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    // Delay listener so the opening click doesn't immediately close
    const id = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', handleClick);
    };
  }, [menuOpen]);

  return (
    <div className="overlay" data-theme={theme} data-dark-text={dark || undefined}>
      {/* Title — top left, tappable to open station picker */}
      <div className="overlay-title" onClick={() => setMenuOpen((o) => !o)}>
        Thames at {station.name}
        <div className="overlay-updated">Last updated {formatTime(lastUpdated)}</div>
      </div>

      {/* Station picker menu */}
      {menuOpen && (
        <div className="station-menu" ref={menuRef}>
          {STATIONS.map((s) => (
            <button
              key={s.id}
              className={`station-menu-item${s.id === station.id ? ' active' : ''}`}
              onClick={() => {
                onSelectStation(s);
                setMenuOpen(false);
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Theme toggle — top right */}
      <button className="theme-toggle" onClick={onToggleTheme}>
        {theme === 'dark' ? '☀' : '☾'}
      </button>

      {/* Central level display */}
      <div className="overlay-center">
        <div className="overlay-level">
          {depthAboveLow(currentLevel, predictions, tideState).toFixed(2)}
          <span className="overlay-unit">m</span>
        </div>
        <div className="overlay-state">
          {tideStateLabel(tideState)}
        </div>
        {(() => {
          const countdown = timeUntilLabel(predictions, tideState);
          return countdown ? <div className="overlay-countdown">{countdown}</div> : null;
        })()}
      </div>

    </div>
  );
}
