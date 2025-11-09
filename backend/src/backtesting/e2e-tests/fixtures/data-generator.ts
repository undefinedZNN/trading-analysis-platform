/**
 * 测试数据生成器
 * 
 * 生成用于测试的模拟数据
 * 
 * @module e2e-tests/fixtures
 */

import Big from 'big.js';
import { nanoid } from 'nanoid';
// Define BarEvent type for test data
export interface BarEvent {
  type: 'BAR';
  timestamp: string;
  symbol: string;
  data: {
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  };
}

/**
 * 数据生成配置
 */
export interface DataGenConfig {
  /** 起始时间 */
  startTime: Date;
  /** 结束时间 */
  endTime: Date;
  /** 时间间隔（毫秒） */
  interval: number;
  /** 初始价格 */
  initialPrice: number;
  /** 波动率 */
  volatility: number;
  /** 趋势（0=横盘，正=上涨，负=下跌） */
  trend?: number;
}

/**
 * 测试数据生成器
 */
export class DataGenerator {
  /**
   * 生成随机行情数据
   */
  static generateBars(config: DataGenConfig): BarEvent[] {
    const bars: BarEvent[] = [];
    let currentTime = config.startTime.getTime();
    const endTime = config.endTime.getTime();
    let currentPrice = config.initialPrice;

    while (currentTime <= endTime) {
      // 生成随机变化
      const change = (Math.random() - 0.5) * config.volatility;
      const trendChange = (config.trend || 0) * 0.001;
      
      currentPrice *= (1 + change + trendChange);

      // 生成OHLC
      const open = currentPrice;
      const high = open * (1 + Math.random() * config.volatility * 0.5);
      const low = open * (1 - Math.random() * config.volatility * 0.5);
      const close = low + Math.random() * (high - low);
      const volume = Math.random() * 1000 + 100;

      bars.push({
        type: 'bar',
        symbol: 'BTCUSDT',
        timeframe: '1m',
        timestamp: new Date(currentTime).toISOString(),
        open: new Big(open).toFixed(2),
        high: new Big(high).toFixed(2),
        low: new Big(low).toFixed(2),
        close: new Big(close).toFixed(2),
        volume: new Big(volume).toFixed(4),
        sequenceId: nanoid(),
      });

      currentPrice = close;
      currentTime += config.interval;
    }

    return bars;
  }

  /**
   * 生成趋势数据（上涨）
   */
  static generateUptrend(days: number): BarEvent[] {
    return this.generateBars({
      startTime: new Date('2024-01-01'),
      endTime: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      interval: 60000, // 1 minute
      initialPrice: 50000,
      volatility: 0.01,
      trend: 1, // Uptrend
    });
  }

  /**
   * 生成趋势数据（下跌）
   */
  static generateDowntrend(days: number): BarEvent[] {
    return this.generateBars({
      startTime: new Date('2024-01-01'),
      endTime: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      interval: 60000,
      initialPrice: 50000,
      volatility: 0.01,
      trend: -1, // Downtrend
    });
  }

  /**
   * 生成横盘数据
   */
  static generateSideways(days: number): BarEvent[] {
    return this.generateBars({
      startTime: new Date('2024-01-01'),
      endTime: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      interval: 60000,
      initialPrice: 50000,
      volatility: 0.005,
      trend: 0, // Sideways
    });
  }

  /**
   * 生成高波动数据
   */
  static generateVolatile(days: number): BarEvent[] {
    return this.generateBars({
      startTime: new Date('2024-01-01'),
      endTime: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      interval: 60000,
      initialPrice: 50000,
      volatility: 0.05, // High volatility
      trend: 0,
    });
  }
}

