import type { VisualizationState, TidalEvent } from '../types';
import { mapRange } from '../utils/math';
import { levelToGlowColor } from './color';

const CURVE_HEIGHT_FRACTION = 0.15;
const PADDING_X = 0; // curve runs edge-to-edge
const LABEL_PAD = 60; // inset for time labels and markers
const HALF_CYCLE = 6.2 * 3600 * 1000; // ~6.2h between consecutive high/low

/**
 * Extend predictions so they cover the full [start, end] window.
 * The Admiralty API may not include yesterday's last event, so the first
 * prediction can start hours after midnight. We synthesize boundary events
 * by mirroring the nearest event of the opposite type.
 */
function padPredictions(
  predictions: TidalEvent[],
  start: number,
  end: number
): TidalEvent[] {
  if (predictions.length < 2) return predictions;

  const padded = [...predictions];

  // Pad the start: if first prediction is after `start`, synthesize a prior event
  const first = padded[0];
  if (first.time.getTime() > start) {
    const oppositeType = first.type === 'high' ? 'low' : 'high';
    // Find the nearest event of that type to estimate level
    const nearest = padded.find((e) => e.type === oppositeType);
    const level = nearest ? nearest.level : first.level;
    padded.unshift({
      type: oppositeType,
      time: new Date(first.time.getTime() - HALF_CYCLE),
      level,
    });
  }

  // Pad the end: if last prediction is before `end`, synthesize a following event
  const last = padded[padded.length - 1];
  if (last.time.getTime() < end) {
    const oppositeType = last.type === 'high' ? 'low' : 'high';
    const nearest = [...padded].reverse().find((e) => e.type === oppositeType);
    const level = nearest ? nearest.level : last.level;
    padded.push({
      type: oppositeType,
      time: new Date(last.time.getTime() + HALF_CYCLE),
      level,
    });
  }

  return padded;
}

function interpolatePredictions(
  predictions: TidalEvent[],
  start: number,
  end: number
): { time: number; level: number }[] {
  const padded = padPredictions(predictions, start, end);
  if (padded.length < 2) return [];

  const points: { time: number; level: number }[] = [];
  const step = 3 * 60 * 1000; // every 3 minutes for smooth curve

  for (let i = 0; i < padded.length - 1; i++) {
    const a = padded[i];
    const b = padded[i + 1];
    const tA = a.time.getTime();
    const tB = b.time.getTime();

    for (let t = tA; t < tB; t += step) {
      if (t < start || t > end) continue;
      const frac = (t - tA) / (tB - tA);
      const cos = (1 - Math.cos(frac * Math.PI)) / 2;
      const level = a.level + (b.level - a.level) * cos;
      points.push({ time: t, level });
    }
  }

  const last = padded[padded.length - 1];
  if (last.time.getTime() >= start && last.time.getTime() <= end) {
    points.push({ time: last.time.getTime(), level: last.level });
  }

  return points;
}

