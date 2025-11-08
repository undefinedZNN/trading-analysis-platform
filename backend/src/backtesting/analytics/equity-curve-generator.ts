/**
 * 权益曲线生成器
 * 
 * 从交易记录生成权益曲线和回撤曲线
 * 
 * @module analytics/equity-curve-generator
 */

import Big from 'big.js';
import { parseISO, format, startOfDay, startOfHour, startOfMinute } from 'date-fns';
import type { EquityCurve, TimeSeriesPoint } from './interfaces';
import type { TradeRecord } from '../ledger/interfaces';
import { drawdownSeries } from './metrics-helpers';

/**
 * 时间粒度
 */
export type TimeGranularity = 'minute' | 'hour' | 'day';

/**
 * 权益曲线生成器配置
 */
export interface EquityCurveGeneratorConfig {
  /** 初始资金 */
  initialCapital: string;
  /** 时间粒度 */
  granularity?: TimeGranularity;
  /** 是否填充缺失数据 */
  fillGaps?: boolean;
  /** 是否应用平滑 */
  applySmoothing?: boolean;
  /** 平滑窗口大小 */
  smoothingWindow?: number;
}

/**
 * 权益点
 */
interface EquityPoint {
  timestamp: Date;
  equity: Big;
  trades: number;
}

/**
 * 权益曲线生成器
 */
export class EquityCurveGenerator {
  private config: Required<EquityCurveGeneratorConfig>;

  constructor(config: EquityCurveGeneratorConfig) {
    this.config = {
      granularity: 'day',
      fillGaps: true,
      applySmoothing: false,
      smoothingWindow: 7,
      ...config,
    };
  }

  /**
   * 从交易记录生成权益曲线
   */
  generate(trades: TradeRecord[]): EquityCurve {
    if (trades.length === 0) {
      return this.createEmptyEquityCurve();
    }

    // 1. 按时间排序交易
    const sortedTrades = this.sortTradesByTime(trades);

    // 2. 计算每个时间点的权益
    const equityPoints = this.calculateEquityPoints(sortedTrades);

    // 3. 按时间粒度聚合
    const aggregated = this.aggregateByGranularity(equityPoints);

    // 4. 填充缺失数据（如果配置启用）
    const filled = this.config.fillGaps
      ? this.fillMissingData(aggregated)
      : aggregated;

    // 5. 应用平滑（如果配置启用）
    const smoothed = this.config.applySmoothing
      ? this.applySmoothing(filled)
      : filled;

    // 6. 计算回撤
    const withDrawdown = this.calculateDrawdown(smoothed);

    // 7. 转换为EquityCurve格式
    return this.toEquityCurve(withDrawdown);
  }

  /**
   * 生成权益时间序列
   */
  generateTimeSeries(trades: TradeRecord[]): TimeSeriesPoint[] {
    const equityCurve = this.generate(trades);
    return equityCurve.timestamps.map((timestamp, i) => ({
      timestamp,
      value: equityCurve.equity[i],
    }));
  }

  /**
   * 生成回撤时间序列
   */
  generateDrawdownSeries(trades: TradeRecord[]): TimeSeriesPoint[] {
    const equityCurve = this.generate(trades);
    return equityCurve.timestamps.map((timestamp, i) => ({
      timestamp,
      value: equityCurve.drawdown[i],
    }));
  }

