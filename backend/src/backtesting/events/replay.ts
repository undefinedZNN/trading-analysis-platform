/**
 * 事件重放器
 * 
 * 从 EventStore 中重放历史事件，支持：
 * 1. 按时间范围重放
 * 2. 按事件类型过滤
 * 3. 速度控制（实时/快速/慢速）
 * 4. 断点续播
 * 
 * @module EventReplay
 */

import { Observable, Subject, interval, concat, from, of } from 'rxjs';
import { map, concatMap, delay, take, takeWhile, filter } from 'rxjs/operators';
import type { SimpleEvent, SimpleRecordedEvent, SimpleEventStore } from './simple-bus';

/**
 * 重放速度模式
 */
export type ReplaySpeedMode = 'realtime' | 'fast' | 'slow' | 'custom';

/**
 * 重放配置
 */
export interface ReplayConfig {
  /** 开始时间戳（毫秒） */
  startTime?: number;
  
  /** 结束时间戳（毫秒） */
  endTime?: number;
  
  /** 事件类型过滤 */
  eventTypes?: string[];
  
  /** 速度模式 */
  speedMode?: ReplaySpeedMode;
  
  /** 自定义速度倍数（speedMode为custom时生效） */
  speedMultiplier?: number;
  
  /** 是否跳过延迟（fast模式） */
  skipDelay?: boolean;
  
  /** 固定延迟（毫秒，slow模式） */
  fixedDelayMs?: number;
  
  /** 最大事件数 */
  maxEvents?: number;
}

/**
 * 重放状态
 */
export interface ReplayState {
  /** 是否正在重放 */
  isPlaying: boolean;
  
  /** 当前事件索引 */
  currentIndex: number;
  
  /** 总事件数 */
  totalEvents: number;
  
  /** 进度（0-1） */
  progress: number;
  
  /** 已播放事件数 */
  playedEvents: number;
  
  /** 开始时间 */
  startedAt: number | null;
  
  /** 结束时间 */
  endedAt: number | null;
}

/**
 * 重放统计
 */
export interface ReplayMetrics {
  /** 总事件数 */
  totalEvents: number;
  
  /** 已播放事件数 */
  playedEvents: number;
  
  /** 跳过事件数 */
  skippedEvents: number;
  
  /** 平均播放速度（events/sec） */
  averageSpeed: number;
  
  /** 总耗时（毫秒） */
  totalDuration: number;
  
  /** 实际事件时间跨度（毫秒） */
  eventTimeSpan: number;
}

/**
 * 事件重放器
 */
export class EventReplay {
  private readonly config: Required<ReplayConfig>;
  private readonly stateSubject: Subject<ReplayState>;
  private readonly metricsSubject: Subject<ReplayMetrics>;
  private readonly eventSubject: Subject<SimpleEvent>;
  
  public readonly state$: Observable<ReplayState>;
  public readonly metrics$: Observable<ReplayMetrics>;
  public readonly event$: Observable<SimpleEvent>;
  
  private state: ReplayState;
  private metrics: ReplayMetrics;
  private isPaused: boolean;
  private isStopped: boolean;

  constructor(config: ReplayConfig = {}) {
    this.config = {
      startTime: config.startTime ?? 0,
      endTime: config.endTime ?? Infinity, // 默认不限制结束时间
      eventTypes: config.eventTypes ?? [],
      speedMode: config.speedMode ?? 'realtime',
      speedMultiplier: config.speedMultiplier ?? 1,
      skipDelay: config.skipDelay ?? false,
      fixedDelayMs: config.fixedDelayMs ?? 100,
      maxEvents: config.maxEvents ?? Infinity,
    };

    this.stateSubject = new Subject<ReplayState>();
    this.metricsSubject = new Subject<ReplayMetrics>();
    this.eventSubject = new Subject<SimpleEvent>();

    this.state$ = this.stateSubject.asObservable();
    this.metrics$ = this.metricsSubject.asObservable();
    this.event$ = this.eventSubject.asObservable();

    this.state = {
      isPlaying: false,
      currentIndex: 0,
      totalEvents: 0,
      progress: 0,
      playedEvents: 0,
      startedAt: null,
      endedAt: null,
    };

    this.metrics = {
      totalEvents: 0,
      playedEvents: 0,
      skippedEvents: 0,
      averageSpeed: 0,
      totalDuration: 0,
      eventTimeSpan: 0,
    };

    this.isPaused = false;
    this.isStopped = false;
  }