export function drawTideCurve(
  ctx: CanvasRenderingContext2D,
  state: VisualizationState
): void {
  const { width, height, predictions, currentLevel, theme } = state;

  if (predictions.length < 2) return;

  const curveTop = height * (1 - CURVE_HEIGHT_FRACTION);
  const curveBottom = height - 20;
  const textColor = theme === 'light' ? 'rgba(0,0,0,' : 'rgba(255,255,255,';
  const curveHeight = curveBottom - curveTop;

  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStart = today.getTime();
  const dayEnd = dayStart + 24 * 3600 * 1000;

  // Generate the full curve from Admiralty predictions (padded to cover midnight–midnight)
  const allPoints = interpolatePredictions(predictions, dayStart, dayEnd);
  if (allPoints.length < 2) return;

  // Find min/max for scaling
  let minLevel = Infinity;
  let maxLevel = -Infinity;
  for (const p of allPoints) {
    minLevel = Math.min(minLevel, p.level);
    maxLevel = Math.max(maxLevel, p.level);
  }
  const levelPadding = (maxLevel - minLevel) * 0.15 || 0.5;
  minLevel -= levelPadding;
  maxLevel += levelPadding;

  const timeToX = (t: number) =>
    mapRange(t, dayStart, dayEnd, PADDING_X, width - PADDING_X);
  const levelToY = (l: number) =>
    curveBottom - mapRange(l, minLevel, maxLevel, 0, curveHeight);

  // Use glow color — always bright enough to see, even at low tide
  const bright = (alpha: number) => levelToGlowColor(currentLevel, alpha, theme);

  ctx.save();
  ctx.lineCap = 'butt';

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

  // Horizontal gradient that fades at the "now" edge
  const nowX = timeToX(now);
  const fadeLen = 50; // px to fade over

  const fadingStroke = (alpha: number, edge: 'end' | 'start') => {
    const x0 = edge === 'end' ? nowX - fadeLen : nowX;
    const x1 = edge === 'end' ? nowX : nowX + fadeLen;
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    if (edge === 'end') {
      grad.addColorStop(0, levelToGlowColor(currentLevel, alpha, theme));
      grad.addColorStop(1, levelToGlowColor(currentLevel, 0, theme));
    } else {
      grad.addColorStop(0, levelToGlowColor(currentLevel, 0, theme));
      grad.addColorStop(1, levelToGlowColor(currentLevel, alpha, theme));
    }
    return grad;
  };

  // Split into past and future
  const past = allPoints.filter((p) => p.time <= now);
  const future = allPoints.filter((p) => p.time >= now);

  // ── Future: dashed ──
  if (future.length > 1) {
    ctx.setLineDash([6, 4]);

    buildPath(future);
    ctx.strokeStyle = fadingStroke(0.2, 'start');
    ctx.lineWidth = 6;
    ctx.stroke();

    buildPath(future);
    ctx.strokeStyle = fadingStroke(0.45, 'start');
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.setLineDash([]);
  }

  // ── Past: solid, glowing ──
  if (past.length > 1) {
    buildPath(past);
    ctx.strokeStyle = fadingStroke(0.35, 'end');
    ctx.lineWidth = 8;
    ctx.stroke();

    buildPath(past);
    ctx.strokeStyle = fadingStroke(0.65, 'end');
    ctx.lineWidth = 3;
    ctx.stroke();

    buildPath(past);
    ctx.strokeStyle = fadingStroke(1.0, 'end');
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Fill under past curve
    const visible = past.filter((p) => {
      const x = timeToX(p.time);
      return x >= PADDING_X && x <= width - PADDING_X;
    });

    if (visible.length > 1) {
      ctx.beginPath();
      ctx.moveTo(timeToX(visible[0].time), curveBottom);
      for (const p of visible) {
        ctx.lineTo(timeToX(p.time), levelToY(p.level));
      }
      ctx.lineTo(timeToX(visible[visible.length - 1].time), curveBottom);
      ctx.closePath();

      const fillGrad = ctx.createLinearGradient(0, curveTop, 0, curveBottom);
      const fillAlpha = theme === 'light' ? 0.12 : 0.35;
      fillGrad.addColorStop(0, bright(fillAlpha));
      fillGrad.addColorStop(1, bright(0.01));
      ctx.fillStyle = fillGrad;
      ctx.fill();
    }
  }

  // ── High/low markers ──
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  for (const e of predictions) {
    const t = e.time.getTime();
    if (t < dayStart || t > dayEnd) continue;
    const x = timeToX(t);
    if (x < LABEL_PAD || x > width - LABEL_PAD) continue;

    const y = levelToY(e.level);

    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x + 4, y);
    ctx.lineTo(x, y + 5);
    ctx.lineTo(x - 4, y);
    ctx.closePath();
    ctx.fillStyle = bright(0.9);
    ctx.fill();

    const d = e.time;
    const timeLabel = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    const offset = e.type === 'high' ? -12 : 14;
    ctx.fillStyle = textColor + '0.7)';
    ctx.fillText(timeLabel, x, y + offset);
  }

  // ── Current time marker with actual observed level ──
  if (nowX > PADDING_X && nowX < width - PADDING_X) {
    ctx.beginPath();
    ctx.moveTo(nowX, curveTop);
    ctx.lineTo(nowX, curveBottom);
    ctx.strokeStyle = textColor + '0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Find predicted level at "now" for Y positioning on the curve
    let curveLevel = currentLevel;
    for (let i = 0; i < allPoints.length - 1; i++) {
      if (allPoints[i].time <= now && allPoints[i + 1].time >= now) {
        const frac = (now - allPoints[i].time) / (allPoints[i + 1].time - allPoints[i].time);
        curveLevel = allPoints[i].level + (allPoints[i + 1].level - allPoints[i].level) * frac;
        break;
      }
    }

    const currentY = levelToY(curveLevel);
    const dotGrad = ctx.createRadialGradient(nowX, currentY, 0, nowX, currentY, 18);
    dotGrad.addColorStop(0, bright(1.0));
    dotGrad.addColorStop(0.4, bright(0.5));
    dotGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dotGrad;
    ctx.fillRect(nowX - 18, currentY - 18, 36, 36);

    ctx.beginPath();
    ctx.arc(nowX, currentY, 5, 0, Math.PI * 2);
    ctx.fillStyle = theme === 'light' ? '#222' : '#fff';
    ctx.fill();
  }

  // ── Time labels ──
  ctx.font = '10px monospace';
  ctx.fillStyle = textColor + '0.5)';
  ctx.textAlign = 'center';

  const threeHours = 3 * 3600 * 1000;
  const firstMark = Math.ceil(dayStart / threeHours) * threeHours;
  for (let t = firstMark; t <= dayEnd; t += threeHours) {
    const x = timeToX(t);
    if (x < LABEL_PAD || x > width - LABEL_PAD) continue;
    const d = new Date(t);
    const label = `${d.getHours().toString().padStart(2, '0')}:00`;
    ctx.fillText(label, x, curveBottom + 14);
  }

  ctx.restore();
}
