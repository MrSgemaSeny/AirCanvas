# AIR_CANVAS — PROJECT LIFECYCLE
# TRACK: SIMPLE
# Стек: Python (FastAPI + MediaPipe) + React (TS + Canvas API)
# Срок: 1 неделя

---

## PROJECT STATUS BLOCK

```
PROJECT:       Air Canvas
TRACK:         SIMPLE
CURRENT PHASE: 5
CURRENT SUBPHASE: 5.1
LAST UPDATED:  2026-08-07
BLOCKER:       Нет
NEXT STEP:     Финализация, README.md, проверка всех функций.
```

---

## ФАЗА 1 — ИНИЦИАЛИЗАЦИЯ И КЛАССИФИКАЦИЯ

### 1.1 Идея и скоуп

**Что это:**
Браузерное приложение — рисуешь в воздухе перед вебкамерой указательным
пальцем, на экране появляется линия. Жесты меняют цвет, толщину, очищают холст.

**Пользователи:**
Один — сам автор. Пет-проект для изучения MediaPipe + FastAPI + WebSocket.

**Что входит в MVP:**
- [x] Трекинг указательного пальца через вебкамеру
- [x] Рисование линии на canvas по координатам пальца
- [x] Жест "два пальца" — остановить рисование (поднять "перо")
- [x] Жест "кулак" — очистить холст
- [x] Смена цвета через UI (не жест — упрощение)
- [x] WebSocket между Python и React

**Что НЕ входит в MVP (out of scope):**
- Авторизация — не нужна
- База данных — не нужна
- Сохранение рисунков — не нужна
- Распознавание букв/слов — следующая итерация
- Мобильная поддержка — вебкамера на десктопе

**Масштаб:** 1 пользователь (локально)

---

### 1.2 Выбор стека

| Слой | Технология | Почему |
|------|-----------|--------|
| Hand tracking | MediaPipe Hands (Google) | Лучшая open source библиотека для трекинга рук, работает на CPU |
| Backend | Python + FastAPI | MediaPipe — Python-библиотека; FastAPI даёт WebSocket из коробки |
| Transport | WebSocket | Нужен стриминг координат в реальном времени, REST не подходит |
| Frontend | React + TypeScript | Знакомый стек; Canvas API для рисования |
| Стилизация | Tailwind CSS | Быстро, знакомо |
| Деплой | Локально | SIMPLE track, вебкамера требует localhost |

**Почему не один Python без React:**
OpenCV window неудобен для UI. React даёт нормальный canvas, цветовые пикеры,
кнопки — без написания UI на чистом tkinter.

**Почему WebSocket, а не HTTP polling:**
Координаты пальца обновляются 30 раз в секунду. HTTP polling с такой частотой —
это оверхед и задержка. WebSocket — persistent соединение, данные летят сразу.

---

### 1.3 Архитектура

```
┌─────────────────────────────────────────────────────┐
│                   БРАУЗЕР (React)                    │
│                                                      │
│  ┌──────────────┐         ┌────────────────────┐    │
│  │   <video>    │         │     <canvas>        │    │
│  │  (вебкамера) │         │  (рисунок)          │    │
│  └──────────────┘         └────────────────────┘    │
│         │                          ↑                 │
│         │ MediaStream              │ координаты      │
│         ↓                          │                 │
│  ┌──────────────────────────────────────────────┐   │
│  │           WebSocket Client                    │   │
│  └──────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────┘
                         │ ws://localhost:8002/ws
                         │ JSON: {x, y, gesture, drawing}
┌────────────────────────▼────────────────────────────┐
│                  Python (FastAPI)                    │
│                                                      │
│  WebSocket endpoint  →  MediaPipe Hands              │
│                              │                       │
│                         Анализ жеста                 │
│                         {gesture, x, y, drawing}     │
└─────────────────────────────────────────────────────┘
```

**Поток данных:**
1. React захватывает кадр с вебкамеры каждые ~33ms (30fps)
2. Отправляет кадр как base64 через WebSocket на Python
3. Python прогоняет кадр через MediaPipe → получает координаты
4. Определяет жест → отправляет обратно `{x, y, gesture, drawing}`
5. React рисует на canvas

---

### 1.4 Структура репозитория

```
air-canvas/
├── backend/
│   ├── main.py              # FastAPI app + WebSocket endpoint
│   ├── hand_tracker.py      # MediaPipe логика
│   ├── gesture_detector.py  # Определение жестов
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   └── App.tsx
│   │   ├── features/
│   │   │   ├── canvas/
│   │   │   │   ├── AirCanvas.tsx      # Главный компонент
│   │   │   │   ├── useDrawing.ts      # Логика рисования
│   │   │   │   └── useWebSocket.ts    # WS соединение
│   │   │   └── controls/
│   │   │       └── ColorPicker.tsx
│   │   └── shared/
│   │       └── types/
│   │           └── HandData.ts
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── .gitignore
└── README.md
```

