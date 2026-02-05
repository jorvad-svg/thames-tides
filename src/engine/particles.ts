import type { Particle, VisualizationState } from '../types';
import { getFlowAt } from './flowField';
import { levelToParticleColor } from './color';

const PARTICLE_COUNT = 1200;
const BASE_SPEED = 1.1;
const MIN_LIFE = 500;
const MAX_LIFE = 1200;
const POINTER_RADIUS = 80;
const POINTER_FORCE = 1.2;
const TRAIL_LENGTH = 60;

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

// Read trail points in order (oldest → newest) into a reusable array
// Returns the number of points written
const ptsBuf: { x: number; y: number }[] = new Array(TRAIL_LENGTH + 1);
for (let i = 0; i <= TRAIL_LENGTH; i++) ptsBuf[i] = { x: 0, y: 0 };

function readTrail(p: Particle): number {
  const { trail, trailHead, trailCount } = p;
  // Oldest entry is (trailHead - trailCount), wrapping
  let readIdx = (trailHead - trailCount + TRAIL_LENGTH) % TRAIL_LENGTH;
  for (let i = 0; i < trailCount; i++) {
    ptsBuf[i].x = trail[readIdx * 2];
    ptsBuf[i].y = trail[readIdx * 2 + 1];
    readIdx = (readIdx + 1) % TRAIL_LENGTH;
  }
  // Append current position as final point
  ptsBuf[trailCount].x = p.x;
  ptsBuf[trailCount].y = p.y;
  return trailCount + 1;
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

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    // Write current position into ring buffer
    p.trail[p.trailHead * 2] = p.x;
    p.trail[p.trailHead * 2 + 1] = p.y;
    p.trailHead = (p.trailHead + 1) % TRAIL_LENGTH;
    if (p.trailCount < TRAIL_LENGTH) p.trailCount++;

    p.prevX = p.x;
    p.prevY = p.y;

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

    // Helper: draw a smooth quadratic curve through ptsBuf[start..end)
    const drawSmooth = (start: number, end: number) => {
      ctx.beginPath();
      ctx.moveTo(ptsBuf[start].x, ptsBuf[start].y);
      for (let j = start + 1; j < end - 1; j++) {
        const cpx = ptsBuf[j].x;
        const cpy = ptsBuf[j].y;
        const nx = (ptsBuf[j].x + ptsBuf[j + 1].x) / 2;
        const ny = (ptsBuf[j].y + ptsBuf[j + 1].y) / 2;
        ctx.quadraticCurveTo(cpx, cpy, nx, ny);
      }
      ctx.lineTo(ptsBuf[end - 1].x, ptsBuf[end - 1].y);
    };

    // Layer 1: full trail, thin, faded tail
    drawSmooth(0, len);
    ctx.strokeStyle = levelToParticleColor(currentLevel, baseAlpha * 0.3 + pointerBoost * 0.1, themeBlend);
    ctx.lineWidth = p.size * 0.4;
    ctx.stroke();

    // Layer 2: last 40%, bright head
    const s2 = Math.floor(len * 0.6);
    drawSmooth(s2, len);
    ctx.strokeStyle = levelToParticleColor(currentLevel, Math.min(baseAlpha * 0.85 + pointerBoost * 0.3, 1.0), themeBlend);
    ctx.lineWidth = p.size;
    ctx.stroke();
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