  /**
   * 按时间排序交易
   */
  private sortTradesByTime(trades: TradeRecord[]): TradeRecord[] {
    return [...trades].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });
  }

  /**
   * 计算每个时间点的权益
   */
  private calculateEquityPoints(trades: TradeRecord[]): EquityPoint[] {
    const points: EquityPoint[] = [];
    let currentEquity = new Big(this.config.initialCapital);

    // 添加初始点
    if (trades.length > 0) {
      const firstTradeTime = parseISO(trades[0].timestamp);
      points.push({
        timestamp: firstTradeTime,
        equity: currentEquity,
        trades: 0,
      });
    }

    // 累计每笔交易后的权益
    for (const trade of trades) {
      const realizedPnl = new Big(trade.realizedPnl);
      const fees = new Big(trade.fees);
      
      // 权益 = 权益 + 已实现盈亏 - 手续费
      currentEquity = currentEquity.plus(realizedPnl).minus(fees);

      points.push({
        timestamp: parseISO(trade.timestamp),
        equity: currentEquity,
        trades: 1,
      });
    }

    return points;
  }

  /**
   * 按时间粒度聚合
   */
  private aggregateByGranularity(points: EquityPoint[]): EquityPoint[] {
    if (points.length === 0) return [];

    const aggregated = new Map<string, EquityPoint>();

    for (const point of points) {
      const key = this.getTimeKey(point.timestamp);

      if (aggregated.has(key)) {
        // 更新该时间段的最后权益值
        const existing = aggregated.get(key)!;
        existing.equity = point.equity;
        existing.trades += point.trades;
      } else {
        aggregated.set(key, { ...point });
      }
    }

    // 按时间排序
    return Array.from(aggregated.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  /**
   * 获取时间键（根据粒度）
   */
  private getTimeKey(date: Date): string {
    switch (this.config.granularity) {
      case 'minute':
        return format(startOfMinute(date), 'yyyy-MM-dd HH:mm');
      case 'hour':
        return format(startOfHour(date), 'yyyy-MM-dd HH:00');
      case 'day':
        return format(startOfDay(date), 'yyyy-MM-dd');
      default:
        return format(startOfDay(date), 'yyyy-MM-dd');
    }
  }

  /**
   * 填充缺失数据
   */
  private fillMissingData(points: EquityPoint[]): EquityPoint[] {
    if (points.length < 2) return points;

    const filled: EquityPoint[] = [];
    
    for (let i = 0; i < points.length - 1; i++) {
      filled.push(points[i]);

      const current = points[i];
      const next = points[i + 1];
      const gap = this.calculateGap(current.timestamp, next.timestamp);

      // 如果有间隙，用前向填充
      if (gap > 1) {
        const filledPoints = this.generateFilledPoints(
          current.timestamp,
          next.timestamp,
          current.equity
        );
        filled.push(...filledPoints);
      }
    }

    // 添加最后一个点
    filled.push(points[points.length - 1]);

    return filled;
  }

  /**
   * 计算时间间隙
   */
  private calculateGap(start: Date, end: Date): number {
    const diffMs = end.getTime() - start.getTime();

    switch (this.config.granularity) {
      case 'minute':
        return Math.floor(diffMs / (60 * 1000));
      case 'hour':
        return Math.floor(diffMs / (60 * 60 * 1000));
      case 'day':
        return Math.floor(diffMs / (24 * 60 * 60 * 1000));
      default:
        return 0;
    }
  }

  /**
   * 生成填充点
   */
  private generateFilledPoints(
    start: Date,
    end: Date,
    equity: Big
  ): EquityPoint[] {
    const points: EquityPoint[] = [];
    let current = new Date(start);

    while (current < end) {
      current = this.addTimeUnit(current);
      if (current < end) {
        points.push({
          timestamp: new Date(current),
          equity: new Big(equity),
          trades: 0,
        });
      }
    }

    return points;
  }

  /**
   * 添加时间单位
   */
  private addTimeUnit(date: Date): Date {
    const result = new Date(date);

    switch (this.config.granularity) {
      case 'minute':
        result.setMinutes(result.getMinutes() + 1);
        break;
      case 'hour':
        result.setHours(result.getHours() + 1);
        break;
      case 'day':
        result.setDate(result.getDate() + 1);
        break;
    }

    return result;
  }

  /**
   * 应用移动平均平滑
   */
  private applySmoothing(points: EquityPoint[]): EquityPoint[] {
    if (points.length < this.config.smoothingWindow) {
      return points;
    }

    const smoothed: EquityPoint[] = [];
    const window = this.config.smoothingWindow;

    for (let i = 0; i < points.length; i++) {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(points.length, i + Math.ceil(window / 2));
      const windowPoints = points.slice(start, end);

      // 计算窗口内的平均权益
      const sum = windowPoints.reduce(
        (acc, p) => acc.plus(p.equity),
        new Big(0)
      );
      const avg = sum.div(windowPoints.length);

      smoothed.push({
        ...points[i],
        equity: avg,
      });
    }

    return smoothed;
  }

  /**
   * 计算回撤
   */
  private calculateDrawdown(
    points: EquityPoint[]
  ): Array<EquityPoint & { drawdown: number }> {
    if (points.length === 0) return [];

    const withDrawdown: Array<EquityPoint & { drawdown: number }> = [];
    let peak = points[0].equity;

    for (const point of points) {
      // 更新峰值
      if (point.equity.gt(peak)) {
        peak = new Big(point.equity);
      }

      // 计算回撤百分比
      const drawdown = peak.eq(0)
        ? 0
        : peak.minus(point.equity).div(peak).toNumber();

      withDrawdown.push({
        ...point,
        drawdown: Math.max(0, drawdown),
      });
    }

    return withDrawdown;
  }

  /**
   * 转换为EquityCurve格式
   */
  private toEquityCurve(
    points: Array<EquityPoint & { drawdown: number }>
  ): EquityCurve {
    return {
      timestamps: points.map(p => p.timestamp.toISOString()),
      equity: points.map(p => p.equity.toFixed(2)),
      drawdown: points.map(p => p.drawdown.toFixed(6)),
    };
  }

  /**
   * 创建空权益曲线
   */
  private createEmptyEquityCurve(): EquityCurve {
    return {
      timestamps: [],
      equity: [],
      drawdown: [],
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<EquityCurveGeneratorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * 获取当前配置
   */
  getConfig(): Required<EquityCurveGeneratorConfig> {
    return { ...this.config };
  }
}

/**
 * 创建权益曲线生成器
 */
export function createEquityCurveGenerator(
  config: EquityCurveGeneratorConfig
): EquityCurveGenerator {
  return new EquityCurveGenerator(config);
}

