import { useRef, useEffect, useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { useDrawing } from './useDrawing';
import type { BrushStyle } from './useDrawing';
import type { HandData } from '../../shared/types/HandData';
import { Palette, Eraser, SprayCan, PenTool, Sparkles, Activity } from 'lucide-react';

const COLORS = ['#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
const BRUSH_SIZES = [2, 6, 12, 24];
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
  const [brushSize, setBrushSize] = useState(6);
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

  // Отправка кадров
  useEffect(() => {
    const sendFrameLoop = () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = 320;
      tmpCanvas.height = 240;
      const tmpCtx = tmpCanvas.getContext('2d');
      if (!tmpCtx) return;

      tmpCtx.drawImage(video, 0, 0, 320, 240);
      const base64 = tmpCanvas.toDataURL('image/jpeg', 0.7).split(',')[1];
      sendFrame(base64);
    };

    frameIntervalRef.current = window.setInterval(sendFrameLoop, 33);
    return () => window.clearInterval(frameIntervalRef.current);
  }, [sendFrame]);

  // Размер canvas
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

  return (
    <div className="relative w-screen h-screen bg-dot-pattern overflow-hidden">
      
      {/* Background Gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-900/50 to-black pointer-events-none z-0" />

      {/* Основной canvas для рисования */}
      <canvas ref={canvasRef} className="absolute inset-0 z-10" />

      {/* Connection Status & Instructions (Top Left) */}
      <div className="absolute top-6 left-6 z-20 flex flex-col gap-4">
        <div className="inline-flex items-center gap-2.5 bg-white/5 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-2xl shadow-xl">
          <div className="relative flex items-center justify-center">
            <div className={`absolute w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping opacity-75' : 'bg-red-400'}`} />
            <div className={`relative w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-500'}`} />
          </div>
          <span className="text-white/80 text-[11px] font-semibold uppercase tracking-widest">
            {isConnected ? 'System Online' : 'Connecting'}
          </span>
        </div>

        {/* Инструкция, появляется более премиально */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-2xl shadow-xl w-64 text-white/70">
          <div className="flex items-center gap-2 text-white mb-3">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-sm">Gestures</h3>
          </div>
          <div className="space-y-2.5 text-xs font-medium">
            <div className="flex justify-between items-center">
              <span className="text-white/50">Draw</span>
              <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-md">1 Finger</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/50">Pause</span>
              <span className="bg-amber-500/20 text-amber-300 px-2.5 py-1 rounded-md">2 Fingers</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/50">Clear</span>
              <span className="bg-rose-500/20 text-rose-300 px-2.5 py-1 rounded-md">Fist</span>
            </div>
          </div>
        </div>
      </div>

      {/* Вебкамера & Текущий жест (Top Right) */}
      <div className="absolute top-6 right-6 z-20 flex flex-col items-end gap-3">
        <div className="relative group">
          {/* Свечение вокруг камеры при рисовании */}
          <div className={`absolute -inset-1 rounded-3xl blur-md transition-opacity duration-500
            ${gesture === 'draw' ? 'bg-emerald-500/30 opacity-100' : 'opacity-0'}`} />
          
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="relative w-56 aspect-video rounded-2xl border border-white/10 object-cover scale-x-[-1] shadow-2xl bg-zinc-900"
          />
          
          {/* Плашка текущего жеста прямо на камере */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
             <span className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg border border-white/20 backdrop-blur-md transition-all duration-300 ease-out
              ${gesture === 'draw'  ? 'bg-emerald-500/80 text-white' :
                gesture === 'stop'  ? 'bg-amber-500/80 text-black' :
                gesture === 'clear' ? 'bg-rose-500/80 text-white' :
                                      'bg-black/60 text-white/50'}`}>
              {gesture === 'draw' ? 'Drawing' :
               gesture === 'stop' ? 'Paused' :
               gesture === 'clear' ? 'Clearing' : 'No Hand'}
            </span>
          </div>
        </div>
      </div>

      {/* Панель управления — снизу */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
        <div className="flex items-center gap-6 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2rem] px-8 py-4 shadow-2xl">
          
          {/* Цвета */}
          <div className="flex items-center gap-3">
            <Palette className="w-4 h-4 text-white/30 mr-1" />
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="group relative w-7 h-7 rounded-full transition-transform active:scale-90"
                aria-label={`Color ${c}`}
              >
                <div 
                  className="absolute inset-0 rounded-full border-2 transition-colors"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? '#fff' : 'transparent',
                    boxShadow: color === c ? `0 0 20px ${c}60` : 'none'
                  }}
                />
              </button>
            ))}
          </div>

          <div className="w-px h-8 bg-white/10" />

          {/* Стили кисти */}
          <div className="flex items-center gap-2">
            {BRUSH_STYLES.map((s) => {
              const Icon = s.icon;
              const isActive = brushStyle === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setBrushStyle(s.id)}
                  className={`p-2.5 rounded-xl transition-all active:scale-90 flex items-center gap-2
                             ${isActive ? 'bg-white/15 text-white shadow-inner' : 'text-white/40 hover:bg-white/5 hover:text-white/70'}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>

          <div className="w-px h-8 bg-white/10" />

          {/* Размер кисти */}
          <div className="flex items-center gap-4 px-2">
            {BRUSH_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => setBrushSize(size)}
                className="group flex items-center justify-center w-8 h-8 transition-transform active:scale-90"
              >
                <div 
                  className={`rounded-full transition-all duration-300 ease-out
                    ${brushSize === size ? 'bg-white shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'bg-white/20 group-hover:bg-white/40'}`}
                  style={{ width: Math.max(6, size), height: Math.max(6, size) }}
                />
              </button>
            ))}
          </div>

          <div className="w-px h-8 bg-white/10" />

          {/* Очистить */}
          <button
            onClick={clearCanvas}
            className="flex items-center gap-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-5 py-2.5 rounded-xl transition-all active:scale-95 font-semibold text-sm"
          >
            <Eraser className="w-4 h-4" />
            Clear
          </button>

        </div>
      </div>

    </div>
  );
}
