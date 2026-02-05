import { useState, useEffect } from 'react';

interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

export function useCanvasSize(): CanvasSize {
  const [size, setSize] = useState<CanvasSize>({
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
  });

  useEffect(() => {
    const handleResize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}