  /**
   * 从 EventStore 重放事件
   */
  async replay(store: SimpleEventStore | { getAll(): SimpleRecordedEvent[] }): Promise<void> {
    console.log('[EventReplay] Starting replay...');
    
    this.isStopped = false;
    this.isPaused = false;
    this.state.startedAt = Date.now();
    this.state.isPlaying = true;
    this.updateState();

    try {
      // 获取事件列表
      const allEvents = store.getAll();
      
      // 过滤事件
      let events = this.filterEvents(allEvents);
      
      // 限制事件数
      if (events.length > this.config.maxEvents) {
        events = events.slice(0, this.config.maxEvents);
      }

      this.state.totalEvents = events.length;
      this.metrics.totalEvents = events.length;

      console.log(`[EventReplay] Replaying ${events.length} events (mode: ${this.config.speedMode})`);

      if (events.length === 0) {
        console.log('[EventReplay] No events to replay');
        this.complete();
        return;
      }

      // 计算时间跨度
      if (events.length > 1) {
        this.metrics.eventTimeSpan = events[events.length - 1].timestamp - events[0].timestamp;
      }

      // 重放事件
      for (let i = 0; i < events.length; i++) {
        if (this.isStopped) {
          console.log('[EventReplay] Replay stopped');
          break;
        }

        // 暂停处理
        while (this.isPaused && !this.isStopped) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const event = events[i];
        this.state.currentIndex = i;

        // 计算延迟
        const delayMs = this.calculateDelay(events, i);
        
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        // 发送事件
        this.eventSubject.next(event);
        this.state.playedEvents++;
        this.metrics.playedEvents++;

        // 更新状态
        this.state.progress = (i + 1) / events.length;
        this.updateState();
        this.updateMetrics();
      }

      this.complete();
    } catch (error) {
      console.error('[EventReplay] Replay error:', error);
      throw error;
    }
  }

  /**
   * 过滤事件
   */
  private filterEvents(events: SimpleRecordedEvent[]): SimpleEvent[] {
    return events
      .filter((e) => {
        // 时间范围过滤
        if (this.config.startTime && e.timestamp < this.config.startTime) {
          this.metrics.skippedEvents++;
          return false;
        }
        if (this.config.endTime && e.timestamp > this.config.endTime) {
          this.metrics.skippedEvents++;
          return false;
        }

        // 事件类型过滤
        if (this.config.eventTypes.length > 0 && !this.config.eventTypes.includes(e.type)) {
          this.metrics.skippedEvents++;
          return false;
        }

        return true;
      })
      .map((e) => ({
        type: e.type,
        timestamp: e.timestamp,
        payload: e.payload,
      }));
  }

  /**
   * 计算延迟
   */
  private calculateDelay(events: SimpleEvent[], index: number): number {
    if (this.config.speedMode === 'fast' || this.config.skipDelay) {
      return 0;
    }

    if (this.config.speedMode === 'slow') {
      return this.config.fixedDelayMs;
    }

    if (this.config.speedMode === 'custom') {
      if (index === 0) return 0;
      const timeDiff = events[index].timestamp - events[index - 1].timestamp;
      return Math.max(0, timeDiff / this.config.speedMultiplier);
    }

    // realtime mode
    if (index === 0) return 0;
    const timeDiff = events[index].timestamp - events[index - 1].timestamp;
    return Math.max(0, timeDiff);
  }

  /**
   * 暂停重放
   */
  pause(): void {
    if (this.state.isPlaying && !this.isPaused) {
      this.isPaused = true;
      console.log('[EventReplay] Paused');
    }
  }

  /**
   * 恢复重放
   */
  resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      console.log('[EventReplay] Resumed');
    }
  }

  /**
   * 停止重放
   */
  stop(): void {
    this.isStopped = true;
    this.complete();
    console.log('[EventReplay] Stopped');
  }

  /**
   * 完成重放
   */
  private complete(): void {
    this.state.isPlaying = false;
    this.state.endedAt = Date.now();
    this.updateState();
    this.updateMetrics();
    console.log('[EventReplay] Replay completed');
    console.log(`  Played: ${this.metrics.playedEvents}/${this.metrics.totalEvents} events`);
    console.log(`  Speed: ${this.metrics.averageSpeed.toFixed(2)} events/sec`);
    console.log(`  Duration: ${(this.metrics.totalDuration / 1000).toFixed(2)}s`);
  }

  /**
   * 更新状态
   */
  private updateState(): void {
    this.stateSubject.next({ ...this.state });
  }

  /**
   * 更新统计
   */
  private updateMetrics(): void {
    if (this.state.startedAt) {
      this.metrics.totalDuration = (this.state.endedAt || Date.now()) - this.state.startedAt;
      
      if (this.metrics.totalDuration > 0) {
        this.metrics.averageSpeed = (this.metrics.playedEvents / this.metrics.totalDuration) * 1000;
      }
    }

    this.metricsSubject.next({ ...this.metrics });
  }

  /**
   * 获取当前状态
   */
  getState(): ReplayState {
    return { ...this.state };
  }

  /**
   * 获取统计信息
   */
  getMetrics(): ReplayMetrics {
    return { ...this.metrics };
  }

  /**
   * 销毁重放器
   */
  destroy(): void {
    this.stop();
    this.stateSubject.complete();
    this.metricsSubject.complete();
    this.eventSubject.complete();
  }
}

