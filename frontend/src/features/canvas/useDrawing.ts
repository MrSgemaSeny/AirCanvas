import { useRef, useCallback } from 'react';
import type { HandData } from '../../shared/types/HandData';

export type BrushStyle = 'pen' | 'glow' | 'spray';

interface UseDrawingProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  color: string;
  brushSize: number;
  brushStyle?: BrushStyle;
}

export function useDrawing({ canvasRef, color, brushSize, brushStyle = 'pen' }: UseDrawingProps) {
  // Последняя точка — чтобы рисовать линию, а не точки
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const handleHandData = useCallback((data: HandData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Жест "кулак" — очистить холст
    if (data.gesture === 'clear') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      lastPointRef.current = null;
      return;
    }

    // Жест "стоп" или "none" — поднять перо
    if (!data.drawing) {
      lastPointRef.current = null;
      return;
    }

    // Конвертируем нормализованные координаты (0-1) в пиксели canvas
    // Зеркалим по X — вебкамера отражает как зеркало
    const x = (1 - data.x) * canvas.width;
    const y = data.y * canvas.height;

    const currentPoint = { x, y };

    if (lastPointRef.current) {
      ctx.save();
      
      // Эффекты кисти (Phase 4)
      if (brushStyle === 'glow') {
        ctx.shadowBlur = 20;
        ctx.shadowColor = color;
      } else {
        ctx.shadowBlur = 0;
      }

      if (brushStyle === 'spray') {
        for (let i = 0; i < 20; i++) {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * brushSize * 3;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(
            currentPoint.x + Math.cos(angle) * radius,
            currentPoint.y + Math.sin(angle) * radius,
            1, 0, Math.PI * 2
          );
          ctx.fill();
        }
      } else {
        // Рисуем обычную линию от предыдущей точки к текущей
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
        ctx.lineTo(currentPoint.x, currentPoint.y);
        ctx.stroke();
      }
      
      ctx.restore();
    }

    // Визуализация руки (Phase 4)
    if (data.drawing && brushStyle !== 'spray') {
      ctx.beginPath();
      ctx.arc(x, y, brushSize / 2 + 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fill();
    }

    lastPointRef.current = currentPoint;
  }, [canvasRef, color, brushSize, brushStyle]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    lastPointRef.current = null;
  }, [canvasRef]);

  return { handleHandData, clearCanvas };
}
