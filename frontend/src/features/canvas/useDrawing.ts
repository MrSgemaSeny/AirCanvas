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
  // Для плавности: Quadratic Curve
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  // Для фильтрации дрожания руки: EMA (Exponential Moving Average)
  const smoothedPointRef = useRef<{ x: number; y: number } | null>(null);

  const EMA_ALPHA = 0.4; // Коэффициент сглаживания (0..1). Меньше = плавнее, но с задержкой

  const handleHandData = useCallback((data: HandData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Жест "стоп", "none", или "clear" (теперь очистка с задержкой) — поднять перо
    if (!data.drawing || data.gesture === 'clear') {
      pointsRef.current = [];
      smoothedPointRef.current = null;
      return;
    }

    // Сырые координаты
    const rawX = (1 - data.x) * canvas.width;
    const rawY = data.y * canvas.height;

    // Применяем EMA фильтр для устранения микро-дрожаний
    let x = rawX;
    let y = rawY;
    if (smoothedPointRef.current) {
      x = smoothedPointRef.current.x + EMA_ALPHA * (rawX - smoothedPointRef.current.x);
      y = smoothedPointRef.current.y + EMA_ALPHA * (rawY - smoothedPointRef.current.y);
    }
    smoothedPointRef.current = { x, y };
    const currentPoint = { x, y };

    pointsRef.current.push(currentPoint);
    const points = pointsRef.current;

    // Рисуем сглаженную кривую (нужно минимум 3 точки)
    if (points.length >= 3) {
      ctx.save();
      
      if (brushStyle === 'glow') {
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
      } else {
        ctx.shadowBlur = 0;
      }

      if (brushStyle === 'spray') {
        for (let i = 0; i < 25; i++) {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * brushSize * 2.5;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(
            currentPoint.x + Math.cos(angle) * radius,
            currentPoint.y + Math.sin(angle) * radius,
            Math.random() * 1.5, 0, Math.PI * 2
          );
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Перерисовываем последние несколько сегментов как одну кривую Безье
        const p1 = points[points.length - 3];
        const p2 = points[points.length - 2];
        const p3 = points[points.length - 1];

        // Центр между p1 и p2
        const xc1 = (p1.x + p2.x) / 2;
        const yc1 = (p1.y + p2.y) / 2;
        // Центр между p2 и p3
        const xc2 = (p2.x + p3.x) / 2;
        const yc2 = (p2.y + p3.y) / 2;

        ctx.moveTo(xc1, yc1);
        ctx.quadraticCurveTo(p2.x, p2.y, xc2, yc2);
        ctx.stroke();
      }
      
      ctx.restore();
      
      // Оставляем только последние точки в памяти для непрерывности
      if (points.length > 3) {
        points.shift();
      }
    } else if (points.length === 2 && brushStyle !== 'spray') {
      // Для начала линии
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
      ctx.restore();
    }

  }, [canvasRef, color, brushSize, brushStyle]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    pointsRef.current = [];
    smoothedPointRef.current = null;
  }, [canvasRef]);

  return { handleHandData, clearCanvas };
}