---

## ФАЗА 2 — ДЕНЬ 1-2: PYTHON BACKEND

### 2.1 Что делаем

FastAPI WebSocket сервер который:
1. Принимает кадр с вебкамеры (base64 JPEG)
2. Прогоняет через MediaPipe Hands
3. Определяет жест
4. Возвращает координаты и жест

### 2.2 Установка зависимостей

```bash
# backend/requirements.txt
fastapi==0.115.0
uvicorn[standard]==0.30.0
mediapipe==0.10.14
opencv-python==4.10.0.84
numpy==1.26.4
python-dotenv==1.0.1
websockets==13.0
```

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2.3 hand_tracker.py — MediaPipe логика

```python
import mediapipe as mp
import numpy as np
import cv2
import base64
from dataclasses import dataclass
from typing import Optional

@dataclass
class HandData:
    x: float           # 0.0 - 1.0 (нормализованные координаты)
    y: float           # 0.0 - 1.0
    gesture: str       # "draw" | "stop" | "clear" | "none"
    drawing: bool      # рисовать ли сейчас

class HandTracker:
    def __init__(self):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,    # видео режим, не фото
            max_num_hands=1,            # одна рука — достаточно
            min_detection_confidence=0.7,
            min_tracking_confidence=0.5
        )

    def process_frame(self, frame_base64: str) -> Optional[HandData]:
        """Принимает base64 кадр, возвращает HandData или None."""
        # Декодируем base64 → numpy array
        img_bytes = base64.b64decode(frame_base64)
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return None

        # MediaPipe работает с RGB, OpenCV даёт BGR
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.hands.process(rgb_frame)

        if not results.multi_hand_landmarks:
            return HandData(x=0, y=0, gesture="none", drawing=False)

        landmarks = results.multi_hand_landmarks[0].landmark
        gesture = self._detect_gesture(landmarks)

        # Координата кончика указательного пальца (landmark 8)
        index_tip = landmarks[8]

        return HandData(
            x=index_tip.x,
            y=index_tip.y,
            gesture=gesture,
            drawing=(gesture == "draw")
        )

    def _detect_gesture(self, landmarks) -> str:
        """
        Определяет жест по положению пальцев.
        Landmark индексы:
          4  = большой палец (tip)
          8  = указательный (tip)
          12 = средний (tip)
          16 = безымянный (tip)
          20 = мизинец (tip)
          Суставы: 6, 10, 14, 18 — средние суставы пальцев
        """
        # Пальцы "поднят" если tip выше (меньше y) чем средний сустав
        index_up  = landmarks[8].y  < landmarks[6].y
        middle_up = landmarks[12].y < landmarks[10].y
        ring_up   = landmarks[16].y < landmarks[14].y
        pinky_up  = landmarks[20].y < landmarks[18].y

        fingers_up = [index_up, middle_up, ring_up, pinky_up]
        count = sum(fingers_up)

        if count == 0:
            return "clear"   # кулак — очистить

        if count == 1 and index_up:
            return "draw"    # только указательный — рисуем

        if count == 2 and index_up and middle_up:
            return "stop"    # два пальца — поднять перо

        return "none"

    def close(self):
        self.hands.close()
```

### 2.4 main.py — FastAPI WebSocket

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from hand_tracker import HandTracker
import json

