import type { TideData, TideState, TidalEvent, Theme } from '../types';
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

export function Overlay({ data, theme, onToggleTheme }: OverlayProps) {
  const { currentLevel, tideState, lastUpdated, stationName, predictions } = data;
  const dark = needsDarkText(currentLevel, theme === 'light' ? 1 : 0);

  return (
    <div className="overlay" data-theme={theme} data-dark-text={dark || undefined}>
      {/* Title — top left */}
      <div className="overlay-title">
        Thames at Hays Court
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
        {(() => {
          const countdown = timeUntilLabel(predictions, tideState);
          return countdown ? <div className="overlay-countdown">{countdown}</div> : null;
        })()}
      </div>

      {/* Bottom right — last updated */}
      <div className="overlay-updated">
        Last updated {formatTime(lastUpdated)}
      </div>
    </div>
  );
}
