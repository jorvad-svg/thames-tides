import { useRef, useEffect, useCallback } from 'react';
import type { TideData, VisualizationState, PointerState } from '../types';
import { useCanvasSize } from '../hooks/useCanvasSize';
import { renderFrame, renderInitialBackground } from '../engine/renderer';
import { initParticles, resizeParticles } from '../engine/particles';

interface TideCanvasProps {
  data: TideData;
}

export function TideCanvas({ data }: TideCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, dpr } = useCanvasSize();
  const animTimeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const initializedRef = useRef(false);
  const pointerRef = useRef<PointerState>({ x: 0, y: 0, active: false });

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

  // Initialize particles once
  useEffect(() => {
    if (!initializedRef.current) {
      initParticles(width, height);
      initializedRef.current = true;
    } else {
      resizeParticles(width, height);
    }
  }, [width, height]);

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
    renderInitialBackground(ctx, width, height, data.currentLevel);
  }, [width, height, dpr, data.currentLevel]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const animate = (timestamp: number) => {
      if (lastFrameRef.current === 0) lastFrameRef.current = timestamp;
      const dt = (timestamp - lastFrameRef.current) / 1000;
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
        time: animTimeRef.current,
        pointer: pointerRef.current,
      };

      renderFrame(ctx, state);

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [width, height, dpr, data]);

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
