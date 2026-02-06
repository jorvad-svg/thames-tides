import type { VisualizationState, TidalEvent } from '../types';
import { mapRange } from '../utils/math';
import { levelToGlowColor } from './color';

const CURVE_HEIGHT_FRACTION = 0.15;
const LABEL_PAD = 40;
const HALF_CYCLE = 6.2 * 3600 * 1000;
const CACHE_TTL = 30_000;

// Vertical float: curve rises/falls with tide level
const MAX_FLOAT_FRACTION = 0.06; // max upward shift as fraction of screen height

// Scrolling window: hours of past/future visible from centre
const PAST_HOURS = 12;
const FUTURE_HOURS = 12;

function padPredictions(
  predictions: TidalEvent[],
  start: number,
  end: number
): TidalEvent[] {
  if (predictions.length < 2) return predictions;

  const padded = [...predictions];

  // Pad start
  while (padded.length > 0 && padded[0].time.getTime() > start) {
    const first = padded[0];
    const oppositeType = first.type === 'high' ? 'low' : 'high';
    const nearest = padded.find((e) => e.type === oppositeType);
    const level = nearest ? nearest.level : first.level;
    padded.unshift({
      type: oppositeType,
      time: new Date(first.time.getTime() - HALF_CYCLE),
      level,
    });
  }

  // Pad end
  while (padded.length > 0 && padded[padded.length - 1].time.getTime() < end) {
    const last = padded[padded.length - 1];
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
  const step = 3 * 60 * 1000;

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

// ── Cache ──
let cachedCanvas: OffscreenCanvas | null = null;
let cacheKey = '';
let cacheTime = 0;
let cachedPoints: { time: number; level: number }[] = [];
let cachedMinLevel = 0;
let cachedMaxLevel = 1;
let cachedWindowStart = 0;
let cachedWindowEnd = 0;
let cachedCurveTop = 0;
let cachedCurveBottom = 0;

function buildCacheKey(w: number, h: number, dpr: number, blend: number, predCount: number, nowMinute: number): string {
  return `${w}|${h}|${dpr}|${Math.round(blend * 20)}|${predCount}|${nowMinute}`;
}

function renderStaticLayer(state: VisualizationState): void {
  const { width, height, dpr, predictions, currentLevel, themeBlend } = state;

  const curveTop = height * (1 - CURVE_HEIGHT_FRACTION);
  const curveBottom = height - 20;
  const curveHeight = curveBottom - curveTop;
  const tw = Math.round(255 * (1 - themeBlend));
  const textColor = `rgba(${tw},${tw},${tw},`;

  const now = Date.now();
  const windowStart = now - PAST_HOURS * 3600 * 1000;
  const windowEnd = now + FUTURE_HOURS * 3600 * 1000;

  const allPoints = interpolatePredictions(predictions, windowStart, windowEnd);
  if (allPoints.length < 2) {
    cachedCanvas = null;
    return;
  }

  let minLevel = Infinity;
  let maxLevel = -Infinity;
  for (const p of allPoints) {
    minLevel = Math.min(minLevel, p.level);
    maxLevel = Math.max(maxLevel, p.level);
  }
  const levelPadding = (maxLevel - minLevel) * 0.15 || 0.5;
  minLevel -= levelPadding;
  maxLevel += levelPadding;

  cachedPoints = allPoints;
  cachedMinLevel = minLevel;
  cachedMaxLevel = maxLevel;
  cachedWindowStart = windowStart;
  cachedWindowEnd = windowEnd;
  cachedCurveTop = curveTop;
  cachedCurveBottom = curveBottom;

  // Now is always at screen centre
  const timeToX = (t: number) =>
    mapRange(t, windowStart, windowEnd, 0, width);
  const levelToY = (l: number) =>
    curveBottom - mapRange(l, minLevel, maxLevel, 0, curveHeight);
  const bright = (alpha: number) => levelToGlowColor(currentLevel, alpha, themeBlend);

  const oc = new OffscreenCanvas(width * dpr, height * dpr);
  const ctx = oc.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'butt';

  const nowX = timeToX(now);

  // ── Build path helper ──
  const buildPath = (points: { time: number; level: number }[]) => {
    ctx.beginPath();
    let s = false;
    for (const p of points) {
      const x = timeToX(p.time);
      const y = levelToY(p.level);
      if (!s) { ctx.moveTo(x, y); s = true; } else { ctx.lineTo(x, y); }
    }
  };

  // ── Crossfade gradients at the now-line ──
  const fadeLen = 50;

  const fadingStroke = (alpha: number, edge: 'end' | 'start') => {
    const x0 = edge === 'end' ? nowX - fadeLen : nowX;
    const x1 = edge === 'end' ? nowX : nowX + fadeLen;
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    if (edge === 'end') {
      grad.addColorStop(0, levelToGlowColor(currentLevel, alpha, themeBlend));
      grad.addColorStop(1, levelToGlowColor(currentLevel, 0, themeBlend));
    } else {
      grad.addColorStop(0, levelToGlowColor(currentLevel, 0, themeBlend));
      grad.addColorStop(1, levelToGlowColor(currentLevel, alpha, themeBlend));
    }
    return grad;
  };

  const past = allPoints.filter((p) => p.time <= now);
  const future = allPoints.filter((p) => p.time >= now);

  // ── Future: dashed ──
  if (future.length > 1) {
    ctx.setLineDash([6, 4]);

    buildPath(future);
    ctx.strokeStyle = fadingStroke(0.15, 'start');
    ctx.lineWidth = 3;
    ctx.stroke();

    buildPath(future);
    ctx.strokeStyle = fadingStroke(0.4, 'start');
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.setLineDash([]);
  }

  // ── Past: solid, glowing ──
  if (past.length > 1) {
    buildPath(past);
    ctx.strokeStyle = fadingStroke(0.25, 'end');
    ctx.lineWidth = 4;
    ctx.stroke();

    buildPath(past);
    ctx.strokeStyle = fadingStroke(0.55, 'end');
    ctx.lineWidth = 2;
    ctx.stroke();

    buildPath(past);
    ctx.strokeStyle = fadingStroke(1.0, 'end');
    ctx.lineWidth = 1;
    ctx.stroke();

    // Fill under past curve
    if (past.length > 1) {
      ctx.beginPath();
      ctx.moveTo(timeToX(past[0].time), curveBottom);
      for (const p of past) {
        ctx.lineTo(timeToX(p.time), levelToY(p.level));
      }
      ctx.lineTo(timeToX(past[past.length - 1].time), curveBottom);
      ctx.closePath();

      const fillGrad = ctx.createLinearGradient(0, curveTop, 0, curveBottom);
      const fillAlpha = 0.35 - themeBlend * 0.23;
      fillGrad.addColorStop(0, bright(fillAlpha));
      fillGrad.addColorStop(1, bright(0.01));
      ctx.fillStyle = fillGrad;
      ctx.fill();
    }
  }

  // ── High/low markers ──
  const paddedPreds = padPredictions(predictions, windowStart, windowEnd);
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  for (const e of paddedPreds) {
    const t = e.time.getTime();
    if (t < windowStart || t > windowEnd) continue;
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

  // ── Time labels (hourly, scrolling) ──
  ctx.font = '10px monospace';
  ctx.fillStyle = textColor + '0.5)';
  ctx.textAlign = 'center';

  const hourMs = 3600 * 1000;
  // Adaptive spacing based on screen width
  const usableWidth = width - LABEL_PAD * 2;
  const hoursPerLabel = usableWidth < 300 ? 6 : usableWidth < 500 ? 4 : usableWidth < 800 ? 3 : 2;
  const interval = hoursPerLabel * hourMs;
  const firstMark = Math.ceil(windowStart / interval) * interval;
  for (let t = firstMark; t <= windowEnd; t += interval) {
    const x = timeToX(t);
    if (x < LABEL_PAD || x > width - LABEL_PAD) continue;
    const d = new Date(t);
    const label = `${d.getHours().toString().padStart(2, '0')}:00`;
    ctx.fillText(label, x, curveBottom + 14);
  }

  cachedCanvas = oc;
  cacheTime = now;
}

export function drawTideCurve(
  ctx: CanvasRenderingContext2D,
  state: VisualizationState
): void {
  const { width, height, predictions, currentLevel, themeBlend } = state;

  if (predictions.length < 2) return;

  const { dpr } = state;
  const now = Date.now();
  // Cache key includes the current minute so the curve re-renders as time scrolls
  const nowMinute = Math.floor(now / 60_000);
  const key = buildCacheKey(width, height, dpr, themeBlend, predictions.length, nowMinute);
  if (!cachedCanvas || key !== cacheKey || now - cacheTime > CACHE_TTL) {
    cacheKey = key;
    renderStaticLayer(state);
  }

  if (!cachedCanvas || cachedPoints.length < 2) return;

  // ── Vertical float: shift the whole curve up at high tide, down at low ──
  const floatOffset = -mapRange(currentLevel, -2, 3.5, 0, height * MAX_FLOAT_FRACTION);

  ctx.save();
  ctx.translate(0, floatOffset);

  ctx.drawImage(cachedCanvas, 0, 0, width, height);

  // ── Live: current time marker (always at centre) ──
  const curveHeight = cachedCurveBottom - cachedCurveTop;
  const tw = Math.round(255 * (1 - themeBlend));
  const textColor = `rgba(${tw},${tw},${tw},`;
  const bright = (alpha: number) => levelToGlowColor(currentLevel, alpha, themeBlend);

  const timeToX = (t: number) =>
    mapRange(t, cachedWindowStart, cachedWindowEnd, 0, width);
  const levelToY = (l: number) =>
    cachedCurveBottom - mapRange(l, cachedMinLevel, cachedMaxLevel, 0, curveHeight);

  const nowX = timeToX(now);

  ctx.beginPath();
  ctx.moveTo(nowX, cachedCurveTop);
  ctx.lineTo(nowX, cachedCurveBottom);
  ctx.strokeStyle = textColor + '0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  let curveLevel = currentLevel;
  for (let i = 0; i < cachedPoints.length - 1; i++) {
    if (cachedPoints[i].time <= now && cachedPoints[i + 1].time >= now) {
      const frac = (now - cachedPoints[i].time) / (cachedPoints[i + 1].time - cachedPoints[i].time);
      curveLevel = cachedPoints[i].level + (cachedPoints[i + 1].level - cachedPoints[i].level) * frac;
      break;
    }
  }

  const currentY = levelToY(curveLevel);
  const dotGrad = ctx.createRadialGradient(nowX, currentY, 0, nowX, currentY, 18);
  dotGrad.addColorStop(0, bright(1.0));
  dotGrad.addColorStop(0.4, bright(0.5));
  dotGrad.addColorStop(1, bright(0));
  ctx.fillStyle = dotGrad;
  ctx.fillRect(nowX - 18, currentY - 18, 36, 36);

  ctx.beginPath();
  ctx.arc(nowX, currentY, 5, 0, Math.PI * 2);
  const dv = Math.round(255 * (1 - themeBlend));
  ctx.fillStyle = `rgb(${dv},${dv},${dv})`;
  ctx.fill();

  ctx.restore();
}
