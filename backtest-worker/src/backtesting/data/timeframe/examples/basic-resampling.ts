/**
 * 基础重采样示例
 * 
 * 演示如何将 1s bars 重采样为 5m bars
 */

import { from } from 'rxjs';
import { timeframeAdapter } from '../adapter';
import { BarEvent } from '../interfaces';

// 创建模拟数据
function createMockBars(): BarEvent[] {
  const bars: BarEvent[] = [];
  const baseTime = new Date('2024-01-01T00:00:00.000Z').getTime();

  // 创建 5 分钟的 1s bars
  for (let i = 0; i < 300; i++) {
    const timestamp = new Date(baseTime + i * 1000).toISOString();
    const price = 50000 + Math.sin(i / 30) * 1000; // 模拟价格波动

    bars.push({
      sequenceId: `seq-${i}`,
      timestamp,
      symbol: 'BTC-USDT',
      market: 'binance',
      timeframe: '1s',
      open: price.toFixed(2),
      high: (price + 50).toFixed(2),
      low: (price - 50).toFixed(2),
      close: (price + Math.random() * 100 - 50).toFixed(2),
      volume: (Math.random() * 100 + 50).toFixed(2),
      trades: Math.floor(Math.random() * 10 + 5),
      source: 'mock-data',
      features: {
        rsi: 50 + Math.random() * 20,
        volume_ma: 75,
      },
    });
  }

  return bars;
}

// 示例 1: 基础重采样
export function basicResamplingExample() {
  console.log('=== 示例 1: 基础重采样 ===\n');

  const bars = createMockBars();
  const bars$ = from(bars);

  const resampled$ = timeframeAdapter.resample(bars$, '5m');

  resampled$.subscribe({
    next: (bar) => {
      console.log('重采样后的 5m bar:');
      console.log(`  时间戳: ${bar.timestamp}`);
      console.log(`  Open: ${bar.open}`);
      console.log(`  High: ${bar.high}`);
      console.log(`  Low: ${bar.low}`);
      console.log(`  Close: ${bar.close}`);
      console.log(`  Volume: ${bar.volume}`);
      console.log(`  Bar Count: ${bar.context?.barCount}`);
      console.log('');
    },
    complete: () => {
      console.log('重采样完成！\n');
    },
  });
}

// 示例 2: 使用成交量加权聚合
export function volumeWeightedExample() {
  console.log('=== 示例 2: 成交量加权聚合（VWAP） ===\n');

  const bars = createMockBars();
  const bars$ = from(bars);

  const resampled$ = timeframeAdapter.resample(bars$, '5m', {
    aggregationMethod: 'volume-weighted',
    alignmentMode: 'close',
  });

  resampled$.subscribe({
    next: (bar) => {
      console.log('VWAP 聚合的 5m bar:');
      console.log(`  Close (VWAP): ${bar.close}`);
      console.log(`  Volume: ${bar.volume}`);
      console.log('');
    },
  });
}

// 示例 3: Open 模式对齐
export function openAlignmentExample() {
  console.log('=== 示例 3: Open 模式时间对齐 ===\n');

  const bars = createMockBars();
  const bars$ = from(bars);

  const resampled$ = timeframeAdapter.resample(bars$, '5m', {
    alignmentMode: 'open',
  });

  resampled$.subscribe({
    next: (bar) => {
      console.log('Open 模式对齐:');
      console.log(`  时间戳: ${bar.timestamp}`);
      console.log(`  (表示窗口开始时间)`);
      console.log('');
    },
  });
}

// 示例 4: 保留特征字段
export function preserveFeaturesExample() {
  console.log('=== 示例 4: 保留特征字段 ===\n');

  const bars = createMockBars();
  const bars$ = from(bars);

  const resampled$ = timeframeAdapter.resample(bars$, '5m', {
    preserveFeatures: true,
  });

  resampled$.subscribe({
    next: (bar) => {
      console.log('保留特征:');
      console.log(`  Features: ${JSON.stringify(bar.features, null, 2)}`);
      console.log('');
    },
  });
}

// 运行所有示例
export function runAllExamples() {
  basicResamplingExample();
  volumeWeightedExample();
  openAlignmentExample();
  preserveFeaturesExample();
}

// 如果直接运行此文件
if (require.main === module) {
  runAllExamples();
}

