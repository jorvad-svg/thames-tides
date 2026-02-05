import { createNoise3D } from 'simplex-noise';
import type { TideState } from '../types';
import { mapRange } from '../utils/math';

const noise3D = createNoise3D();

const NOISE_SCALE = 0.001;
const TIME_SCALE = 0.04;

export interface FlowVector {
  x: number;
  y: number;
}

export function getFlowAt(
  x: number,
  y: number,
  time: number,
  tideState: TideState,
  rateOfChange: number
): FlowVector {
  // Noise adds gentle waviness — small angular perturbation, not full rotation
  const noiseVal = noise3D(x * NOISE_SCALE, y * NOISE_SCALE, time * TIME_SCALE);
  const wobbleAngle = noiseVal * Math.PI * 0.35; // max ±63° deviation

  // Primary flow direction: falling = right (+1), rising = left (-1)
  const tideBias = tideState === 'rising' || tideState === 'high_slack' ? -1 : 1;

  // Tidal direction is the dominant force
  const baseAngle = tideBias > 0 ? 0 : Math.PI; // 0 = right, PI = left
  const angle = baseAngle + wobbleAngle;

  // Speed scales with rate of change — fast at mid-tide, gentle at slack
  const speedMult = mapRange(Math.abs(rateOfChange), 0, 2, 0.4, 1.0);

  return {
    x: Math.cos(angle) * speedMult,
    y: Math.sin(angle) * speedMult * 0.4, // suppress vertical movement
  };
}
