/**
 * GapFiller - 缺口填充器
 * 
 * 负责根据不同的填充策略生成合成的 BarEvent 来填补数据缺口
 */

import { addMilliseconds, formatISO, parseISO } from 'date-fns';
import Big from 'big.js';
import { BarEvent, Timeframe } from '../timeframe/interfaces';
import { Gap, GapFiller, FillMethod } from './interfaces';
import { timeframeToMs } from '../timeframe/time-alignment';

/**
 * 默认缺口填充器实现
 */
export class DefaultGapFiller implements GapFiller {
  /**
   * 填充缺口
   * 
   * @param gap 缺口信息
   * @param method 填充方法
   * @param timeframe 时间框架
   * @returns 生成的合成 BarEvent 数组
   */
  fillGap(gap: Gap, method: FillMethod, timeframe: Timeframe): BarEvent[] {
    switch (method) {
      case 'forwardFill':
        return this.forwardFill(gap, timeframe);
      case 'linear':
        return this.linearFill(gap, timeframe);
      default:
        throw new Error(`Unsupported fill method: ${method}`);
    }
  }

  /**
   * 前向填充
   * 使用最后一个有效 bar 的 close 价格作为所有 OHLC
   * 
   * @param gap 缺口信息
   * @param timeframe 时间框架
   * @returns 生成的合成 BarEvent 数组
   */
  forwardFill(gap: Gap, timeframe: Timeframe): BarEvent[] {
    if (!gap.lastValidBar) {
      throw new Error('Cannot forward fill: no lastValidBar provided');
    }

    const intervalMs = timeframeToMs(timeframe);
    const syntheticBars: BarEvent[] = [];
    
    // 使用最后一个有效 bar 的 close 价格
    const fillPrice = gap.lastValidBar.close;
    const fillVolume = '0'; // 合成 bar 的 volume 为 0

    // 从缺口开始时间生成缺失的 bars
    const startTime = parseISO(gap.startTimestamp);

    for (let i = 0; i < gap.expectedBars; i++) {
      const barTime = addMilliseconds(startTime, i * intervalMs);
      const barTimestamp = barTime.toISOString();

      const syntheticBar: BarEvent = {
        sequenceId: `synthetic-ff-${gap.lastValidBar.symbol}-${barTimestamp}`,
        timestamp: barTimestamp,
        symbol: gap.lastValidBar.symbol,
        market: gap.lastValidBar.market,
        timeframe: timeframe,
        open: fillPrice,
        high: fillPrice,
        low: fillPrice,
        close: fillPrice,
        volume: fillVolume,
        trades: 0,
        notional: '0',
        features: {},
        source: `synthetic:forwardFill:${gap.lastValidBar.source}`,
        context: {
          qualityFlag: 'synthetic',
          fillMethod: 'forwardFill',
          originalBar: gap.lastValidBar.sequenceId,
          gapInfo: {
            gapStart: gap.startTimestamp,
            gapEnd: gap.endTimestamp,
            totalMissingBars: gap.expectedBars,
          },
        },
      };

      syntheticBars.push(syntheticBar);
    }

    return syntheticBars;
  }

