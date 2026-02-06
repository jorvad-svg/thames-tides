import { useRef, useEffect, useCallback } from 'react';
import type { TideData, VisualizationState, PointerState, Theme } from '../types';
import { useCanvasSize } from '../hooks/useCanvasSize';
import { renderFrame, renderInitialBackground } from '../engine/renderer';
import { invalidateTideCurveCache } from '../engine/tideCurve';

const TRANSITION_MS = 800;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

interface TideCanvasProps {
  data: TideData;
  theme: Theme;
  stationId: string;
}

export function TideCanvas({ data, theme, stationId }: TideCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, dpr } = useCanvasSize();
  const animTimeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const pointerRef = useRef<PointerState>({ x: 0, y: 0, active: false });

  // Invalidate canvas caches when station changes
  useEffect(() => {
    invalidateTideCurveCache();
  }, [stationId]);

  // Theme blend animation (0 = dark, 1 = light)
  const blendRef = useRef(theme === 'light' ? 1 : 0);
  const blendTargetRef = useRef(blendRef.current);

  useEffect(() => {
    const target = theme === 'light' ? 1 : 0;
    blendTargetRef.current = target;
    const start = blendRef.current;
    if (start === target) return;

    const startTime = performance.now();
    let rafId: number;

    const step = (now: number) => {
      const t = Math.min((now - startTime) / TRANSITION_MS, 1);
      blendRef.current = start + (target - start) * easeInOut(t);
      if (t < 1) rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [theme]);

  // Pointer handlers
  const handlePointerMove = useCallback((e: PointerEvent) => {
    pointerRef.current = { x: e.clientX, y: e.clientY, active: true };
  }, []);

  const handlePointerLeave = useCallback(() => {
    pointerRef.current = { ...pointerRef.current, active: false };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [handlePointerMove, handlePointerLeave]);

  // Set canvas size and run initial background fill
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderInitialBackground(ctx, width, height, data.currentLevel, blendRef.current);
  }, [width, height, dpr, data.currentLevel]);

  // Animation loop — reads blendRef each frame, no dependency on theme
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const FRAME_INTERVAL = 1000 / 30; // cap at 30fps

    const animate = (timestamp: number) => {
      if (lastFrameRef.current === 0) lastFrameRef.current = timestamp;

      const elapsed = timestamp - lastFrameRef.current;
      if (elapsed < FRAME_INTERVAL) {
        animId = requestAnimationFrame(animate);
        return;
      }

      const dt = elapsed / 1000;
      lastFrameRef.current = timestamp;
      animTimeRef.current += dt;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const state: VisualizationState = {
        width,
        height,
        dpr,
        currentLevel: data.currentLevel,
        tideState: data.tideState,
        rateOfChange: data.rateOfChange,
        readings: data.readings,
        predictions: data.predictions,
        time: animTimeRef.current,
        pointer: pointerRef.current,
        theme,
        themeBlend: blendRef.current,
        stationId,
      };

      renderFrame(ctx, state);

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [width, height, dpr, data, theme]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        touchAction: 'none',
      }}
    />
  );
}
