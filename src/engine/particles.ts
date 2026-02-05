import type { Particle, VisualizationState } from '../types';
import { getFlowAt } from './flowField';
import { levelToParticleColor } from './color';

const PARTICLE_COUNT = 1200;
const BASE_SPEED = 1.1;
const MIN_LIFE = 500;
const MAX_LIFE = 1200;
const POINTER_RADIUS = 80;
const POINTER_FORCE = 1.2;
const TRAIL_LENGTH = 30;
const ALPHA_BUCKETS = 8; // batch particles into N alpha levels

function createParticle(width: number, height: number): Particle {
  const x = Math.random() * width;
  const y = Math.random() * height;
  const maxLife = MIN_LIFE + Math.random() * (MAX_LIFE - MIN_LIFE);
  return {
    x,
    y,
    prevX: x,
    prevY: y,
    trail: new Float32Array(TRAIL_LENGTH * 2),
    trailHead: 0,
    trailCount: 0,
    speed: 0.6 + Math.random() * 0.8,
    life: Math.random() * maxLife,
    maxLife,
    size: 0.8 + Math.random() * 1.2,
  };
}

// Reusable buffer for reading trail points
const ptsBuf: { x: number; y: number }[] = new Array(TRAIL_LENGTH + 1);
for (let i = 0; i <= TRAIL_LENGTH; i++) ptsBuf[i] = { x: 0, y: 0 };

function readTrail(p: Particle): number {
  const { trail, trailHead, trailCount } = p;
  let readIdx = (trailHead - trailCount + TRAIL_LENGTH) % TRAIL_LENGTH;
  for (let i = 0; i < trailCount; i++) {
    ptsBuf[i].x = trail[readIdx * 2];
    ptsBuf[i].y = trail[readIdx * 2 + 1];
    readIdx = (readIdx + 1) % TRAIL_LENGTH;
  }
  ptsBuf[trailCount].x = p.x;
  ptsBuf[trailCount].y = p.y;
  return trailCount + 1;
}

// Append a smooth curve segment to the current path (no beginPath)
function appendSmooth(ctx: CanvasRenderingContext2D, start: number, end: number) {
  ctx.moveTo(ptsBuf[start].x, ptsBuf[start].y);
  for (let j = start + 1; j < end - 1; j++) {
    const nx = (ptsBuf[j].x + ptsBuf[j + 1].x) / 2;
    const ny = (ptsBuf[j].y + ptsBuf[j + 1].y) / 2;
    ctx.quadraticCurveTo(ptsBuf[j].x, ptsBuf[j].y, nx, ny);
  }
  ctx.lineTo(ptsBuf[end - 1].x, ptsBuf[end - 1].y);
}

// Per-particle computed draw data, reused each frame
interface DrawEntry {
  tailBucket: number;
  headBucket: number;
  tailWidth: number;
  headWidth: number;
  headStart: number;
  len: number;
}

const drawEntries: DrawEntry[] = new Array(PARTICLE_COUNT);
for (let i = 0; i < PARTICLE_COUNT; i++) {
  drawEntries[i] = { tailBucket: 0, headBucket: 0, tailWidth: 0, headWidth: 0, headStart: 0, len: 0 };
}

let particles: Particle[] = [];

export function initParticles(width: number, height: number): void {
  particles = Array.from({ length: PARTICLE_COUNT }, () => createParticle(width, height));
}

