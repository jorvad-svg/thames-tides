import type { VisualizationState } from '../types';
import { levelToBackground } from './color';
import { drawCentralGlow } from './centralGlow';
import { updateAndDrawParticles } from './particles';
import { drawTideCurve } from './tideCurve';

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: VisualizationState
): void {
  const { width, height, currentLevel } = state;

  // Semi-transparent overlay for trail effect — clears slowly
  ctx.fillStyle = levelToBackground(currentLevel);
  ctx.globalAlpha = 0.07;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1.0;

  // Layer 1: Central glow (below particles)
  drawCentralGlow(ctx, state);

  // Layer 2: Particles
  updateAndDrawParticles(ctx, state);

  // Layer 3: Tide curve along bottom
  drawTideCurve(ctx, state);
}

export function renderInitialBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  level: number
): void {
  ctx.fillStyle = levelToBackground(level);
  ctx.globalAlpha = 1.0;
  ctx.fillRect(0, 0, width, height);
}
