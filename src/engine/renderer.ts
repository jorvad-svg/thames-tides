import type { VisualizationState } from '../types';
import { levelToBackground } from './color';
import { drawCaustics } from './caustics';
import { drawUndulatingMesh } from './undulatingMesh';
import { drawTideCurve } from './tideCurve';

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: VisualizationState
): void {
  // Layer 1: Caustics (fills entire background)
  drawCaustics(ctx, state);

  // Layer 2: Subtle undulating mesh lines over caustics
  drawUndulatingMesh(ctx, state);

  // Layer 3: Tide curve along bottom
  drawTideCurve(ctx, state);
}

export function renderInitialBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  level: number,
  blend: number
): void {
  ctx.fillStyle = levelToBackground(level, blend);
  ctx.globalAlpha = 1.0;
  ctx.fillRect(0, 0, width, height);
}
