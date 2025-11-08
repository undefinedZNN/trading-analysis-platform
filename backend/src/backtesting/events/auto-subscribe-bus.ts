/**
 * AutoSubscribeEventBus - 自动订阅管理的 EventBus 扩展
 * 
 * 解决 SimpleEventBus 冷 Observable 问题：
 * - 自动创建保活订阅，无需手动订阅
 * - 自动管理订阅生命周期
 * - 防止订阅泄漏
 * 
 * 使用示例：
 * ```typescript
 * const bus = new AutoSubscribeEventBus(store, { autoSubscribe: true });
 * bus.start();
 * bus.publish(event);  // 直接工作，无需手动订阅
 * ```
 */

import { Subscription } from 'rxjs';
import { SimpleEventBus, SimpleEventStore, SimpleEventBusConfig } from './simple-bus';

/**
 * 扩展配置接口，添加 autoSubscribe 选项
 */
export interface AutoSubscribeEventBusConfig extends SimpleEventBusConfig {
  /**
   * 是否自动创建保活订阅
   * 
   * - true: 自动创建内部订阅，确保事件管道始终激活
   * - false: 不自动订阅，需要手动创建订阅（默认行为）
   * 
   * @default true
   */
  autoSubscribe?: boolean;
}

/**
 * 自动订阅管理的 EventBus
 * 
 * 特性：
 * - ✅ 自动创建保活订阅（可配置）
 * - ✅ 自动清理订阅
 * - ✅ 防止内存泄漏
 * - ✅ 完全兼容 SimpleEventBus API
 * 
 * @example
 * ```typescript
 * // 启用自动订阅（推荐）
 * const bus = new AutoSubscribeEventBus(store, { autoSubscribe: true });
 * bus.start();
 * bus.publish({ type: 'test', timestamp: Date.now(), payload: {} });
 * // 事件自动存储，无需手动订阅
 * 
 * // 禁用自动订阅（传统行为）
 * const bus = new AutoSubscribeEventBus(store, { autoSubscribe: false });
 * const sub = bus.event$.subscribe();  // 需要手动订阅
 * bus.start();
 * bus.publish(event);
 * ```
 */
export class AutoSubscribeEventBus extends SimpleEventBus {
  private keepAliveSubscription?: Subscription;
  private readonly autoSubscribeEnabled: boolean;

  /**
   * 构造函数
   * 
   * @param store - EventStore 实例
   * @param config - 配置选项，包含 autoSubscribe
   */
  constructor(store: SimpleEventStore, config: AutoSubscribeEventBusConfig = {}) {
    // 调用父类构造函数
    super(store, config);

    // 保存 autoSubscribe 配置（默认为 true）
    this.autoSubscribeEnabled = config.autoSubscribe !== false;

    // 如果启用自动订阅，立即创建保活订阅
    if (this.autoSubscribeEnabled) {
      this.createKeepAliveSubscription();
    }
  }

  /**
   * 创建保活订阅
   * 
   * 这个订阅不处理任何事件，仅用于激活事件管道
   * @private
   */
  private createKeepAliveSubscription(): void {
    if (!this.keepAliveSubscription || this.keepAliveSubscription.closed) {
      this.keepAliveSubscription = this.event$.subscribe({
        // 空订阅，仅激活管道
        error: (err) => {
          console.error('[AutoSubscribeEventBus] Keep-alive subscription error:', err);
        }
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[AutoSubscribeEventBus] Keep-alive subscription created');
      }
    }
  }

  /**
   * 重写 destroy 方法，添加订阅清理逻辑
   */
  destroy(): void {
    // 清理保活订阅
    if (this.keepAliveSubscription && !this.keepAliveSubscription.closed) {
      this.keepAliveSubscription.unsubscribe();
      this.keepAliveSubscription = undefined;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[AutoSubscribeEventBus] Keep-alive subscription destroyed');
      }
    }

    // 调用父类的 destroy
    super.destroy();
  }

  /**
   * 获取自动订阅状态
   * 
   * @returns 是否启用了自动订阅
   */
  isAutoSubscribeEnabled(): boolean {
    return this.autoSubscribeEnabled;
  }

  /**
   * 检查保活订阅是否活跃
   * 
   * @returns 保活订阅是否活跃
   */
  isKeepAliveActive(): boolean {
    return this.keepAliveSubscription !== undefined && !this.keepAliveSubscription.closed;
  }

  /**
   * 手动重新激活保活订阅
   * 
   * 在某些特殊情况下（如订阅被意外取消），可以手动重新激活
   */
  reactivateKeepAlive(): void {
    if (this.autoSubscribeEnabled) {
      if (this.keepAliveSubscription?.closed) {
        console.warn('[AutoSubscribeEventBus] Keep-alive subscription was closed, reactivating...');
        this.createKeepAliveSubscription();
      }
    } else {
      console.warn('[AutoSubscribeEventBus] Auto-subscribe is disabled, cannot reactivate');
    }
  }
}

/**
 * 创建 AutoSubscribeEventBus 的工厂函数
 * 
 * @param store - EventStore 实例
 * @param config - 配置选项
 * @returns AutoSubscribeEventBus 实例
 * 
 * @example
 * ```typescript
 * const bus = createAutoSubscribeEventBus(store, { autoSubscribe: true });
 * ```
 */
export function createAutoSubscribeEventBus(
  store: SimpleEventStore,
  config?: AutoSubscribeEventBusConfig
): AutoSubscribeEventBus {
  return new AutoSubscribeEventBus(store, config);
}

