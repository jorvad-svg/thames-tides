import { createNoise3D } from 'simplex-noise';
import type { VisualizationState } from '../types';
import { mapRange } from '../utils/math';
import { levelToParticleColor } from './color';

const noise3D = createNoise3D();

// ── Grid config (subtle overlay) ──
const LINE_COUNT = 26;
const POINTS_PER_LINE = 100;
const VERTICAL_PADDING_TOP = 0.10;
const VERTICAL_PADDING_BOTTOM = 0.20; // keep clear of tide curve

// ── Wave physics ──
const BASE_AMPLITUDE = 0.024;
const NOISE_SCALE_X = 0.004;
const NOISE_SCALE_Y = 0.005;
const TIME_SCALE = 0.18;

// ── Drift (tide direction) ──
const MAX_DRIFT_SPEED = 0.8;

// ── Pointer interaction ──
const POINTER_RADIUS = 100;
const POINTER_STRENGTH = 25; // max pixel displacement

// Running drift offset (accumulated each frame)
let driftOffset = 0;

export function drawUndulatingMesh(
  ctx: CanvasRenderingContext2D,
  state: VisualizationState
): void {
  const { width, height, currentLevel, tideState, rateOfChange, time, pointer, themeBlend } = state;

  // ── Tide-level intensity: higher water = more energy ──
  const levelIntensity = mapRange(currentLevel, -1.5, 3.5, 0.5, 1.5);

  // ── Drift: falling/low_slack = right, rising/high_slack = left ──
  const tideBias = tideState === 'falling' || tideState === 'low_slack' ? 1 : -1;
  const speedMult = mapRange(Math.abs(rateOfChange), 0, 2, 0.15, 1.0);
  driftOffset += tideBias * speedMult * MAX_DRIFT_SPEED * levelIntensity;

  const ampScale = mapRange(Math.abs(rateOfChange), 0, 2, 0.5, 1.3) * levelIntensity;

  const yTop = height * VERTICAL_PADDING_TOP;
  const yBot = height * (1 - VERTICAL_PADDING_BOTTOM);
  const bandHeight = yBot - yTop;

  ctx.lineCap = 'round';

  for (let i = 0; i < LINE_COUNT; i++) {
    const lineT = i / (LINE_COUNT - 1);
    const baseY = yTop + lineT * bandHeight;

    // Subtle: centre lines slightly more visible, edges very faint
    const centreProximity = 1 - Math.abs(lineT - 0.5) * 2;
    const lineAlpha = (0.07 + centreProximity * 0.20) * levelIntensity;
    const lineWidth = (0.9 + centreProximity * 1.2) * (0.7 + levelIntensity * 0.5);

    const phaseOffset = i * 1.7;

    ctx.beginPath();

    for (let j = 0; j <= POINTS_PER_LINE; j++) {
      const xT = j / POINTS_PER_LINE;
      const x = xT * width;
      const worldX = x - driftOffset;

      const n1 = noise3D(
        worldX * NOISE_SCALE_X,
        baseY * NOISE_SCALE_Y + phaseOffset,
        time * TIME_SCALE
      );
      const n2 = noise3D(
        worldX * NOISE_SCALE_X * 2.5,
        baseY * NOISE_SCALE_Y * 2.5 + phaseOffset,
        time * TIME_SCALE * 1.4 + 100
      );

      const n3 = noise3D(
        worldX * NOISE_SCALE_X * 5,
        baseY * NOISE_SCALE_Y * 5 + phaseOffset,
        time * TIME_SCALE * 2.2 + 200
      );
      const displacement = (n1 * 0.55 + n2 * 0.30 + n3 * 0.15) * BASE_AMPLITUDE * height * ampScale;
      const edgeFade = Math.sin(xT * Math.PI);
      let y = baseY + displacement * edgeFade;

      // ── Pointer: deflect lines around cursor like an obstruction ──
      if (pointer.active) {
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < POINTER_RADIUS && dist > 1) {
          const t = 1 - dist / POINTER_RADIUS;
          const push = t * t * POINTER_STRENGTH;
          // Push vertically away from pointer
          y += (dy >= 0 ? 1 : -1) * push;
        }
      }

      if (j === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.strokeStyle = levelToParticleColor(currentLevel, lineAlpha, themeBlend);
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

export function resetMeshDrift(): void {
  driftOffset = 0;
}
