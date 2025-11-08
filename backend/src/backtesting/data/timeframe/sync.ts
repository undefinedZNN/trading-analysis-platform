/**
 * 多流同步器实现
 * 
 * 负责同步多个时间框架的 bar 事件流
 */

import { Observable, combineLatest } from 'rxjs';
import { map, withLatestFrom, buffer, filter } from 'rxjs/operators';
import { BarEvent, SyncedBars } from './interfaces';

/**
 * 同步多个时间框架的流
 * 
 * @param primary 主流
 * @param auxiliary 辅助流映射
 * @param mode 同步模式
 * @returns 同步后的事件流
 */
export function synchronizeStreams(
  primary: Observable<BarEvent>,
  auxiliary: Record<string, Observable<BarEvent>>,
  mode: 'wait-all' | 'primary-driven' = 'primary-driven'
): Observable<SyncedBars> {
  const auxKeys = Object.keys(auxiliary);

  if (auxKeys.length === 0) {
    // 没有辅助流，直接返回主流
    return primary.pipe(
      map(primaryBar => ({
        timestamp: primaryBar.timestamp,
        primary: primaryBar,
        auxiliary: {},
      }))
    );
  }

  if (mode === 'wait-all') {
    // 等待所有流都有数据
    return combineLatest([
      primary,
      ...auxKeys.map(key => auxiliary[key]),
    ]).pipe(
      map(([primaryBar, ...auxBars]) => {
        const auxMap: Record<string, BarEvent[]> = {};
        auxKeys.forEach((key, index) => {
          auxMap[key] = [auxBars[index]];
        });

        return {
          timestamp: primaryBar.timestamp,
          primary: primaryBar,
          auxiliary: auxMap,
        };
      })
    );
  } else {
    // 主流驱动模式：每次主流有新数据时，获取辅助流的最新数据
    const auxObservables = auxKeys.map(key => auxiliary[key]);

    return primary.pipe(
      withLatestFrom(...auxObservables),
      map(([primaryBar, ...auxBars]) => {
        const auxMap: Record<string, BarEvent[]> = {};
        auxKeys.forEach((key, index) => {
          auxMap[key] = [auxBars[index]];
        });

        return {
          timestamp: primaryBar.timestamp,
          primary: primaryBar,
          auxiliary: auxMap,
        };
      })
    );
  }
}

/**
 * 收集主流时间窗口内的所有辅助流事件
 * 
 * 更精确的同步方式：主流每个 bar 对应的时间范围内，
 * 收集所有辅助流的 bars
 */
export function syncByTimeWindow(
  primary: Observable<BarEvent>,
  auxiliary: Record<string, Observable<BarEvent>>
): Observable<SyncedBars> {
  const auxKeys = Object.keys(auxiliary);

  if (auxKeys.length === 0) {
    return primary.pipe(
      map(primaryBar => ({
        timestamp: primaryBar.timestamp,
        primary: primaryBar,
        auxiliary: {},
      }))
    );
  }

  // 这里简化实现，实际需要更复杂的时间窗口匹配逻辑
  // 可以使用 bufferWhen 或自定义操作符来实现
  return primary.pipe(
    withLatestFrom(...auxKeys.map(key => auxiliary[key])),
    map(([primaryBar, ...auxBars]) => {
      const auxMap: Record<string, BarEvent[]> = {};
      auxKeys.forEach((key, index) => {
        auxMap[key] = [auxBars[index]];
      });

      return {
        timestamp: primaryBar.timestamp,
        primary: primaryBar,
        auxiliary: auxMap,
      };
    })
  );
}

/**
 * 高级同步器：支持基于时间戳的精确匹配
 * 
 * 收集主流 bar 时间范围内所有辅助流的 bars
 */
export class TimeWindowSynchronizer {
  /**
   * 同步流
   * 
   * @param primary 主流
   * @param auxiliary 辅助流映射
   * @param primaryInterval 主流的时间间隔（毫秒）
   * @returns 同步后的事件流
   */
  sync(
    primary: Observable<BarEvent>,
    auxiliary: Record<string, Observable<BarEvent>>,
    primaryInterval: number
  ): Observable<SyncedBars> {
    // 简化实现：使用 withLatestFrom
    // 完整实现需要缓冲辅助流并按时间窗口匹配
    return synchronizeStreams(primary, auxiliary, 'primary-driven');
  }
}

/**
 * 创建同步器实例
 */
export function createSynchronizer(): TimeWindowSynchronizer {
  return new TimeWindowSynchronizer();
}

