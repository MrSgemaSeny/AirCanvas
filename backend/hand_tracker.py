import mediapipe as mp
import numpy as np
import cv2
import base64
from dataclasses import dataclass
from typing import Optional, List, Dict

@dataclass
class HandData:
    x: float           # 0.0 - 1.0 (нормализованные координаты)
    y: float           # 0.0 - 1.0
    gesture: str       # "draw" | "stop" | "clear" | "none"
    drawing: bool      # рисовать ли сейчас
    landmarks: List[Dict[str, float]] = None


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
        try:
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

            landmarks_list = [{"x": lm.x, "y": lm.y} for lm in landmarks]

            return HandData(
                x=index_tip.x,
                y=index_tip.y,
                gesture=gesture,
                drawing=(gesture == "draw"),
                landmarks=landmarks_list
            )
        except Exception as e:
            print(f"Error processing frame: {e}")
            return None

    def _detect_gesture(self, landmarks) -> str:
        """
        Определяет жест по положению пальцев. Не зависит от поворота кисти.
        Landmark индексы:
          0  = запястье (wrist)
          8  = указательный (tip), 6 = сустав (pip)
          12 = средний (tip), 10 = сустав (pip)
          16 = безымянный (tip), 14 = сустав (pip)
          20 = мизинец (tip), 18 = сустав (pip)
        """
        import math
        wrist = landmarks[0]

        def is_open(tip_idx, pip_idx):
            tip = landmarks[tip_idx]
            pip = landmarks[pip_idx]
            dist_tip = math.hypot(tip.x - wrist.x, tip.y - wrist.y)
            dist_pip = math.hypot(pip.x - wrist.x, pip.y - wrist.y)
            return dist_tip > dist_pip

        index_up = is_open(8, 6)
        middle_up = is_open(12, 10)
        ring_up = is_open(16, 14)
        pinky_up = is_open(20, 18)

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
