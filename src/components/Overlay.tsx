import type { TideData, TideState } from '../types';

interface OverlayProps {
  data: TideData;
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

export function Overlay({ data }: OverlayProps) {
  const { currentLevel, tideState, lastUpdated, stationName } = data;

  return (
    <div className="overlay">
      {/* Title — top left */}
      <div className="overlay-title">
        Thames at {stationName}
      </div>

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
