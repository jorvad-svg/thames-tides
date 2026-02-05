import type { VisualizationState } from '../types';
import { mapRange } from '../utils/math';
import { levelToGlowColor } from './color';

const RING_COUNT = 5;
const RING_SPEED = 0.3;

export function drawCentralGlow(
  ctx: CanvasRenderingContext2D,
  state: VisualizationState
): void {
  const { width, height, currentLevel, time, themeBlend } = state;
  const cx = width / 2;
  const cy = height / 2;

  // Base radius pulses with water level
  const minDim = Math.min(width, height);
  const baseRadius = mapRange(currentLevel, -2, 3.5, minDim * 0.08, minDim * 0.2);

  // Gentle breathing oscillation
  const breathe = Math.sin(time * 0.4) * minDim * 0.015;
  const radius = baseRadius + breathe;

  // Scale glow intensity down in dark mode to prevent bright accumulation
  const glowDim = 1 - (1 - themeBlend) * 0.6; // 0.4 in dark, 1.0 in light

  // Main radial glow
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 3);
  gradient.addColorStop(0, levelToGlowColor(currentLevel, 0.2 * glowDim, themeBlend));
  gradient.addColorStop(0.3, levelToGlowColor(currentLevel, 0.08 * glowDim, themeBlend));
  gradient.addColorStop(0.7, levelToGlowColor(currentLevel, 0.02 * glowDim, themeBlend));
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Concentric ripple rings
  for (let i = 0; i < RING_COUNT; i++) {
    const phase = (time * RING_SPEED + i * (1 / RING_COUNT)) % 1;
    const ringRadius = radius * (1 + phase * 4);
    const alpha = (1 - phase) * 0.12 * glowDim;

    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = levelToGlowColor(currentLevel, alpha, themeBlend);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Inner bright core
  const coreGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  coreGradient.addColorStop(0, levelToGlowColor(currentLevel, 0.15 * glowDim, themeBlend));
  coreGradient.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = coreGradient;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}
