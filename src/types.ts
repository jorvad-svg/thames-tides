// ── EA Flood Monitoring API types ──

export interface EAReading {
  dateTime: string;
  value: number;
}

export interface EAMeasure {
  '@id': string;
  parameter: string;
  parameterName: string;
  period: number;
  qualifier: string;
  unitName: string;
}

export interface EAStation {
  '@id': string;
  label: string;
  stationReference: string;
  lat: number;
  long: number;
  measures: EAMeasure | EAMeasure[];
}

// ── Visualization types ──

export type TideState = 'rising' | 'falling' | 'high_slack' | 'low_slack';
export type Theme = 'dark' | 'light';

export interface TideReading {
  time: Date;
  level: number; // mAOD
}

export interface TidalEvent {
  type: 'high' | 'low';
  time: Date;
  level: number; // mAOD
}

export interface TideData {
  readings: TideReading[];
  predictions: TidalEvent[];
  currentLevel: number;
  tideState: TideState;
  lastUpdated: Date;
  stationName: string;
  rateOfChange: number; // m/hour, positive = rising
}

export interface Particle {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  trail: Float32Array; // ring buffer: [x0,y0, x1,y1, ...] length = TRAIL_LENGTH * 2
  trailHead: number;   // write index (0..TRAIL_LENGTH-1)
  trailCount: number;  // how many slots are filled (0..TRAIL_LENGTH)
  speed: number;
  life: number;
  maxLife: number;
  size: number;
}

export interface PointerState {
  x: number;
  y: number;
  active: boolean;
}

export interface VisualizationState {
  width: number;
  height: number;
  dpr: number;
  currentLevel: number;
  tideState: TideState;
  rateOfChange: number;
  readings: TideReading[];
  predictions: TidalEvent[];
  time: number; // animation time in seconds
  pointer: PointerState;
  theme: Theme;
  themeBlend: number; // 0 = fully dark, 1 = fully light (animated)
  stationId: string; // used to key caches per station
}