app = FastAPI(title="Air Canvas Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

tracker = HandTracker()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Client connected")

    try:
        while True:
            # Получаем кадр от React (base64 JPEG)
            data = await websocket.receive_text()
            message = json.loads(data)

            if message.get("type") != "frame":
                continue

            frame_base64 = message["frame"]
            hand_data = tracker.process_frame(frame_base64)

            if hand_data:
                await websocket.send_text(json.dumps({
                    "x": hand_data.x,
                    "y": hand_data.y,
                    "gesture": hand_data.gesture,
                    "drawing": hand_data.drawing
                }))

    except WebSocketDisconnect:
        print("Client disconnected")

@app.get("/health")
def health():
    return {"status": "ok"}
```

```bash
# Запуск
uvicorn main:app --reload --port 8002
```

---

## ФАЗА 3 — ДЕНЬ 3-4: REACT FRONTEND

### 3.1 Инициализация

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
npm install tailwindcss @tailwindcss/vite
```

### 3.2 Типы — shared/types/HandData.ts

```typescript
export interface HandData {
  x: number;        // 0.0 - 1.0
  y: number;        // 0.0 - 1.0
  gesture: 'draw' | 'stop' | 'clear' | 'none';
  drawing: boolean;
}

export interface DrawPoint {
  x: number;
  y: number;
}

export interface Stroke {
  points: DrawPoint[];
  color: string;
  width: number;
}
```

### 3.3 useWebSocket.ts — соединение с Python

```typescript
import { useEffect, useRef, useCallback } from 'react';
import type { HandData } from '../../shared/types/HandData';

interface UseWebSocketReturn {
  sendFrame: (frameBase64: string) => void;
  isConnected: boolean;
}

export function useWebSocket(
  onHandData: (data: HandData) => void
): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const isConnectedRef = useRef(false);

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket('ws://localhost:8002/ws');

      ws.onopen = () => {
        console.log('WS connected');
        isConnectedRef.current = true;
        wsRef.current = ws;
      };

      ws.onmessage = (event) => {
        try {
          const data: HandData = JSON.parse(event.data);
          onHandData(data);
        } catch (e) {
          console.error('Failed to parse hand data', e);
        }
      };

      ws.onclose = () => {
        console.log('WS disconnected, reconnecting...');
        isConnectedRef.current = false;
        // Переподключение через 1 сек
        setTimeout(connect, 1000);
      };

      ws.onerror = (err) => console.error('WS error', err);
    };

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, [onHandData]);

  const sendFrame = useCallback((frameBase64: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'frame',
        frame: frameBase64
      }));
    }
  }, []);

  return {
    sendFrame,
    isConnected: isConnectedRef.current
  };
}
```

### 3.4 useDrawing.ts — логика рисования

```typescript
import { useRef, useCallback } from 'react';
import type { HandData } from '../../shared/types/HandData';

interface UseDrawingProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  color: string;
  brushSize: number;
}

export function useDrawing({ canvasRef, color, brushSize }: UseDrawingProps) {
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
      // Рисуем линию от предыдущей точки к текущей
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(currentPoint.x, currentPoint.y);
      ctx.stroke();
    }

    lastPointRef.current = currentPoint;
  }, [canvasRef, color, brushSize]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    lastPointRef.current = null;
  }, [canvasRef]);

  return { handleHandData, clearCanvas };
}
```

### 3.5 AirCanvas.tsx — главный компонент

```typescript
import { useRef, useEffect, useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { useDrawing } from './useDrawing';
import { ColorPicker } from '../controls/ColorPicker';
import type { HandData } from '../../shared/types/HandData';

const COLORS = ['#ffffff', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7'];
const BRUSH_SIZES = [2, 5, 10, 20];

export function AirCanvas() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIntervalRef = useRef<number>();

  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(5);
  const [gesture, setGesture] = useState<string>('none');
  const [isConnected, setIsConnected] = useState(false);

  const { handleHandData, clearCanvas } = useDrawing({ canvasRef, color, brushSize });

  const onHandData = useCallback((data: HandData) => {
    setGesture(data.gesture);
    handleHandData(data);
  }, [handleHandData]);

  const { sendFrame } = useWebSocket(onHandData);

  // Захват вебкамеры
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(console.error);
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
    <div className="relative w-screen h-screen bg-black overflow-hidden">

      {/* Вебкамера — маленькая, в углу */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute top-4 right-4 w-48 h-36 rounded-lg opacity-60 z-10 scale-x-[-1]"
      />

      {/* Основной canvas для рисования */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0" />

      {/* Панель управления — снизу */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20
                      flex items-center gap-4 bg-white/10 backdrop-blur
                      rounded-2xl px-6 py-3">

        {/* Цвета */}
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                borderColor: color === c ? '#fff' : 'transparent'
              }}
            />
          ))}
        </div>

        <div className="w-px h-6 bg-white/30" />

        {/* Размер кисти */}
        <div className="flex gap-2 items-center">
          {BRUSH_SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setBrushSize(s)}
              className={`rounded-full bg-white transition-transform hover:scale-110
                         ${brushSize === s ? 'opacity-100' : 'opacity-40'}`}
              style={{ width: s * 2, height: s * 2 }}
            />
          ))}
        </div>

        <div className="w-px h-6 bg-white/30" />

        {/* Очистить */}
        <button
          onClick={clearCanvas}
          className="text-white/70 hover:text-white text-sm transition-colors"
        >
          Очистить
        </button>
      </div>

      {/* Статус жеста — сверху слева */}
      <div className="absolute top-4 left-4 z-20 font-mono text-sm">
        <span className={`px-3 py-1 rounded-full text-xs font-bold
          ${gesture === 'draw'  ? 'bg-green-500 text-white' :
            gesture === 'stop'  ? 'bg-yellow-500 text-black' :
            gesture === 'clear' ? 'bg-red-500 text-white' :
                                  'bg-white/20 text-white/50'}`}>
          {gestureLabel[gesture] ?? 'НЕТ РУКИ'}
        </span>
      </div>

    </div>
  );
}
```

---

## ФАЗА 4 — ДЕНЬ 5: ЭФФЕКТЫ И POLISH

### 4.1 Что добавить

**Brush styles** — три режима кисти:

```typescript
// В useDrawing.ts — добавить brushStyle пропс
type BrushStyle = 'pen' | 'glow' | 'spray';

// Glow эффект:
if (brushStyle === 'glow') {
  ctx.shadowBlur = 20;
  ctx.shadowColor = color;
} else {
  ctx.shadowBlur = 0;
}

// Spray эффект — случайные точки вокруг позиции:
if (brushStyle === 'spray') {
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * brushSize * 3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(
      x + Math.cos(angle) * radius,
      y + Math.sin(angle) * radius,
      1, 0, Math.PI * 2
    );
    ctx.fill();
  }
}
```

**Визуализация руки** — отрисовка точки на canvas где находится палец:

```typescript
// Добавить в handleHandData после рисования линии:
if (data.drawing) {
  // Белый кружок на кончике пальца
  ctx.beginPath();
  ctx.arc(x, y, brushSize / 2 + 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
}
```

---

## ФАЗА 5 — ДЕНЬ 6: ФИНАЛ

### 5.1 README.md (минимальный)

```markdown
# Air Canvas

Рисуй в воздухе перед вебкамерой.

## Жесты
- Указательный палец — рисовать
- Два пальца — пауза
- Кулак — очистить холст

## Запуск

### Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8002

### Frontend
cd frontend
npm install
npm run dev

Открыть: http://localhost:5173
```

### 5.2 .gitignore

```
# Python
backend/venv/
backend/__pycache__/
backend/*.pyc
backend/.env

# Node
frontend/node_modules/
frontend/dist/

# OS
.DS_Store
Thumbs.db
```

---

## ФАЗА 6 — ДЕНЬ 7: БУФЕР

Если всё сделано — следующая итерация:

- [ ] Распознавание букв (A-Z) через обученную модель
- [ ] Сохранение рисунка как PNG (кнопка Download)
- [ ] Несколько режимов: рисование / ластик / заливка
- [ ] Smooth interpolation между точками (Bezier curves)

---

## ПОДВОДНЫЕ КАМНИ

### MediaPipe

**Нормализованные координаты** — MediaPipe возвращает x/y в диапазоне 0-1,
не в пикселях. Не забудь умножить на ширину/высоту canvas.

**Зеркальное отражение** — вебкамера по умолчанию не зеркалит изображение.
Для интуитивного рисования нужно зеркалить по X: `realX = (1 - data.x) * width`.
В CSS на video добавь `scale-x-[-1]`, в логике рисования — `(1 - data.x)`.

**min_detection_confidence** — если 0.9, рука будет "теряться" при быстром
движении. 0.7 — хороший баланс.

### WebSocket

**Размер кадра** — JPEG качество 0.7 и размер 320x240 вместо full HD.
Full HD = ~500KB на кадр × 30fps = 15MB/s через localhost. Излишне.

**Reconnect логика** — WebSocket закрывается при потере соединения.
Обязательно реализуй автопереподключение (в useWebSocket.ts уже есть).

### Canvas

**Размер при ресайзе** — при изменении `canvas.width` или `canvas.height`
canvas полностью очищается. Если хочешь сохранять рисунок при ресайзе окна —
нужно сохранять ImageData и восстанавливать.

**lineCap: 'round'** — обязательно, иначе на стыках точек будут угловатые
артефакты.

---

## ЧЕКЛИСТ ПЕРЕД ФИНАЛЬНЫМ КОММИТОМ

- [ ] Python backend запускается с нуля: `pip install -r requirements.txt && uvicorn main:app`
- [ ] Frontend запускается с нуля: `npm install && npm run dev`
- [ ] Рисование работает
- [ ] Жест "кулак" очищает холст
- [ ] Жест "два пальца" останавливает рисование
- [ ] Смена цвета работает
- [ ] Нет секретов в коде
- [ ] README написан
- [ ] .gitignore настроен (нет venv/ и node_modules/ в репо)
