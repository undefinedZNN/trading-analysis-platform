/**
 * EventBus & EventStore Module
 * 
 * 事件总线系统是回测框架的核心通信机制
 * 
 * @module events
 */

// === 接口定义 ===
export * from './interfaces';

// === 核心实现 ===
export { BusStateMachine } from './state-machine';
export { EventBus, type EventBusConfig } from './bus';
export { EventStore, type EventStoreConfig } from './store';

// === 简化实现 (M1-04-B) ===
export {
  SimpleEventBus,
  SimpleEventStore,
  SimpleStateMachine,
  type SimpleEvent,
  type SimpleRunStatus,
  type SimpleEventBusConfig,
  type SimpleControlEvent,
  type SimpleDeadLetterEvent,
  type SimpleBusState,
  type SimpleBusMetrics,
  type SimpleSubscriptionOptions,
} from './simple-bus';

// === 自动订阅扩展 ===
export {
  AutoSubscribeEventBus,
  createAutoSubscribeEventBus,
  type AutoSubscribeEventBusConfig,
} from './auto-subscribe-bus';

