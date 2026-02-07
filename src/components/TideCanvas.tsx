import { useRef, useEffect, useCallback } from 'react';
import type { TideData, VisualizationState, PointerState, Theme } from '../types';
import { useCanvasSize } from '../hooks/useCanvasSize';
import { renderFrame, renderInitialBackground } from '../engine/renderer';
import { invalidateTideCurveCache, CURVE_HEIGHT_FRACTION } from '../engine/tideCurve';

const TRANSITION_MS = 800;
const SNAPBACK_MS = 1200;
const SNAPBACK_DELAY_MS = 2000;

// Scrolling window matches tideCurve.ts
const PAST_HOURS = 12;
const FUTURE_HOURS = 12;
const TOTAL_WINDOW_MS = (PAST_HOURS + FUTURE_HOURS) * 3600 * 1000;

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

  // Time-scrub state
  const timeOffsetRef = useRef(0); // current offset in ms (negative = past, positive = future)
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const snapbackRafRef = useRef(0);
  const snapbackTimerRef = useRef(0);

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

  // Snap-back animation: eases timeOffset back to 0
  const startSnapback = useCallback(() => {
    cancelAnimationFrame(snapbackRafRef.current);
    const startOffset = timeOffsetRef.current;
    if (Math.abs(startOffset) < 1) { timeOffsetRef.current = 0; return; }

    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - startTime) / SNAPBACK_MS, 1);
      timeOffsetRef.current = startOffset * (1 - easeInOut(t));
      if (t < 1) snapbackRafRef.current = requestAnimationFrame(step);
      else timeOffsetRef.current = 0;
    };
    snapbackRafRef.current = requestAnimationFrame(step);
  }, []);

  const scheduleSnapback = useCallback(() => {
    clearTimeout(snapbackTimerRef.current);
    snapbackTimerRef.current = window.setTimeout(startSnapback, SNAPBACK_DELAY_MS);
  }, [startSnapback]);

  // Pointer & drag handlers — only start drag if tap is within the tide curve area
  const handlePointerDown = useCallback((e: PointerEvent) => {
    const curveTop = height * (1 - CURVE_HEIGHT_FRACTION);
    if (e.clientY < curveTop) return; // tap is above the curve region

    // Cancel any in-progress snapback
    cancelAnimationFrame(snapbackRafRef.current);
    clearTimeout(snapbackTimerRef.current);

    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartOffsetRef.current = timeOffsetRef.current;
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }, [height]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    pointerRef.current = { x: e.clientX, y: e.clientY, active: true };

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartXRef.current;
      // Convert pixels to time: dragging left = moving into future (positive offset)
      // Full screen width = total time window
      const pxToMs = TOTAL_WINDOW_MS / (width || 1);
      timeOffsetRef.current = dragStartOffsetRef.current - dx * pxToMs;
      // Clamp to ±6 hours
      const maxOffset = 6 * 3600 * 1000;
      timeOffsetRef.current = Math.max(-maxOffset, Math.min(maxOffset, timeOffsetRef.current));
    }
  }, [width]);

  const handlePointerUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      scheduleSnapback();
    }
  }, [scheduleSnapback]);

  const handlePointerLeave = useCallback(() => {
    pointerRef.current = { ...pointerRef.current, active: false };
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      scheduleSnapback();
    }
  }, [scheduleSnapback]);

  // Wheel to scrub time
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    cancelAnimationFrame(snapbackRafRef.current);
    clearTimeout(snapbackTimerRef.current);

    const pxToMs = TOTAL_WINDOW_MS / (width || 1);
    timeOffsetRef.current += e.deltaX * pxToMs * 0.5;
    // Also allow vertical scroll (for mice without horizontal scroll)
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
      timeOffsetRef.current += e.deltaY * pxToMs * 0.5;
    }
    const maxOffset = 6 * 3600 * 1000;
    timeOffsetRef.current = Math.max(-maxOffset, Math.min(maxOffset, timeOffsetRef.current));

    scheduleSnapback();
  }, [width, scheduleSnapback]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('wheel', handleWheel);
      cancelAnimationFrame(snapbackRafRef.current);
      clearTimeout(snapbackTimerRef.current);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp, handlePointerLeave, handleWheel]);

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
        timeOffset: timeOffsetRef.current,
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
