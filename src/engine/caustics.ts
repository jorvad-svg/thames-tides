import { createNoise3D } from 'simplex-noise';
import type { VisualizationState } from '../types';
import { mapRange } from '../utils/math';
import { levelToHSL } from './color';

// Two independent noise fields for the two "surfaces" that create caustics
const noiseA = createNoise3D();
const noiseB = createNoise3D();

// ── Resolution: render at reduced res then draw scaled ──
// Caustics are soft/blurry by nature so half-res looks great and is 4x cheaper
const CELL = 6; // pixel size of each caustic cell

// ── Noise sampling ──
const SCALE_A = 0.0035;
const SCALE_B = 0.005;
const TIME_A = 0.12;
const TIME_B = 0.09;

// ── Drift (tide direction) ──
const MAX_DRIFT = 1.2; // pixels per frame at full rate-of-change

// ── Pointer interaction ──
const POINTER_RADIUS = 120;

// Accumulated drift
let driftX = 0;

// Off-screen buffer for caustic computation
let buffer: ImageData | null = null;
let bufW = 0;
let bufH = 0;

function ensureBuffer(w: number, h: number) {
  if (buffer && bufW === w && bufH === h) return;
  bufW = w;
  bufH = h;
  buffer = new ImageData(w, h);
}

export function drawCaustics(
  ctx: CanvasRenderingContext2D,
  state: VisualizationState
): void {
  const { width, height, currentLevel, tideState, rateOfChange, time, pointer, themeBlend } = state;

  // ── Drift accumulation ──
  // Falling/low slack = downstream = right (+1), rising/high slack = upstream = left (-1)
  const tideBias = tideState === 'falling' || tideState === 'low_slack' ? 1 : -1;
  const speedMult = mapRange(Math.abs(rateOfChange), 0, 2, 0.2, 1.0);
  driftX += tideBias * speedMult * MAX_DRIFT;

  // ── Intensity scales with rate of change ──
  const intensity = mapRange(Math.abs(rateOfChange), 0, 2, 0.4, 1.0);

  // ── Colour from water level ──
  const [h, s, l] = levelToHSL(currentLevel);

  // In dark mode: caustics are bright lines on dark bg
  // In light mode: caustics are slightly darker lines on light bg
  // We compute a "caustic brightness" per cell and blend it
  const darkBase = Math.min(l * 0.15, 8);
  const lightBase = 82 + (l < 30 ? l * 0.15 : l * 0.04);
  const baseLightness = darkBase + (lightBase - darkBase) * themeBlend;

  const darkSat = s * 0.5;
  const lightSat = s * 0.7;
  const baseSat = darkSat + (lightSat - darkSat) * themeBlend;

  // ── Compute caustic grid ──
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  ensureBuffer(cols, rows);
  const data = buffer!.data;

  for (let gy = 0; gy < rows; gy++) {
    const worldY = gy * CELL;
    for (let gx = 0; gx < cols; gx++) {
      const worldX = gx * CELL - driftX;

      // Sample two noise fields
      const a = noiseA(worldX * SCALE_A, worldY * SCALE_A, time * TIME_A);
      const b = noiseB(worldX * SCALE_B, worldY * SCALE_B, time * TIME_B + 50);

      // Caustic pattern: bright where the two "lenses" constructively interfere
      // Use the product of (shifted) noise values — creates bright concentrated lines
      const va = (a + 1) * 0.5; // 0..1
      const vb = (b + 1) * 0.5; // 0..1

      // Sharpen: raise to power to get concentrated bright ridges
      let caustic = Math.pow(va * vb, 0.6);

      // Further sharpen into bright lines: remap so only high values are visible
      caustic = Math.max(0, (caustic - 0.25) / 0.75);
      caustic = caustic * caustic; // square for sharp bright ridges

      caustic *= intensity;

      // ── Pointer: brighten/ripple near cursor ──
      if (pointer.active) {
        const px = gx * CELL - pointer.x;
        const py = worldY - pointer.y;
        const dist = Math.sqrt(px * px + py * py);
        if (dist < POINTER_RADIUS) {
          const prox = 1 - dist / POINTER_RADIUS;
          // Add a ring ripple
          const ring = Math.sin(dist * 0.15 - time * 4) * 0.5 + 0.5;
          caustic += prox * prox * ring * 0.5;
        }
      }

      caustic = Math.min(caustic, 1);

      // ── Map to colour ──
      // In dark mode: caustic brightens from dark base
      // In light mode: caustic subtly darkens/saturates from light base
      let cL: number, cS: number;
      if (themeBlend < 0.5) {
        // Dark mode: caustic adds brightness
        cL = baseLightness + caustic * (20 + intensity * 15);
        cS = baseSat + caustic * 20;
      } else {
        // Light mode: caustic adds subtle darker ripples
        cL = baseLightness - caustic * (8 + intensity * 6);
        cS = baseSat + caustic * 15;
      }

      // Convert HSL to RGB for ImageData
      const rgb = hslToRgb(h / 360, Math.min(cS, 100) / 100, Math.min(Math.max(cL, 0), 100) / 100);
      const idx = (gy * cols + gx) * 4;
      data[idx] = rgb[0];
      data[idx + 1] = rgb[1];
      data[idx + 2] = rgb[2];
      data[idx + 3] = 255;
    }
  }

  // ── Draw the low-res caustic buffer scaled up ──
  // Use a temp canvas to put the ImageData, then drawImage scaled
  const tmp = new OffscreenCanvas(cols, rows);
  const tctx = tmp.getContext('2d')!;
  tctx.putImageData(buffer!, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(tmp, 0, 0, cols, rows, 0, 0, width, height);
}

export function resetCausticsDrift(): void {
  driftX = 0;
}

// ── Fast HSL → RGB ──
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
