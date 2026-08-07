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
