import { clamp } from '../utils/math';
import type { Theme } from '../types';

// Color stops: level (mAOD) → [hue, saturation%, lightness%]
const COLOR_STOPS: [number, [number, number, number]][] = [
  [-2.0, [230, 70, 12]], // Deep midnight blue
  [-0.5, [195, 60, 18]], // Dark teal
  [0.5, [175, 55, 30]],  // Aquamarine
  [2.0, [165, 50, 42]],  // Cyan-green
  [3.5, [42, 80, 55]],   // Warm gold
];

function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function levelToHSL(level: number): [number, number, number] {
  const clamped = clamp(level, COLOR_STOPS[0][0], COLOR_STOPS[COLOR_STOPS.length - 1][0]);

  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const [lvlA, colA] = COLOR_STOPS[i];
    const [lvlB, colB] = COLOR_STOPS[i + 1];
    if (clamped >= lvlA && clamped <= lvlB) {
      const t = (clamped - lvlA) / (lvlB - lvlA);
      return lerpColor(colA, colB, t);
    }
  }

  return COLOR_STOPS[COLOR_STOPS.length - 1][1];
}

export function levelToCSS(level: number, alpha = 1): string {
  const [h, s, l] = levelToHSL(level);
  return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
}

export function levelToBackground(level: number, theme: Theme): string {
  const [h, s, l] = levelToHSL(level);
  if (theme === 'light') {
    return `hsl(${h}, ${s * 0.15}%, ${92 + l * 0.1}%)`;
  }
  return `hsl(${h}, ${s * 0.5}%, ${l * 0.15}%)`;
}

export function levelToParticleColor(level: number, alpha: number, theme: Theme): string {
  const [h, s, l] = levelToHSL(level);
  if (theme === 'light') {
    return `hsla(${h}, ${Math.min(s + 25, 100)}%, ${clamp(l + 35, 45, 70)}%, ${alpha})`;
  }
  return `hsla(${h}, ${Math.min(s + 15, 100)}%, ${Math.min(l + 40, 85)}%, ${alpha})`;
}

export function levelToGlowColor(level: number, alpha: number, theme: Theme): string {
  const [h, s, l] = levelToHSL(level);
  if (theme === 'light') {
    return `hsla(${h}, ${Math.min(s + 20, 100)}%, ${clamp(l + 30, 40, 65)}%, ${alpha})`;
  }
  return `hsla(${h}, ${s + 10}%, ${Math.min(l + 30, 85)}%, ${alpha})`;
}
