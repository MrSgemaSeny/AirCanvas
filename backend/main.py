from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from hand_tracker import HandTracker
import json

app = FastAPI(title="Air Canvas Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "*"],  # Vite dev server
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
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                continue

            if message.get("type") != "frame":
                continue

            frame_base64 = message.get("frame")
            if not frame_base64:
                continue
                
            hand_data = tracker.process_frame(frame_base64)

            if hand_data:
                await websocket.send_text(json.dumps({
                    "x": hand_data.x,
                    "y": hand_data.y,
                    "gesture": hand_data.gesture,
                    "drawing": hand_data.drawing,
                    "landmarks": hand_data.landmarks
                }))

    except WebSocketDisconnect:
        print("Client disconnected")

@app.get("/health")
def health():
    return {"status": "ok"}
