/**
 * TimeframeAdapter 核心实现
 * 
 * 负责将原始粒度的行情数据重采样到目标时间框架
 */

import { Observable } from 'rxjs';
import { bufferTime, filter, map, scan, shareReplay } from 'rxjs/operators';
import Big from 'big.js';
import {
  BarEvent,
  Timeframe,
  ResampleConfig,
  MultiFrameConfig,
  MultiFrameStream,
  TimeframeAdapter,
} from './interfaces';
import { timeAlignment } from './time-alignment';
import { createAggregator, LastValueFeatureStrategy } from './aggregator';

/**
 * TimeframeAdapter 实现类
 */
export class TimeframeAdapterImpl implements TimeframeAdapter {
  /**
   * 重采样到目标时间框架
   */
  resample(
    source: Observable<BarEvent>,
    targetTimeframe: Timeframe,
    config?: ResampleConfig
  ): Observable<BarEvent> {
    const finalConfig: Required<ResampleConfig> = {
      aggregationMethod: config?.aggregationMethod || 'standard',
      alignmentMode: config?.alignmentMode || 'close',
      dropIncomplete: config?.dropIncomplete ?? true,
      preserveFeatures: config?.preserveFeatures ?? true,
    };

    const intervalMs = timeAlignment.parseTimeframe(targetTimeframe);
    const aggregator = createAggregator(
      finalConfig.aggregationMethod,
      new LastValueFeatureStrategy()
    );

    return source.pipe(
      // 使用滑动窗口按时间分组
      this.bufferByTimeframe(intervalMs, finalConfig.alignmentMode),
      
      // 过滤空窗口
      filter(bars => bars.length > 0),
      
      // 聚合每个窗口
      map(bars => {
        const firstBar = bars[0];
        const lastBar = bars[bars.length - 1];
        const aggregated = aggregator.aggregate(bars);

        // 确定时间戳
        const timestamp = finalConfig.alignmentMode === 'close'
          ? timeAlignment.alignToTimeframe(lastBar.timestamp, targetTimeframe, 'close')
          : timeAlignment.alignToTimeframe(firstBar.timestamp, targetTimeframe, 'open');

        // 构造新的 BarEvent
        const resampledBar: BarEvent = {
          sequenceId: this.generateSequenceId(firstBar.sequenceId, bars.length),
          timestamp,
          symbol: firstBar.symbol,
          market: firstBar.market,
          timeframe: targetTimeframe,
          open: aggregated.open,
          high: aggregated.high,
          low: aggregated.low,
          close: aggregated.close,
          volume: aggregated.volume,
          trades: aggregated.trades,
          notional: aggregated.notional,
          source: `resampled-from-${firstBar.timeframe}`,
          context: {
            ...firstBar.context,
            barCount: aggregated.barCount,
            originalTimeframe: firstBar.timeframe,
          },
        };

        // 保留特征（如果配置）
        if (finalConfig.preserveFeatures && firstBar.features) {
          resampledBar.features = (aggregator as any).aggregateFeatures?.(bars) || lastBar.features;
        }

        return resampledBar;
      }),
      
      // 如果配置了 dropIncomplete，过滤掉不完整的 bar
      filter(bar => {
        if (!finalConfig.dropIncomplete) return true;
        // 这里简化处理，实际应该检查是否到达了完整的时间窗口
        return true;
      })
    );
  }

  /**
   * 创建多时间框架流
   */
  createMultiFrameStream(
    source: Observable<BarEvent>,
    config: MultiFrameConfig
  ): MultiFrameStream {
    const { primary, auxiliary = [], syncMode = 'primary-driven' } = config;

    // 创建主流
    const primary$ = this.resample(source, primary).pipe(
      shareReplay(1)
    );

    // 创建辅助流
    const auxiliary$: Record<string, Observable<BarEvent>> = {};
    auxiliary.forEach(timeframe => {
      auxiliary$[timeframe] = this.resample(source, timeframe).pipe(
        shareReplay(1)
      );
    });

    // 创建同步流（这里简化实现，实际需要更复杂的同步逻辑）
    const synchronized$ = primary$.pipe(
      map(primaryBar => ({
        timestamp: primaryBar.timestamp,
        primary: primaryBar,
        auxiliary: {}, // 简化实现，实际需要收集对应时间范围内的辅助 bars
      }))
    );

    return {
      primary$,
      auxiliary$,
      synchronized$,
    };
  }

  /**
   * 按时间框架缓冲事件
   * 使用自定义操作符实现更精确的时间窗口控制
   */
  private bufferByTimeframe(intervalMs: number, mode: 'open' | 'close') {
    return (source: Observable<BarEvent>) => {
      return new Observable<BarEvent[]>(subscriber => {
        let currentWindow: BarEvent[] = [];
        let windowStart: number | null = null;

        const subscription = source.subscribe({
          next: (bar) => {
            const barTime = new Date(bar.timestamp).getTime();

            // 初始化窗口
            if (windowStart === null) {
              windowStart = Math.floor(barTime / intervalMs) * intervalMs;
            }

            const windowEnd = windowStart + intervalMs;

            // 检查 bar 是否属于当前窗口
            if (barTime < windowEnd) {
              currentWindow.push(bar);
            } else {
              // 发送当前窗口
              if (currentWindow.length > 0) {
                subscriber.next([...currentWindow]);
              }

              // 开启新窗口
              windowStart = Math.floor(barTime / intervalMs) * intervalMs;
              currentWindow = [bar];
            }
          },
          error: (err) => subscriber.error(err),
          complete: () => {
            // 发送最后一个窗口
            if (currentWindow.length > 0) {
              subscriber.next(currentWindow);
            }
            subscriber.complete();
          },
        });

        return () => subscription.unsubscribe();
      });
    };
  }

  /**
   * 生成新的 sequenceId
   */
  private generateSequenceId(baseId: string, count: number): string {
    return `${baseId}-agg${count}`;
  }
}

/**
 * 导出单例实例
 */
export const timeframeAdapter = new TimeframeAdapterImpl();

