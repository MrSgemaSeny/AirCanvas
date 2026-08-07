export interface HandData {
  x: number;        // 0.0 - 1.0
  y: number;        // 0.0 - 1.0
  gesture: 'draw' | 'stop' | 'clear' | 'none';
  drawing: boolean;
  landmarks?: { x: number; y: number }[];
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
