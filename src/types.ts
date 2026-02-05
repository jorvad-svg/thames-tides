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

export interface TideReading {
  time: Date;
  level: number; // mAOD
}

export interface TideData {
  readings: TideReading[];
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
  trail: { x: number; y: number }[];
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
  time: number; // animation time in seconds
  pointer: PointerState;
}
