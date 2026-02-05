import type { TideData, TideState, Theme } from '../types';
import { needsDarkText } from '../engine/color';

interface OverlayProps {
  data: TideData;
  theme: Theme;
  onToggleTheme: () => void;
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

export function Overlay({ data, theme, onToggleTheme }: OverlayProps) {
  const { currentLevel, tideState, lastUpdated, stationName } = data;
  const dark = needsDarkText(currentLevel, theme === 'light' ? 1 : 0);

  return (
    <div className="overlay" data-theme={theme} data-dark-text={dark || undefined}>
      {/* Title — top left */}
      <div className="overlay-title">
        Thames at {stationName}
      </div>

      {/* Theme toggle — top right */}
      <button className="theme-toggle" onClick={onToggleTheme}>
        {theme === 'dark' ? '☀' : '☾'}
      </button>

      {/* Central level display */}
      <div className="overlay-center">
        <div className="overlay-level">
          {currentLevel.toFixed(2)}
          <span className="overlay-unit">m</span>
        </div>
        <div className="overlay-state">
          {tideStateLabel(tideState)}
        </div>
      </div>

      {/* Bottom right — last updated */}
      <div className="overlay-updated">
        Last updated {formatTime(lastUpdated)}
      </div>
    </div>
  );
}
