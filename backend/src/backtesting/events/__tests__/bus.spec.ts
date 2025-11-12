/**
 * EventBus 单元测试
 */

import { EventBus } from '../bus';
import { EventStore } from '../store';
import type { BaseEvent, EventType } from '../interfaces';
import { take, toArray } from 'rxjs';

type TestEventOverrides<TPayload> = Partial<Omit<BaseEvent<TPayload>, 'sequenceId'>> & {
  sequenceId?: string | number;
};

const createEvent = <TPayload = Record<string, unknown>>(
  overrides: TestEventOverrides<TPayload> = {}
): BaseEvent<TPayload> => {
  const rawSequence = overrides.sequenceId ?? `${Date.now()}`;
  const sequenceId =
    typeof rawSequence === 'number' ? rawSequence.toString() : rawSequence;

  return {
    eventId: overrides.eventId ?? `evt-${Math.random().toString(36).slice(2)}`,
    eventType: overrides.eventType ?? 'market.bar',
    sessionId: overrides.sessionId ?? 'test-session',
    sequenceId,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    source: overrides.source ?? 'event-bus-test',
    payload: overrides.payload ?? ({} as TPayload),
    metadata: overrides.metadata,
    correlationId: overrides.correlationId,
    causationId: overrides.causationId,
  };
};

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

      const testEvent = createEvent({
        eventType: 'market.bar',
        eventId: 'evt-1',
        sequenceId: '1',
        payload: { symbol: 'BTC/USDT', close: '50000' },
      });

      bus.event$.pipe(take(1)).subscribe({
        next: (event) => {
          expect(event.eventType).toBe('market.bar');
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

      const testEvent = createEvent({
        eventType: 'market.bar',
        eventId: 'evt-2',
        sequenceId: '2',
      });

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
        bus.publish(
          createEvent({
            eventType: 'market.bar',
            eventId: `evt-${i}`,
            sequenceId: String(i + 1),
            timestamp: new Date(Date.now() + i).toISOString(),
            payload: { index: i },
          })
        );
      }
    });
  });

  describe('事件订阅', () => {
    it('should subscribe to specific event type', (done) => {
      bus.start();

      const subscription = bus.subscribe('market.bar').pipe(take(1)).subscribe({
        next: (event) => {
          expect(event.eventType).toBe('market.bar');
          done();
        },
        error: done,
      });

      bus.publish(
        createEvent({
          eventType: 'market.bar',
          eventId: `evt-${Math.random()}`,
          sequenceId: `${Math.floor(Math.random() * 1000)}`,
        })
      );

      bus.publish(
        createEvent({
          eventType: 'strategy.intent',
          eventId: `evt-${Math.random()}`,
          sequenceId: `${Math.floor(Math.random() * 1000)}`,
        })
      );
    });

    it('should subscribe to multiple event types', (done) => {
      bus.start();

      const eventTypes = new Set<string>();

      bus
        .subscribe(['market.bar', 'strategy.intent'])
        .pipe(take(2))
        .subscribe({
          next: (event) => {
            eventTypes.add(event.eventType);
          },
          complete: () => {
            expect(eventTypes.size).toBe(2);
            expect(eventTypes.has('market.bar')).toBe(true);
            expect(eventTypes.has('strategy.intent')).toBe(true);
            done();
          },
          error: done,
        });

      (['market.bar', 'strategy.intent', 'execution.order'] as EventType[]).forEach((eventType) => {
        bus.publish(
          createEvent({
            eventType,
            eventId: `evt-${Math.random()}`,
            sequenceId: `${Math.floor(Math.random() * 1000)}`,
          })
        );
      });
    });

    it('should filter events with predicate', (done) => {
      bus.start();

      bus
        .subscribe('market.bar', {
          predicate: (event) => {
            const payload = event.payload as { symbol?: string } | undefined;
            return payload?.symbol === 'BTC/USDT';
          },
        })
        .pipe(take(1))
        .subscribe({
          next: (event) => {
            const payload = event.payload as { symbol?: string } | undefined;
            expect(payload?.symbol).toBe('BTC/USDT');
            done();
          },
          error: done,
        });

      bus.publish(
        createEvent({
          eventType: 'market.bar',
          eventId: 'evt-eth',
          sequenceId: '100',
          payload: { symbol: 'ETH/USDT' },
        })
      );

      bus.publish(
        createEvent({
          eventType: 'market.bar',
          eventId: 'evt-btc',
          sequenceId: '101',
          payload: { symbol: 'BTC/USDT' },
        })
      );
    });
  });

  describe('控制事件', () => {
    it('should emit control events', (done) => {
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
        bus.publish(
          createEvent({
            eventType: 'market.bar',
            eventId: `evt-${i}`,
            sequenceId: String(i + 1),
            timestamp: new Date(Date.now() + i).toISOString(),
            payload: { index: i },
          })
        );
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
          expect(metrics.throughput).toBeGreaterThanOrEqual(0);
          expect(metrics.uptime).toBeGreaterThanOrEqual(0);
          done();
        },
        error: done,
      });

      for (let i = 0; i < 5; i++) {
        bus.publish(
          createEvent({
            eventType: 'market.bar',
            eventId: `evt-${i}`,
            sequenceId: String(i + 1),
            timestamp: new Date(Date.now() + i).toISOString(),
            payload: { index: i },
          })
        );
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
        smallBus.publish(
          createEvent({
            eventType: 'market.bar',
            eventId: `evt-${i}`,
            sequenceId: String(i + 1),
            timestamp: new Date(Date.now() + i).toISOString(),
            payload: { index: i },
          })
        );
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
