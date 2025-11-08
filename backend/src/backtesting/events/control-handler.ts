/**
 * 控制事件处理器
 * 
 * 职责：
 * 1. 处理所有控制事件（START/PAUSE/RESUME/STOP/RESET/CHECKPOINT/SEEK）
 * 2. 状态转换验证
 * 3. 事件日志记录
 * 4. 错误处理
 * 
 * @module ControlEventHandler
 */

import { Observable, Subject } from 'rxjs';
import { filter, tap } from 'rxjs/operators';
import type {
  SimpleControlEvent,
  SimpleRunStatus,
  SimpleBusState,
} from './simple-bus';

/**
 * 控制事件处理结果
 */
export interface ControlEventResult {
  /** 是否成功 */
  success: boolean;
  
  /** 前一个状态 */
  previousStatus: SimpleRunStatus;
  
  /** 新状态 */
  newStatus: SimpleRunStatus;
  
  /** 处理时间戳 */
  timestamp: number;
  
  /** 错误信息（如果失败） */
  error?: string;
  
  /** 额外信息 */
  metadata?: Record<string, any>;
}

/**
 * 控制事件历史记录
 */
export interface ControlEventHistory {
  event: SimpleControlEvent;
  result: ControlEventResult;
}

/**
 * 控制事件处理器配置
 */
export interface ControlEventHandlerConfig {
  /** 是否启用日志 */
  enableLogging?: boolean;
  
  /** 历史记录大小 */
  historySize?: number;
  
  /** 是否启用严格模式（严格验证状态转换） */
  strictMode?: boolean;
}

/**
 * 控制事件处理器
 */
export class ControlEventHandler {
  private readonly config: Required<ControlEventHandlerConfig>;
  private readonly history: ControlEventHistory[];
  private readonly resultSubject: Subject<ControlEventResult>;
  
  public readonly result$: Observable<ControlEventResult>;

  constructor(config: ControlEventHandlerConfig = {}) {
    this.config = {
      enableLogging: config.enableLogging ?? true,
      historySize: config.historySize ?? 100,
      strictMode: config.strictMode ?? true,
    };

    this.history = [];
    this.resultSubject = new Subject<ControlEventResult>();
    this.result$ = this.resultSubject.asObservable();
  }

  /**
   * 处理控制事件
   */
  handle(
    event: SimpleControlEvent,
    currentState: SimpleBusState,
    executeAction: (event: SimpleControlEvent) => void
  ): ControlEventResult {
    const startTime = Date.now();
    const previousStatus = currentState.status;

    try {
      // 验证状态转换
      if (this.config.strictMode) {
        this.validateTransition(event.type, currentState.status);
      }

      // 执行操作
      executeAction(event);

      // 获取新状态（假设操作已修改状态）
      const newStatus = this.inferNewStatus(event.type, previousStatus);

      // 创建成功结果
      const result: ControlEventResult = {
        success: true,
        previousStatus,
        newStatus,
        timestamp: startTime,
        metadata: {
          eventType: event.type,
          duration: Date.now() - startTime,
          payload: event.payload,
        },
      };

      // 记录结果
      this.recordResult(event, result);

      // 发出结果
      this.resultSubject.next(result);

      // 日志
      if (this.config.enableLogging) {
        this.log('info', `Control event ${event.type} executed successfully`, result);
      }

      return result;
    } catch (error: any) {
      // 创建失败结果
      const result: ControlEventResult = {
        success: false,
        previousStatus,
        newStatus: previousStatus, // 状态未变
        timestamp: startTime,
        error: error.message || String(error),
        metadata: {
          eventType: event.type,
          duration: Date.now() - startTime,
        },
      };

      // 记录结果
      this.recordResult(event, result);

      // 发出结果
      this.resultSubject.next(result);

      // 日志
      if (this.config.enableLogging) {
        this.log('error', `Control event ${event.type} failed`, result);
      }

      throw error;
    }
  }

  /**
   * 验证状态转换是否合法
   */
  private validateTransition(eventType: string, currentStatus: SimpleRunStatus): void {
    const validTransitions: Record<string, SimpleRunStatus[]> = {
      START: ['idle', 'stopped'],
      PAUSE: ['running'],
      RESUME: ['paused'],
      STOP: ['running', 'paused'],
      RESET: ['stopped'],
      CHECKPOINT: ['running', 'paused'],
      SEEK: ['paused', 'stopped'],
    };

    const allowedStates = validTransitions[eventType];
    if (!allowedStates) {
      throw new Error(`Unknown control event type: ${eventType}`);
    }

    if (!allowedStates.includes(currentStatus)) {
      throw new Error(
        `Invalid state transition: cannot ${eventType} from ${currentStatus} (allowed: ${allowedStates.join(', ')})`
      );
    }
  }

  /**
   * 推断新状态
   */
  private inferNewStatus(
    eventType: string,
    previousStatus: SimpleRunStatus
  ): SimpleRunStatus {
    const statusMap: Record<string, SimpleRunStatus> = {
      START: 'running',
      PAUSE: 'paused',
      RESUME: 'running',
      STOP: 'stopped',
      RESET: 'idle',
      CHECKPOINT: previousStatus, // 状态不变
      SEEK: previousStatus, // 状态不变
    };

    return statusMap[eventType] || previousStatus;
  }

  /**
   * 记录结果到历史
   */
  private recordResult(event: SimpleControlEvent, result: ControlEventResult): void {
    this.history.push({ event, result });

    // 限制历史记录大小
    if (this.history.length > this.config.historySize) {
      this.history.shift();
    }
  }

  /**
   * 日志输出
   */
  private log(level: 'info' | 'error', message: string, result: ControlEventResult): void {
    const logMessage = `[ControlEventHandler] ${message} (${result.previousStatus} → ${result.newStatus})`;

    if (level === 'error') {
      console.error(logMessage, result.error);
    } else {
      console.log(logMessage);
    }
  }

  /**
   * 获取历史记录
   */
  getHistory(): ControlEventHistory[] {
    return [...this.history];
  }

  /**
   * 获取最近的结果
   */
  getLastResult(): ControlEventResult | null {
    const lastEntry = this.history[this.history.length - 1];
    return lastEntry ? lastEntry.result : null;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalEvents: number;
    successCount: number;
    errorCount: number;
    successRate: number;
  } {
    const totalEvents = this.history.length;
    const successCount = this.history.filter((h) => h.result.success).length;
    const errorCount = totalEvents - successCount;
    const successRate = totalEvents > 0 ? successCount / totalEvents : 0;

    return {
      totalEvents,
      successCount,
      errorCount,
      successRate,
    };
  }

  /**
   * 清空历史记录
   */
  clearHistory(): void {
    this.history.length = 0;
  }

  /**
   * 销毁处理器
   */
  destroy(): void {
    this.resultSubject.complete();
    this.clearHistory();
  }
}

