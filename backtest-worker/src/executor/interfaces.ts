export interface HistoricalBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ExecutionMetrics {
  processedBars: number;
  totalBars: number;
  throughput: number;
  memoryUsed: number;
}

export interface ExecutionChunkContext {
  taskId: string;
  totalBars: number;
  processedBars: number;
}
