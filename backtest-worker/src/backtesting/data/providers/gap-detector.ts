/**
 * GapDetector - 缺口检测器
 * 
 * 负责检测时间序列数据中的缺口，验证数据完整性
 */

import { parseISO, differenceInMilliseconds, addMilliseconds, formatISO } from 'date-fns';
import { BarEvent, Timeframe } from '../timeframe/interfaces';
import { Gap, GapDetector, IntegrityReport } from './interfaces';

/**
 * 默认缺口检测器实现
 */
export class DefaultGapDetector implements GapDetector {
  /**
   * 允许的时间容差（毫秒），用于处理微小的时间偏差
   */
  private readonly TOLERANCE_MS = 100;

  /**
   * 检测时间序列中的缺口
   * 
   * @param events BarEvent 数组（必须按时间戳升序排列）
   * @param expectedInterval 预期的时间间隔（毫秒）
   * @param timeframe 时间框架
   * @returns 检测到的缺口数组
   */
  detectGaps(
    events: BarEvent[],
    expectedInterval: number,
    timeframe: Timeframe
  ): Gap[] {
    if (events.length < 2) {
      return [];
    }

    const gaps: Gap[] = [];

    for (let i = 0; i < events.length - 1; i++) {
      const currentEvent = events[i];
      const nextEvent = events[i + 1];

      const currentTime = parseISO(currentEvent.timestamp);
      const nextTime = parseISO(nextEvent.timestamp);
      
      const actualInterval = differenceInMilliseconds(nextTime, currentTime);
      const expectedNextTime = addMilliseconds(currentTime, expectedInterval);

      // 如果实际间隔超过预期间隔（考虑容差），则认为存在缺口
      if (actualInterval > expectedInterval + this.TOLERANCE_MS) {
        const missingBars = Math.floor(actualInterval / expectedInterval) - 1;

        if (missingBars > 0) {
          const gap: Gap = {
            startTimestamp: formatISO(expectedNextTime),
            endTimestamp: currentEvent.timestamp,
            expectedBars: missingBars,
            lastValidBar: currentEvent,
            nextValidBar: nextEvent,
          };

          gaps.push(gap);
        }
      }
    }

    return gaps;
  }

  /**
   * 验证时间序列的完整性
   * 
   * @param events BarEvent 数组
   * @param expectedInterval 预期的时间间隔（毫秒）
   * @returns 完整性报告
   */
  validateIntegrity(
    events: BarEvent[],
    expectedInterval: number
  ): IntegrityReport {
    if (events.length === 0) {
      return {
        totalRecords: 0,
        expectedRecords: 0,
        gapCount: 0,
        missingRecords: 0,
        completeness: 100,
        gaps: [],
        isValid: true,
      };
    }

    if (events.length === 1) {
      return {
        totalRecords: 1,
        expectedRecords: 1,
        gapCount: 0,
        missingRecords: 0,
        completeness: 100,
        gaps: [],
        isValid: true,
      };
    }

    // 检测缺口
    const gaps = this.detectGaps(events, expectedInterval, '1m'); // timeframe 暂时用默认值

    // 计算总的缺失记录数
    const missingRecords = gaps.reduce((sum, gap) => sum + gap.expectedBars, 0);

    // 计算时间跨度
    const firstTime = parseISO(events[0].timestamp);
    const lastTime = parseISO(events[events.length - 1].timestamp);
    const totalSpanMs = differenceInMilliseconds(lastTime, firstTime);
    
    // 预期应该有的记录数（包括首尾）
    const expectedRecords = Math.floor(totalSpanMs / expectedInterval) + 1;

    // 实际记录数
    const totalRecords = events.length;

    // 完整性百分比
    const completeness = expectedRecords > 0 
      ? (totalRecords / expectedRecords) * 100 
      : 100;

    // 验证是否通过（完整性 >= 95%）
    const isValid = completeness >= 95;

    return {
      totalRecords,
      expectedRecords,
      gapCount: gaps.length,
      missingRecords,
      completeness: Math.min(completeness, 100),
      gaps,
      isValid,
    };
  }

  /**
   * 检测单个缺口
   * 
   * @param prevEvent 前一个事件
   * @param nextEvent 后一个事件
   * @param expectedInterval 预期间隔
   * @returns 缺口信息，如果没有缺口则返回 null
   */
  detectSingleGap(
    prevEvent: BarEvent,
    nextEvent: BarEvent,
    expectedInterval: number
  ): Gap | null {
    const prevTime = parseISO(prevEvent.timestamp);
    const nextTime = parseISO(nextEvent.timestamp);
    
    const actualInterval = differenceInMilliseconds(nextTime, prevTime);
    const expectedNextTime = addMilliseconds(prevTime, expectedInterval);

    if (actualInterval > expectedInterval + this.TOLERANCE_MS) {
      const missingBars = Math.floor(actualInterval / expectedInterval) - 1;

      if (missingBars > 0) {
        return {
          startTimestamp: formatISO(expectedNextTime),
          endTimestamp: nextEvent.timestamp,
          expectedBars: missingBars,
          lastValidBar: prevEvent,
          nextValidBar: nextEvent,
        };
      }
    }

    return null;
  }

  /**
   * 获取缺口统计信息
   * 
   * @param gaps 缺口数组
   * @returns 统计信息
   */
  getGapStatistics(gaps: Gap[]): {
    totalGaps: number;
    totalMissingBars: number;
    avgGapSize: number;
    maxGapSize: number;
    minGapSize: number;
  } {
    if (gaps.length === 0) {
      return {
        totalGaps: 0,
        totalMissingBars: 0,
        avgGapSize: 0,
        maxGapSize: 0,
        minGapSize: 0,
      };
    }

    const totalMissingBars = gaps.reduce((sum, gap) => sum + gap.expectedBars, 0);
    const gapSizes = gaps.map(gap => gap.expectedBars);

    return {
      totalGaps: gaps.length,
      totalMissingBars,
      avgGapSize: totalMissingBars / gaps.length,
      maxGapSize: Math.max(...gapSizes),
      minGapSize: Math.min(...gapSizes),
    };
  }
}

/**
 * 创建默认的缺口检测器实例
 */
export function createGapDetector(): GapDetector {
  return new DefaultGapDetector();
}

