import { useRef, useEffect, useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { useDrawing } from './useDrawing';
import type { BrushStyle } from './useDrawing';
import type { HandData } from '../../shared/types/HandData';
import { Palette, Eraser, SprayCan, PenTool, Sparkles, AlertCircle } from 'lucide-react';

const COLORS = ['#ffffff', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7'];
const BRUSH_SIZES = [2, 5, 10, 20];
const BRUSH_STYLES: { id: BrushStyle, icon: any, label: string }[] = [
  { id: 'pen', icon: PenTool, label: 'Pen' },
  { id: 'glow', icon: Sparkles, label: 'Glow' },
  { id: 'spray', icon: SprayCan, label: 'Spray' },
];

export function AirCanvas() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIntervalRef = useRef<number | undefined>(undefined);

  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(5);
  const [brushStyle, setBrushStyle] = useState<BrushStyle>('pen');
  const [gesture, setGesture] = useState<string>('none');
  const [isConnected, setIsConnected] = useState(false);

  const { handleHandData, clearCanvas } = useDrawing({ canvasRef, color, brushSize, brushStyle });

  const onHandData = useCallback((data: HandData) => {
    setGesture(data.gesture);
    handleHandData(data);
  }, [handleHandData]);

  const { sendFrame, isConnected: wsIsConnected } = useWebSocket(onHandData);

  useEffect(() => {
    setIsConnected(wsIsConnected);
  }, [wsIsConnected]);

  // Захват вебкамеры
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        console.error("Camera access denied or unavailable", err);
      });
  }, []);

  // Отправка кадров на Python каждые 33ms (30fps)
  useEffect(() => {
    const sendFrameLoop = () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      // Временный canvas для захвата кадра из video
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = 320;   // Уменьшаем для скорости передачи
      tmpCanvas.height = 240;
      const tmpCtx = tmpCanvas.getContext('2d');
      if (!tmpCtx) return;

      tmpCtx.drawImage(video, 0, 0, 320, 240);
      // Качество 0.7 — баланс скорость/точность
      const base64 = tmpCanvas.toDataURL('image/jpeg', 0.7).split(',')[1];
      sendFrame(base64);
    };

    frameIntervalRef.current = setInterval(sendFrameLoop, 33);
    return () => clearInterval(frameIntervalRef.current);
  }, [sendFrame]);

  // Размер canvas под окно
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const gestureLabel: Record<string, string> = {
    draw:  'РИСУЮ',
    stop:  'ПАУЗА',
    clear: 'ОЧИСТКА',
    none:  'НЕТ РУКИ'
  };

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans">

      {/* Connection Status */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'}`} />
        <span className="text-white/60 text-xs font-medium uppercase tracking-wider">
          {isConnected ? 'Backend Online' : 'Connecting...'}
        </span>
      </div>

      {/* Вебкамера — маленькая, в углу */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute top-12 right-4 w-48 h-36 rounded-xl border border-white/10 opacity-70 z-10 scale-x-[-1] shadow-2xl object-cover"
      />

      {/* Основной canvas для рисования */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0" />

      {/* Панель управления — снизу */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20
                      flex items-center gap-6 bg-zinc-900/80 backdrop-blur-md border border-white/10
                      rounded-full px-6 py-4 shadow-2xl transition-all">

        {/* Цвета */}
        <div className="flex gap-2 items-center">
          <Palette className="text-white/40 w-5 h-5 mr-1" />
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110 cursor-pointer"
              style={{
                backgroundColor: c,
                borderColor: color === c ? '#fff' : 'transparent',
                boxShadow: color === c ? `0 0 12px ${c}80` : 'none'
              }}
              title={c}
            />
          ))}
        </div>

        <div className="w-px h-8 bg-white/10" />

        {/* Стили кисти (Phase 4) */}
        <div className="flex gap-3 items-center">
          {BRUSH_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setBrushStyle(s.id)}
              className={`p-2 rounded-full transition-all cursor-pointer flex items-center justify-center
                         ${brushStyle === s.id ? 'bg-white/20 text-white' : 'text-white/40 hover:bg-white/10 hover:text-white/70'}`}
              title={s.label}
            >
              <s.icon className="w-5 h-5" />
            </button>
          ))}
        </div>

        <div className="w-px h-8 bg-white/10" />

        {/* Размер кисти */}
        <div className="flex gap-3 items-center justify-center min-w-[100px]">
          {BRUSH_SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setBrushSize(s)}
              className={`rounded-full bg-white transition-all hover:scale-125 cursor-pointer
                         ${brushSize === s ? 'opacity-100 shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'opacity-30'}`}
              style={{ width: Math.max(6, s * 1.2), height: Math.max(6, s * 1.2) }}
              title={`${s}px`}
            />
          ))}
        </div>

        <div className="w-px h-8 bg-white/10" />

        {/* Очистить */}
        <button
          onClick={clearCanvas}
          className="flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-950/30 px-4 py-2 rounded-full transition-colors cursor-pointer text-sm font-medium"
        >
          <Eraser className="w-4 h-4" />
          Очистить
        </button>
      </div>

      {/* Статус жеста — сверху слева */}
      <div className="absolute top-6 left-6 z-20 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-colors duration-300 shadow-lg border border-white/10
            ${gesture === 'draw'  ? 'bg-green-500/90 text-white' :
              gesture === 'stop'  ? 'bg-yellow-500/90 text-black' :
              gesture === 'clear' ? 'bg-red-500/90 text-white' :
                                    'bg-zinc-800/80 text-white/50 backdrop-blur'}`}>
            {gestureLabel[gesture] ?? 'ОЖИДАНИЕ...'}
          </span>
        </div>
        
        {/* Инструкция */}
        <div className="mt-2 bg-zinc-900/60 backdrop-blur-sm border border-white/10 p-3 rounded-xl max-w-xs text-white/70 text-xs leading-relaxed">
          <p className="font-bold text-white mb-1 flex items-center gap-1.5"><AlertCircle className="w-3 h-3 text-blue-400"/> Как рисовать:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li><span className="text-green-400 font-medium">1 палец</span> — рисовать</li>
            <li><span className="text-yellow-400 font-medium">2 пальца</span> — пауза</li>
            <li><span className="text-red-400 font-medium">Кулак</span> — очистить холст</li>
          </ul>
        </div>
      </div>

    </div>
  );
}