  /**
   * 线性插值填充
   * 在缺口前后两个有效 bar 之间进行线性插值
   * 
   * @param gap 缺口信息
   * @param timeframe 时间框架
   * @returns 生成的合成 BarEvent 数组
   */
  linearFill(gap: Gap, timeframe: Timeframe): BarEvent[] {
    if (!gap.lastValidBar || !gap.nextValidBar) {
      throw new Error('Cannot linear fill: both lastValidBar and nextValidBar are required');
    }

    const intervalMs = timeframeToMs(timeframe);
    const syntheticBars: BarEvent[] = [];

    // 解析前后 bar 的价格
    const lastClose = new Big(gap.lastValidBar.close);
    const nextOpen = new Big(gap.nextValidBar.open);

    // 计算价格步长（线性插值）
    const totalSteps = gap.expectedBars + 1; // 包括从 lastClose 到 nextOpen 的总步数
    const priceStep = nextOpen.minus(lastClose).div(totalSteps);

    // 从缺口开始时间生成缺失的 bars
    const startTime = parseISO(gap.startTimestamp);

    for (let i = 0; i < gap.expectedBars; i++) {
      const barTime = addMilliseconds(startTime, i * intervalMs);
      const barTimestamp = barTime.toISOString();
      
      // 计算插值价格
      const interpolatedPrice = lastClose.plus(priceStep.times(i + 1));
      const priceStr = interpolatedPrice.toFixed(8);

      const syntheticBar: BarEvent = {
        sequenceId: `synthetic-linear-${gap.lastValidBar.symbol}-${barTimestamp}`,
        timestamp: barTimestamp,
        symbol: gap.lastValidBar.symbol,
        market: gap.lastValidBar.market,
        timeframe: timeframe,
        open: priceStr,
        high: priceStr,
        low: priceStr,
        close: priceStr,
        volume: '0', // 合成 bar 的 volume 为 0
        trades: 0,
        notional: '0',
        features: {},
        source: `synthetic:linear:${gap.lastValidBar.source}`,
        context: {
          qualityFlag: 'interpolated',
          fillMethod: 'linear',
          originalBars: {
            before: gap.lastValidBar.sequenceId,
            after: gap.nextValidBar.sequenceId,
          },
          gapInfo: {
            gapStart: gap.startTimestamp,
            gapEnd: gap.endTimestamp,
            totalMissingBars: gap.expectedBars,
          },
          interpolation: {
            fromPrice: gap.lastValidBar.close,
            toPrice: gap.nextValidBar.open,
            step: i + 1,
            totalSteps: totalSteps,
          },
        },
      };

      syntheticBars.push(syntheticBar);
    }

    return syntheticBars;
  }

  /**
   * 合并原始数据和填充数据
   * 
   * @param original 原始 BarEvent 数组
   * @param gaps 缺口数组
   * @param method 填充方法
   * @param timeframe 时间框架
   * @returns 合并后的 BarEvent 数组（按时间戳升序）
   */
  mergeWithFilled(
    original: BarEvent[],
    gaps: Gap[],
    method: FillMethod,
    timeframe: Timeframe
  ): BarEvent[] {
    if (gaps.length === 0) {
      return original;
    }

    // 为所有缺口生成填充数据
    const filledBars: BarEvent[] = [];
    gaps.forEach(gap => {
      const filled = this.fillGap(gap, method, timeframe);
      filledBars.push(...filled);
    });

    // 合并原始数据和填充数据
    const merged = [...original, ...filledBars];

    // 按时间戳升序排序
    merged.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    return merged;
  }

  /**
   * 检查 BarEvent 是否为合成数据
   * 
   * @param event BarEvent
   * @returns 是否为合成数据
   */
  isSynthetic(event: BarEvent): boolean {
    return (
      event.context?.qualityFlag === 'synthetic' ||
      event.context?.qualityFlag === 'interpolated' ||
      event.source.startsWith('synthetic:')
    );
  }

  /**
   * 过滤掉合成数据
   * 
   * @param events BarEvent 数组
   * @returns 仅包含原始数据的数组
   */
  filterSynthetic(events: BarEvent[]): BarEvent[] {
    return events.filter(event => !this.isSynthetic(event));
  }

  /**
   * 获取合成数据统计
   * 
   * @param events BarEvent 数组
   * @returns 统计信息
   */
  getSyntheticStatistics(events: BarEvent[]): {
    total: number;
    synthetic: number;
    original: number;
    syntheticPercentage: number;
  } {
    const total = events.length;
    const synthetic = events.filter(e => this.isSynthetic(e)).length;
    const original = total - synthetic;
    const syntheticPercentage = total > 0 ? (synthetic / total) * 100 : 0;

    return {
      total,
      synthetic,
      original,
      syntheticPercentage,
    };
  }
}

/**
 * 创建默认的缺口填充器实例
 */
export function createGapFiller(): GapFiller {
  return new DefaultGapFiller();
}

