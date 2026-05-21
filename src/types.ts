export interface DetectedObject {
  label: string;
  description: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized to 1000
}

export type EraserMode = 'exemplar' | 'healing' | 'smudge';

export interface HistoryState {
  imageData: ImageData;
  description: string; // Detail of change (e.g. "Initial", "Line Stroke", "AI Cleanup")
}
