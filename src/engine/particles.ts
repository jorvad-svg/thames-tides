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
    trail: [],
    speed: 0.6 + Math.random() * 0.8,
    life: Math.random() * maxLife,
    maxLife,
    size: 0.8 + Math.random() * 1.2,
  };
}

let particles: Particle[] = [];

export function initParticles(width: number, height: number): void {
  particles = Array.from({ length: PARTICLE_COUNT }, () => createParticle(width, height));
}

export function updateAndDrawParticles(
  ctx: CanvasRenderingContext2D,
  state: VisualizationState
): void {
  const { width, height, currentLevel, tideState, rateOfChange, time, pointer } = state;

  while (particles.length < PARTICLE_COUNT) {
    particles.push(createParticle(width, height));
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > TRAIL_LENGTH) {
      p.trail.shift();
    }

    p.prevX = p.x;
    p.prevY = p.y;

    const flow = getFlowAt(p.x, p.y, time, tideState, rateOfChange);

    // River obstruction
    let fx = flow.x * p.speed * BASE_SPEED;
    let fy = flow.y * p.speed * BASE_SPEED;
    if (pointer.active) {
      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < POINTER_RADIUS && dist > 1) {
        const t = 1 - dist / POINTER_RADIUS;
        const strength = t * t * t * POINTER_FORCE; // cubic: tight, subtle near edges

        // Gentle vertical nudge: above → up, below → down
        const vertSign = dy >= 0 ? 1 : -1;
        fy += vertSign * strength;

        // Only block inward motion very close to center (inner 40%)
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

    // Build smooth curve points using quadratic bezier through trail
    const trail = p.trail;
    if (trail.length < 4) continue;

    const lifeRatio = p.life / p.maxLife;
    const baseAlpha = Math.sin(lifeRatio * Math.PI) * 0.8;

    let pointerBoost = 0;
    if (pointer.active) {
      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < POINTER_RADIUS) {
        const prox = 1 - dist / POINTER_RADIUS;
        pointerBoost = prox * prox * 0.5; // subtle glow, not harsh
      }
    }

    // Draw as a single smooth quadratic curve, with layered widths for taper
    const pts = [...trail, { x: p.x, y: p.y }];
    const len = pts.length;

    // Helper: draw a smooth curve through a subset of points
    const drawSmooth = (start: number, end: number) => {
      ctx.beginPath();
      ctx.moveTo(pts[start].x, pts[start].y);
      for (let j = start + 1; j < end - 1; j++) {
        const cpx = pts[j].x;
        const cpy = pts[j].y;
        const nx = (pts[j].x + pts[j + 1].x) / 2;
        const ny = (pts[j].y + pts[j + 1].y) / 2;
        ctx.quadraticCurveTo(cpx, cpy, nx, ny);
      }
      // Last segment straight to final point
      ctx.lineTo(pts[end - 1].x, pts[end - 1].y);
    };

    // Layer 1: full trail, very thin, faded — ghostly tail
    drawSmooth(0, len);
    ctx.strokeStyle = levelToParticleColor(currentLevel, baseAlpha * 0.25 + pointerBoost * 0.1);
    ctx.lineWidth = p.size * 0.3;
    ctx.stroke();

    // Layer 2: last 60%, medium
    const s2 = Math.floor(len * 0.4);
    drawSmooth(s2, len);
    ctx.strokeStyle = levelToParticleColor(currentLevel, baseAlpha * 0.5 + pointerBoost * 0.15);
    ctx.lineWidth = p.size * 0.6;
    ctx.stroke();

    // Layer 3: last 30%, bright head
    const s3 = Math.floor(len * 0.7);
    drawSmooth(s3, len);
    ctx.strokeStyle = levelToParticleColor(currentLevel, Math.min(baseAlpha * 0.9 + pointerBoost * 0.3, 1.0));
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
      p.trail = [];
    }
  }
}
