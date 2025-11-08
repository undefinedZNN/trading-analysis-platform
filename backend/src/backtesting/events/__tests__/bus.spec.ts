/**
 * EventBus 单元测试
 */

import { EventBus } from '../bus';
import { EventStore } from '../store';
import type { BaseEvent, ControlEvent } from '../interfaces';
import { firstValueFrom, take, toArray } from 'rxjs';

describe('EventBus', () => {
  let bus: EventBus;
  let store: EventStore;

  beforeEach(() => {
    store = new EventStore({
      enablePersistence: false,
    });
    bus = new EventBus(store, {
      bufferSize: 1000,
      backpressureThreshold: 0.8,
      enableDeadLetter: true,
    });
  });

  afterEach(() => {
    bus.destroy();
    store.destroy();
  });

  describe('初始化', () => {
    it('should initialize in idle state', () => {
      expect(bus.getStatus()).toBe('idle');
    });

    it('should have zero metrics initially', () => {
      const metrics = bus.getMetrics();
      expect(metrics.totalEvents).toBe(0);
      expect(metrics.errorCount).toBe(0);
      expect(metrics.deadLetterCount).toBe(0);
      expect(metrics.bufferUsage).toBe(0);
    });
  });

  describe('状态控制', () => {
    it('should start bus', () => {
      bus.start();
      expect(bus.getStatus()).toBe('running');
    });

    it('should pause bus', () => {
      bus.start();
      bus.pause();
      expect(bus.getStatus()).toBe('paused');
    });

    it('should resume bus', () => {
      bus.start();
      bus.pause();
      bus.resume();
      expect(bus.getStatus()).toBe('running');
    });

    it('should stop bus', () => {
      bus.start();
      bus.stop();
      expect(bus.getStatus()).toBe('stopped');
    });

    it('should reset bus', () => {
      bus.start();
      bus.stop();
      bus.reset();
      expect(bus.getStatus()).toBe('idle');
      expect(bus.getMetrics().totalEvents).toBe(0);
    });
  });

  describe('事件发布', () => {
    it('should publish event when running', (done) => {
      bus.start();

      const testEvent: BaseEvent = {
        type: 'market.bar',
        timestamp: Date.now(),
        payload: { symbol: 'BTC/USDT', close: '50000' },
      };

      bus.event$.pipe(take(1)).subscribe({
        next: (event) => {
          expect(event.type).toBe('market.bar');
          expect(event.payload).toEqual(testEvent.payload);
          done();
        },
        error: done,
      });

      bus.publish(testEvent);
    });

    it('should not publish event when stopped', () => {
      bus.start();
      bus.stop();

      const testEvent: BaseEvent = {
        type: 'market.bar',
        timestamp: Date.now(),
        payload: {},
      };

      expect(() => bus.publish(testEvent)).toThrow(/stopped/);
    });

    it('should increment event count', (done) => {
      bus.start();

      bus.event$.pipe(take(3), toArray()).subscribe({
        next: () => {
          const metrics = bus.getMetrics();
          expect(metrics.totalEvents).toBe(3);
          done();
        },
        error: done,
      });

      for (let i = 0; i < 3; i++) {
        bus.publish({
          type: 'market.bar',
          timestamp: Date.now() + i,
          payload: { index: i },
        });
      }
    });
  });

  describe('事件订阅', () => {
    it('should subscribe to specific event type', (done) => {
      bus.start();

      const subscription = bus.subscribe('market.bar').pipe(take(1)).subscribe({
        next: (event) => {
          expect(event.type).toBe('market.bar');
          done();
        },
        error: done,
      });

      bus.publish({
        type: 'market.bar',
        timestamp: Date.now(),
        payload: {},
      });

      bus.publish({
        type: 'strategy.intent',
        timestamp: Date.now(),
        payload: {},
      });
    });

    it('should subscribe to multiple event types', (done) => {
      bus.start();

      const eventTypes = new Set<string>();

      bus
        .subscribe(['market.bar', 'strategy.intent'])
        .pipe(take(2))
        .subscribe({
          next: (event) => {
            eventTypes.add(event.type);
          },
          complete: () => {
            expect(eventTypes.size).toBe(2);
            expect(eventTypes.has('market.bar')).toBe(true);
            expect(eventTypes.has('strategy.intent')).toBe(true);
            done();
          },
          error: done,
        });

      bus.publish({
        type: 'market.bar',
        timestamp: Date.now(),
        payload: {},
      });

      bus.publish({
        type: 'strategy.intent',
        timestamp: Date.now(),
        payload: {},
      });

      bus.publish({
        type: 'execution.order',
        timestamp: Date.now(),
        payload: {},
      });
    });

    it('should filter events with predicate', (done) => {
      bus.start();

      bus
        .subscribe('market.bar', {
          predicate: (event) =>
            event.payload && event.payload.symbol === 'BTC/USDT',
        })
        .pipe(take(1))
        .subscribe({
          next: (event) => {
            expect(event.payload?.symbol).toBe('BTC/USDT');
            done();
          },
          error: done,
        });

      bus.publish({
        type: 'market.bar',
        timestamp: Date.now(),
        payload: { symbol: 'ETH/USDT' },
      });

      bus.publish({
        type: 'market.bar',
        timestamp: Date.now(),
        payload: { symbol: 'BTC/USDT' },
      });
    });
  });

  describe('控制事件', () => {
    it('should emit control events', (done) => {
      const controlEvent: ControlEvent = {
        type: 'START',
        timestamp: Date.now(),
      };

      bus.control$.pipe(take(1)).subscribe({
        next: (event) => {
          expect(event.type).toBe('START');
          done();
        },
        error: done,
      });

      bus.start();
    });

    it('should handle control event flow', (done) => {
      const controlTypes: string[] = [];

      bus.control$.pipe(take(4)).subscribe({
        next: (event) => {
          controlTypes.push(event.type);
        },
        complete: () => {
          expect(controlTypes).toContain('START');
          expect(controlTypes).toContain('PAUSE');
          expect(controlTypes).toContain('RESUME');
          expect(controlTypes).toContain('STOP');
          done();
        },
        error: done,
      });

      bus.start();
      setTimeout(() => bus.pause(), 10);
      setTimeout(() => bus.resume(), 20);
      setTimeout(() => bus.stop(), 30);
    });
  });

  describe('检查点', () => {
    it('should create checkpoint', () => {
      bus.start();

      for (let i = 0; i < 5; i++) {
        bus.publish({
          type: 'market.bar',
          timestamp: Date.now() + i,
          payload: { index: i },
        });
      }

      expect(() => bus.checkpoint('cp1')).not.toThrow();
    });
  });

  describe('度量统计', () => {
    it('should track metrics', (done) => {
      bus.start();

      bus.event$.pipe(take(5), toArray()).subscribe({
        next: () => {
          const metrics = bus.getMetrics();
          expect(metrics.totalEvents).toBe(5);
          expect(metrics.bufferUsage).toBeLessThan(0.01); // 5/1000
          expect(metrics.throughput).toBeGreaterThan(0);
          expect(metrics.uptime).toBeGreaterThan(0);
          done();
        },
        error: done,
      });

      for (let i = 0; i < 5; i++) {
        bus.publish({
          type: 'market.bar',
          timestamp: Date.now() + i,
          payload: { index: i },
        });
      }
    });

    it('should track buffer usage', (done) => {
      const smallBus = new EventBus(store, {
        bufferSize: 10,
      });

      smallBus.start();

      smallBus.event$.pipe(take(8), toArray()).subscribe({
        next: () => {
          const metrics = smallBus.getMetrics();
          expect(metrics.bufferUsage).toBeGreaterThan(0.7); // 8/10
          smallBus.destroy();
          done();
        },
        error: done,
      });

      for (let i = 0; i < 8; i++) {
        smallBus.publish({
          type: 'market.bar',
          timestamp: Date.now() + i,
          payload: { index: i },
        });
      }
    });
  });

  describe('状态流', () => {
    it('should emit state changes', (done) => {
      const states: string[] = [];

      bus.state$.pipe(take(3)).subscribe({
        next: (state) => {
          states.push(state.status);
        },
        complete: () => {
          expect(states).toContain('idle');
          expect(states).toContain('running');
          done();
        },
        error: done,
      });

      bus.start();
    });
  });
});

