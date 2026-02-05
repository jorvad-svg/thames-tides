import type { TideReading, VisualizationState } from '../types';
import { mapRange, clamp } from '../utils/math';
import { levelToCSS } from './color';

const CURVE_HEIGHT_FRACTION = 0.15; // Bottom 15% of screen
const PADDING_X = 60;

export function drawTideCurve(
  ctx: CanvasRenderingContext2D,
  state: VisualizationState
): void {
  const { width, height, readings, currentLevel } = state;

  if (readings.length < 2) return;

  const curveTop = height * (1 - CURVE_HEIGHT_FRACTION);
  const curveBottom = height - 20;
  const curveHeight = curveBottom - curveTop;

  // Center "now" in the middle of the curve
  const now = Date.now();
  const dayStart = now - 12 * 3600 * 1000;
  const dayEnd = now + 12 * 3600 * 1000;

  // Find min/max level for scaling
  let minLevel = Infinity;
  let maxLevel = -Infinity;
  for (const r of readings) {
    minLevel = Math.min(minLevel, r.level);
    maxLevel = Math.max(maxLevel, r.level);
  }
  // Add some padding to the range
  const levelPadding = (maxLevel - minLevel) * 0.15 || 0.5;
  minLevel -= levelPadding;
  maxLevel += levelPadding;

  const timeToX = (t: number) =>
    mapRange(t, dayStart, dayEnd, PADDING_X, width - PADDING_X);
  const levelToY = (l: number) =>
    curveBottom - mapRange(l, minLevel, maxLevel, 0, curveHeight);

  ctx.save();

  const sortedReadings = [...readings].sort(
    (a, b) => a.time.getTime() - b.time.getTime()
  );

  // ── Predicted future: shift readings from ~12.4h ago (one tidal cycle) ──
  const TIDAL_PERIOD = 12.4 * 3600 * 1000;
  const predicted: { time: number; level: number }[] = [];
  for (const r of sortedReadings) {
    const futureTime = r.time.getTime() + TIDAL_PERIOD;
    if (futureTime > now && futureTime <= dayEnd) {
      predicted.push({ time: futureTime, level: r.level });
    }
  }

  // Helper: build path from point array
  const buildPath = (points: { time: number; level: number }[]) => {
    ctx.beginPath();
    let s = false;
    for (const p of points) {
      const x = timeToX(p.time);
      const y = levelToY(p.level);
      if (x < PADDING_X || x > width - PADDING_X) continue;
      if (!s) { ctx.moveTo(x, y); s = true; } else { ctx.lineTo(x, y); }
    }
  };

  // ── Draw predicted curve (dashed, faded) ──
  if (predicted.length > 1) {
    ctx.setLineDash([6, 4]);

    buildPath(predicted);
    ctx.strokeStyle = levelToCSS(currentLevel, 0.15);
    ctx.lineWidth = 8;
    ctx.stroke();

    buildPath(predicted);
    ctx.strokeStyle = levelToCSS(currentLevel, 0.35);
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.setLineDash([]);
  }

  // ── Draw observed curve (solid, bright) ──
  const observed = sortedReadings.map((r) => ({ time: r.time.getTime(), level: r.level }));

  buildPath(observed);
  ctx.strokeStyle = levelToCSS(currentLevel, 0.3);
  ctx.lineWidth = 12;
  ctx.stroke();

  buildPath(observed);
  ctx.strokeStyle = levelToCSS(currentLevel, 0.6);
  ctx.lineWidth = 5;
  ctx.stroke();

  buildPath(observed);
  ctx.strokeStyle = levelToCSS(currentLevel, 1.0);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // ── Filled area under observed curve ──
  const visibleObs = observed.filter((p) => {
    const x = timeToX(p.time);
    return x >= PADDING_X && x <= width - PADDING_X;
  });

  if (visibleObs.length > 1) {
    ctx.beginPath();
    ctx.moveTo(timeToX(visibleObs[0].time), curveBottom);
    for (const p of visibleObs) {
      ctx.lineTo(timeToX(p.time), levelToY(p.level));
    }
    ctx.lineTo(timeToX(visibleObs[visibleObs.length - 1].time), curveBottom);
    ctx.closePath();

    const fillGrad = ctx.createLinearGradient(0, curveTop, 0, curveBottom);
    fillGrad.addColorStop(0, levelToCSS(currentLevel, 0.5));
    fillGrad.addColorStop(1, levelToCSS(currentLevel, 0.05));
    ctx.fillStyle = fillGrad;
    ctx.fill();
  }

  // Current time marker
  const nowX = timeToX(now);
  if (nowX > PADDING_X && nowX < width - PADDING_X) {
    // Vertical line at current time
    ctx.beginPath();
    ctx.moveTo(nowX, curveTop);
    ctx.lineTo(nowX, curveBottom);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Glowing dot at current level
    const currentY = levelToY(currentLevel);
    const dotGrad = ctx.createRadialGradient(nowX, currentY, 0, nowX, currentY, 14);
    dotGrad.addColorStop(0, levelToCSS(currentLevel, 1.0));
    dotGrad.addColorStop(0.4, levelToCSS(currentLevel, 0.5));
    dotGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dotGrad;
    ctx.fillRect(nowX - 14, currentY - 14, 28, 28);

    // Inner dot
    ctx.beginPath();
    ctx.arc(nowX, currentY, 4, 0, Math.PI * 2);
    ctx.fillStyle = levelToCSS(currentLevel, 1);
    ctx.fill();
  }

  // Time labels
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'center';

  // Mark every 3 hours
  const threeHours = 3 * 3600 * 1000;
  const firstMark = Math.ceil(dayStart / threeHours) * threeHours;
  for (let t = firstMark; t <= dayEnd; t += threeHours) {
    const x = timeToX(t);
    if (x < PADDING_X + 20 || x > width - PADDING_X - 20) continue;
    const d = new Date(t);
    const label = `${d.getHours().toString().padStart(2, '0')}:00`;
    ctx.fillText(label, x, curveBottom + 14);
  }

  ctx.restore();
}