export function updateAndDrawParticles(
  ctx: CanvasRenderingContext2D,
  state: VisualizationState
): void {
  const { width, height, currentLevel, tideState, rateOfChange, time, pointer, themeBlend } = state;

  while (particles.length < PARTICLE_COUNT) {
    particles.push(createParticle(width, height));
  }

  // ── Update phase ──
  let drawCount = 0;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    // Write current position into ring buffer
    p.trail[p.trailHead * 2] = p.x;
    p.trail[p.trailHead * 2 + 1] = p.y;
    p.trailHead = (p.trailHead + 1) % TRAIL_LENGTH;
    if (p.trailCount < TRAIL_LENGTH) p.trailCount++;

    p.prevX = p.x;
    p.prevY = p.y;

    // Skip noise for particles well off-screen
    if (p.x < -50 || p.x > width + 50 || p.y < -50 || p.y > height + 50) {
      p.life -= 1;
      if (p.life <= 0) particles[i] = createParticle(width, height);
      continue;
    }

    const flow = getFlowAt(p.x, p.y, time, tideState, rateOfChange);

    let fx = flow.x * p.speed * BASE_SPEED;
    let fy = flow.y * p.speed * BASE_SPEED;
    if (pointer.active) {
      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < POINTER_RADIUS && dist > 1) {
        const t = 1 - dist / POINTER_RADIUS;
        const strength = t * t * t * POINTER_FORCE;

        const vertSign = dy >= 0 ? 1 : -1;
        fy += vertSign * strength;

        if (dist < POINTER_RADIUS * 0.4) {
          const radX = dx / dist;
          const radY = dy / dist;
          const inward = fx * radX + fy * radY;
          if (inward < 0) {
            fx -= inward * radX * 0.7;
            fy -= inward * radY * 0.7;
          }
        }
      }
    }

    p.x += fx;
    p.y += fy;
    p.life -= 1;

    if (p.life <= 0 || p.x < -50 || p.x > width + 50 || p.y < -50 || p.y > height + 50) {
      particles[i] = createParticle(width, height);
      continue;
    }

    const len = readTrail(p);
    if (len < 4) continue;

    const lifeRatio = p.life / p.maxLife;
    const baseAlpha = Math.sin(lifeRatio * Math.PI) * 0.8;

    let pointerBoost = 0;
    if (pointer.active) {
      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < POINTER_RADIUS) {
        const prox = 1 - dist / POINTER_RADIUS;
        pointerBoost = prox * prox * 0.5;
      }
    }

    const tailAlpha = baseAlpha * 0.3 + pointerBoost * 0.1;
    const headAlpha = Math.min(baseAlpha * 0.85 + pointerBoost * 0.3, 1.0);

    const entry = drawEntries[drawCount];
    entry.tailBucket = Math.min(Math.floor(tailAlpha * ALPHA_BUCKETS), ALPHA_BUCKETS - 1);
    entry.headBucket = Math.min(Math.floor(headAlpha * ALPHA_BUCKETS), ALPHA_BUCKETS - 1);
    entry.tailWidth = p.size * 0.4;
    entry.headWidth = p.size;
    entry.headStart = Math.floor(len * 0.6);
    entry.len = len;
    drawCount++;
  }

  // ── Batched draw phase ──
  // Draw tails grouped by alpha bucket, then heads grouped by alpha bucket.
  // This minimizes strokeStyle changes (most expensive Canvas 2D state change).

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // We need to re-read trails for drawing. Store particle indices per bucket.
  // Use a simpler approach: iterate twice (tails then heads), batch by bucket.

  // Pre-compute bucket colors once
  const tailColors: string[] = new Array(ALPHA_BUCKETS);
  const headColors: string[] = new Array(ALPHA_BUCKETS);
  for (let b = 0; b < ALPHA_BUCKETS; b++) {
    const alpha = (b + 0.5) / ALPHA_BUCKETS;
    tailColors[b] = levelToParticleColor(currentLevel, alpha, themeBlend);
    headColors[b] = levelToParticleColor(currentLevel, alpha, themeBlend);
  }

  // Re-read particles for drawing — we need to iterate again since readTrail
  // uses a shared buffer. Process one bucket at a time.

  // Collect drawable particle indices (those that got a drawEntry)
  const drawableIndices: number[] = [];
  let pi = 0;
  for (let i = 0; i < particles.length && pi < drawCount; i++) {
    const p = particles[i];
    if (p.trailCount < 3) continue;
    if (p.x < -50 || p.x > width + 50 || p.y < -50 || p.y > height + 50) continue;
    drawableIndices.push(i);
    pi++;
  }

  // Draw tail layer — batch by bucket
  for (let b = 0; b < ALPHA_BUCKETS; b++) {
    ctx.beginPath();
    let anyInBucket = false;
    for (let d = 0; d < drawCount; d++) {
      if (drawEntries[d].tailBucket !== b) continue;
      const p = particles[drawableIndices[d]];
      const len = readTrail(p);
      if (len < 4) continue;
      ctx.lineWidth = drawEntries[d].tailWidth;
      appendSmooth(ctx, 0, len);
      anyInBucket = true;
    }
    if (anyInBucket) {
      ctx.strokeStyle = tailColors[b];
      ctx.stroke();
    }
  }

  // Draw head layer — batch by bucket
  for (let b = 0; b < ALPHA_BUCKETS; b++) {
    ctx.beginPath();
    let anyInBucket = false;
    for (let d = 0; d < drawCount; d++) {
      if (drawEntries[d].headBucket !== b) continue;
      const p = particles[drawableIndices[d]];
      const len = readTrail(p);
      if (len < 4) continue;
      ctx.lineWidth = drawEntries[d].headWidth;
      appendSmooth(ctx, drawEntries[d].headStart, len);
      anyInBucket = true;
    }
    if (anyInBucket) {
      ctx.strokeStyle = headColors[b];
      ctx.stroke();
    }
  }
}

export function resizeParticles(width: number, height: number): void {
  for (const p of particles) {
    if (p.x > width || p.y > height) {
      p.x = Math.random() * width;
      p.y = Math.random() * height;
      p.prevX = p.x;
      p.prevY = p.y;
      p.trailHead = 0;
      p.trailCount = 0;
    }
  }
}
