/**
 * 时间对齐工具实现
 * 
 * 提供时间框架解析、时间戳对齐等时间相关的工具函数
 */

import { Timeframe, TimeAlignment } from './interfaces';

/**
 * 时间框架到毫秒数的映射
 */
const TIMEFRAME_TO_MS: Record<string, number> = {
  '1s': 1000,
  '5s': 5 * 1000,
  '10s': 10 * 1000,
  '15s': 15 * 1000,
  '30s': 30 * 1000,
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

/**
 * 时间对齐工具实现类
 */
export class TimeAlignmentImpl implements TimeAlignment {
  /**
   * 解析时间框架为毫秒数
   */
  parseTimeframe(timeframe: Timeframe): number {
    // 先尝试从预定义映射中获取
    if (TIMEFRAME_TO_MS[timeframe]) {
      return TIMEFRAME_TO_MS[timeframe];
    }

    // 尝试解析自定义格式，如 "2m", "3h" 等
    const match = timeframe.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid timeframe format: ${timeframe}`);
    }

    const [, value, unit] = match;
    const num = parseInt(value, 10);

    const unitMap: Record<string, number> = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000,
    };

    return num * unitMap[unit];
  }

  /**
   * 将时间戳对齐到时间框架边界
   */
  alignToTimeframe(
    timestamp: string,
    timeframe: Timeframe,
    mode: 'open' | 'close'
  ): string {
    const ms = new Date(timestamp).getTime();
    const interval = this.parseTimeframe(timeframe);

    let alignedMs: number;

    if (mode === 'close') {
      // 向下取整到最近的时间框架边界，然后加上间隔
      alignedMs = Math.floor(ms / interval) * interval + interval;
    } else {
      // 向下取整到最近的时间框架边界
      alignedMs = Math.floor(ms / interval) * interval;
    }

    return new Date(alignedMs).toISOString();
  }

  /**
   * 检查时间戳是否在时间框架边界上
   */
  isOnBoundary(timestamp: string, timeframe: Timeframe): boolean {
    const ms = new Date(timestamp).getTime();
    const interval = this.parseTimeframe(timeframe);
    return ms % interval === 0;
  }

  /**
   * 获取下一个时间框架边界
   */
  getNextBoundary(timestamp: string, timeframe: Timeframe): string {
    const ms = new Date(timestamp).getTime();
    const interval = this.parseTimeframe(timeframe);
    const nextMs = Math.ceil(ms / interval) * interval;
    return new Date(nextMs).toISOString();
  }

  /**
   * 获取上一个时间框架边界
   */
  getPreviousBoundary(timestamp: string, timeframe: Timeframe): string {
    const ms = new Date(timestamp).getTime();
    const interval = this.parseTimeframe(timeframe);
    const prevMs = Math.floor(ms / interval) * interval;
    return new Date(prevMs).toISOString();
  }

  /**
   * 计算两个时间框架之间的倍数关系
   * @returns 如果 larger 是 smaller 的整数倍，返回倍数；否则返回 null
   */
  getTimeframeMultiplier(smaller: Timeframe, larger: Timeframe): number | null {
    const smallerMs = this.parseTimeframe(smaller);
    const largerMs = this.parseTimeframe(larger);

    if (largerMs % smallerMs === 0) {
      return largerMs / smallerMs;
    }

    return null;
  }
}

/**
 * 导出单例实例
 */
export const timeAlignment = new TimeAlignmentImpl();

/**
 * 工具函数：将时间框架转换为毫秒数
 * 
 * @param timeframe 时间框架字符串
 * @returns 毫秒数
 */
export function timeframeToMs(timeframe: Timeframe): number {
  return timeAlignment.parseTimeframe(timeframe);
}

/**
 * 工具函数：检查时间戳是否在时间框架边界上
 * 
 * @param timestamp 时间戳
 * @param timeframe 时间框架
 * @returns 是否在边界上
 */
export function isOnBoundary(timestamp: string, timeframe: Timeframe): boolean {
  return timeAlignment.isOnBoundary(timestamp, timeframe);
}

/**
 * 工具函数：对齐时间戳到时间框架边界
 * 
 * @param timestamp 时间戳
 * @param timeframe 时间框架
 * @param mode 对齐模式
 * @returns 对齐后的时间戳
 */
export function alignToTimeframe(
  timestamp: string,
  timeframe: Timeframe,
  mode: 'open' | 'close' = 'open'
): string {
  return timeAlignment.alignToTimeframe(timestamp, timeframe, mode);
}

