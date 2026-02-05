import { clamp } from '../utils/math';

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

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function levelToBackground(level: number, blend: number): string {
  const [h, s, l] = levelToHSL(level);
  const finalS = mix(s * 0.5, s * 0.15, blend);
  const darkL = Math.min(l * 0.15, 8); // cap dark-mode background so greens stay dark
  const finalL = mix(darkL, 92 + l * 0.1, blend);
  return `hsl(${h}, ${finalS}%, ${finalL}%)`;
}

export function levelToParticleColor(level: number, alpha: number, blend: number): string {
  const [h, s, l] = levelToHSL(level);
  const darkS = Math.min(s + 15, 100);
  const darkL = clamp(l + 20, 30, 50);
  const lightS = Math.min(s + 25, 100);
  const lightL = clamp(l + 35, 45, 70);
  return `hsla(${h}, ${mix(darkS, lightS, blend)}%, ${mix(darkL, lightL, blend)}%, ${alpha})`;
}

export function levelToGlowColor(level: number, alpha: number, blend: number): string {
  const [h, s, l] = levelToHSL(level);
  const darkS = s + 10;
  const darkL = clamp(l + 15, 25, 45);
  const lightS = Math.min(s + 20, 100);
  const lightL = clamp(l + 30, 40, 65);
  return `hsla(${h}, ${mix(darkS, lightS, blend)}%, ${mix(darkL, lightL, blend)}%, ${alpha})`;
}

/** Returns true when overlay text should be dark (black) for readability. */
export function needsDarkText(level: number, blend: number): boolean {
  if (blend < 0.5) return false;
  const [, , l] = levelToHSL(level);
  return l >= 20;
}
