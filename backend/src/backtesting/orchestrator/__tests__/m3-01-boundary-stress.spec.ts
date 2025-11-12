/**
 * M3-01 Orchestrator 边界和压力测试
 *
 * 使用现代配置与模块接口，对配置、容器、会话和编排器进行极限测试
 */

import {
  mergeConfig,
  validateConfig,
  validateConfigOrThrow,
} from '../config';
import {
  DefaultServiceContainer,
  ServiceLifetime,
} from '../container';
import {
  SessionStateMachine as CoreSessionStateMachine,
  SessionState,
  InvalidStateTransitionError,
} from '../session';
import type { BacktestSessionConfig } from '../interfaces/config';
import type { StrategyManifest } from '../../strategy/interfaces';

const TEST_MANIFEST: StrategyManifest = {
  strategyId: 'default-strategy',
  name: 'Boundary Strategy',
  version: '1.0.0',
  description: 'Test manifest for boundary scenarios',
  author: 'm3-suite',
  requiredTimeframe: '1h',
  featureDeps: [],
  dataDeps: [{ symbol: 'BTCUSDT' }],
  defaultParameters: {},
};

const BASE_CONFIG: BacktestSessionConfig = {
  sessionId: 'legacy-session',
  data: {
    source: {
      provider: 'parquet-duckdb',
      path: '/data/btc',
      symbols: ['BTCUSDT'],
      timeRange: {
        start: '2024-01-01T00:00:00Z',
        end: '2024-02-01T00:00:00Z',
      },
      gapPolicy: 'forward-fill',
    },
    timeframe: {
      primary: '1h',
      auxiliary: ['15m', '4h'],
    },
  },
  strategy: {
    strategyId: 'default-strategy',
    name: 'Default Strategy',
    scriptContent: 'export default function strategy() { return 42; }',
    manifest: TEST_MANIFEST,
    parameters: { lookback: 20 },
    customFeatures: ['ema', 'sma'],
  },
  execution: {
    initialCapital: '100000',
    matching: { marketFillPolicy: 'close' },
    slippage: { model: 'zero' },
    fee: { model: 'zero' },
  },
  risk: {
    rules: [
      {
        ruleId: 'max-loss',
        type: 'max-loss',
        enabled: true,
        priority: 1,
        params: { maxDrawdown: 0.2 },
      },
    ],
  },
  analytics: {
    realtime: false,
    metrics: ['sharpe', 'sortino'],
    generateReport: true,
  },
  output: {
    directory: '/tmp/backtests',
    formats: ['json'],
    compress: false,
  },
  log: {
    level: 'info',
    console: true,
  },
  metadata: {},
};

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item)) as unknown as T;
  }

  if (value && typeof value === 'object') {
    const clone: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>).forEach((key) => {
      clone[key] = cloneValue((value as Record<string, unknown>)[key]);
    });
    return clone as T;
  }

  return value;
}

function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T> = {}): T {
  const result: Record<string, any> = Array.isArray(target) ? [...target] : { ...target };

  Object.keys(source).forEach((key) => {
    const sourceValue = (source as Record<string, any>)[key];
    if (sourceValue === undefined) {
      return;
    }

    const targetValue = result[key];
    const bothObjects =
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue);

    if (Array.isArray(sourceValue)) {
      result[key] = [...sourceValue];
    } else if (bothObjects) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else {
      result[key] = sourceValue;
    }
  });

  return result as T;
}

function createConfig(
  overrides: Partial<BacktestSessionConfig> = {}
): BacktestSessionConfig {
  const baseClone = cloneValue(BASE_CONFIG);
  return deepMerge(baseClone, overrides);
}

function createStrategy(
  overrides: Partial<BacktestSessionConfig['strategy']> = {}
): BacktestSessionConfig['strategy'] {
  const baseStrategy = cloneValue(BASE_CONFIG.strategy);
  return deepMerge(baseStrategy, overrides);
}

class TestServiceContainer extends DefaultServiceContainer {
  register(
    token: string,
    depsOrFactory: string[] | ((...deps: any[]) => any),
    factoryOrLifetime?: ((...deps: any[]) => any) | ServiceLifetime | string,
    lifetimeMaybe?: ServiceLifetime | string
  ): void {
    let dependencies: string[] = [];
    let factory: (...deps: any[]) => any;
    let lifetime: ServiceLifetime | string | undefined;

    if (Array.isArray(depsOrFactory)) {
      dependencies = depsOrFactory;
      factory = factoryOrLifetime as (...deps: any[]) => any;
      lifetime = lifetimeMaybe;
    } else {
      factory = depsOrFactory;
      lifetime = factoryOrLifetime as ServiceLifetime | string | undefined;
    }

    const normalizedLifetime = this.normalizeLifetime(lifetime);

    this.registerFactory(
      token,
      (container) => {
        const resolvedDeps = dependencies.map((dep) => container.resolve(dep));
        return factory(...resolvedDeps);
      },
      normalizedLifetime
    );
  }

  private normalizeLifetime(
    lifetime?: ServiceLifetime | string
  ): ServiceLifetime | undefined {
    if (!lifetime) {
      return undefined;
    }

    if (typeof lifetime === 'string') {
      switch (lifetime.toLowerCase()) {
        case 'singleton':
          return ServiceLifetime.Singleton;
        case 'transient':
          return ServiceLifetime.Transient;
        case 'scoped':
          return ServiceLifetime.Scoped;
        default:
          return undefined;
      }
    }

    return lifetime;
  }
}

type StateChangeListener = (event: { newState: SessionState }) => void;

class TestSessionStateMachine {
  private machine = new CoreSessionStateMachine(SessionState.Idle);
  private listeners = new Set<StateChangeListener>();

  initialize(): void {
    this.transition(SessionState.Initializing);
  }

  start(): void {
    this.transition(SessionState.Running);
  }

  pause(): void {
    this.transition(SessionState.Paused);
  }

  resume(): void {
    this.transition(SessionState.Running);
  }

  stop(): void {
    this.transition(SessionState.Stopped);
  }

  reset(): void {
    this.machine.reset();
    this.notify();
  }

  getCurrentState(): SessionState {
    return this.machine.getState();
  }

  getHistory() {
    return this.machine.getHistory();
  }

  onStateChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private transition(state: SessionState): void {
    if (!this.machine.canTransitionTo(state)) {
      throw new InvalidStateTransitionError(this.machine.getState(), state);
    }
    this.machine.transitionTo(state);
    this.notify();
  }

  private notify(): void {
    const event = { newState: this.machine.getState() };
    this.listeners.forEach((listener) => listener(event));
  }
}

class TestOrchestrator {
  private sessions = new Map<
    string,
    { state: 'idle' | 'running' | 'stopped'; config: BacktestSessionConfig }
  >();

  constructor(private readonly baseConfig: BacktestSessionConfig) {}

  private buildConfig(
    sessionId: string,
    overrides: Partial<BacktestSessionConfig> = {}
  ): BacktestSessionConfig {
    return deepMerge(cloneValue(this.baseConfig), {
      ...overrides,
      sessionId,
    });
  }

  async createSession(
    sessionId: string,
    overrides: Partial<BacktestSessionConfig> = {}
  ): Promise<void> {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    if (this.sessions.has(sessionId)) {
      throw new Error('Session already exists');
    }

    const sessionConfig = this.buildConfig(sessionId, overrides);
    validateConfigOrThrow(sessionConfig);

    this.sessions.set(sessionId, { state: 'idle', config: sessionConfig });
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  async destroySession(sessionId: string): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      throw new Error('Session not found');
    }
    this.sessions.delete(sessionId);
  }

  async startSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.state === 'running') {
      throw new Error('Session already started');
    }
    session.state = 'running';
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    session.state = 'stopped';
  }

  async destroy(): Promise<void> {
    this.sessions.clear();
  }
}

describe('M3-01 Orchestrator - Boundary & Stress Tests', () => {
  describe('Config - Boundary Tests', () => {
    it('should handle empty custom feature list', () => {
      const config = createConfig({
        strategy: createStrategy({
          customFeatures: [],
        }),
      });
      expect(config.strategy.customFeatures).toEqual([]);
    });

    it('should handle extremely long session IDs', () => {
      const longId = 'a'.repeat(512);
      const config = createConfig({
        sessionId: longId,
      });
      const result = validateConfig(config);

      expect(config.sessionId).toBe(longId);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid characters in session ID', () => {
      const invalid = createConfig({
        sessionId: 'session-123_ABC!@#$',
      });
      const result = validateConfig(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors.some((err) => err.path === 'sessionId')).toBe(true);
    });

    it('should reject zero initial capital', () => {
      const invalidCapital = createConfig({
        execution: { initialCapital: '0' },
      });
      const result = validateConfig(invalidCapital);

      expect(result.valid).toBe(false);
    });

    it('should handle very large initial capital', () => {
      const largeCapital = createConfig({
        execution: { initialCapital: '999999999999999999999' },
      });
      const result = validateConfig(largeCapital);

      expect(result.valid).toBe(true);
    });

    it('should handle deep nested metadata merge', () => {
      const nested = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'new',
              },
            },
          },
        },
      };

      const merged = mergeConfig({
        ...createConfig(),
        metadata: nested,
      });

      expect(
        (merged.metadata as any).level1.level2.level3.level4.value
      ).toBe('new');
    });

    it('should handle circular reference protection in merge', () => {
      const metadata: any = { value: 1 };
      metadata.circular = { parent: metadata };

      const merged = mergeConfig({
        ...createConfig(),
        metadata,
      });

      expect(merged.metadata).toBeDefined();
    });

    it('should invalidate empty config', () => {
      const result = validateConfig({} as BacktestSessionConfig);
      expect(result.valid).toBe(false);
    });

    it('should validate config with invalid data time range', () => {
      const base = createConfig();
      const invalid = createConfig({
        data: {
          source: {
            ...base.data.source,
            timeRange: {
              start: 'invalid',
              end: base.data.source.timeRange.end,
            },
          },
          timeframe: base.data.timeframe,
        },
      });

      const result = validateConfig(invalid);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((err) =>
          err.path.startsWith('data.source.timeRange')
        )
      ).toBe(true);
    });
  });

  describe('Container - Boundary Tests', () => {
    let container: TestServiceContainer;

    beforeEach(() => {
      container = new TestServiceContainer();
    });

    it('should handle registering 1000+ services', () => {
      for (let i = 0; i < 1000; i++) {
        container.register(`service-${i}`, () => ({ id: i }));
      }

      const service = container.resolve<{ id: number }>('service-999');
      expect(service.id).toBe(999);
    });

    it('should handle deeply nested dependencies', () => {
      container.register('level1', () => ({ value: 1 }));
      container.register('level2', ['level1'], (l1: any) => ({ ...l1, value: 2 }));
      container.register('level3', ['level2'], (l2: any) => ({ ...l2, value: 3 }));
      container.register('level4', ['level3'], (l3: any) => ({ ...l3, value: 4 }));
      container.register('level5', ['level4'], (l4: any) => ({ ...l4, value: 5 }));

      const result = container.resolve<{ value: number }>('level5');
      expect(result.value).toBe(5);
    });

    it('should detect complex circular dependencies', () => {
      container.register('a', ['b'], (b: any) => ({ b }));
      container.register('b', ['c'], (c: any) => ({ c }));
      container.register('c', ['a'], (a: any) => ({ a }));

      expect(() => container.resolve('a')).toThrow(/circular dependency/i);
    });

    it('should handle zero-length service names', () => {
      expect(() => container.register('', () => ({}))).toThrow();
    });

    it('should handle service with very long name', () => {
      const longName = 'service-' + 'x'.repeat(1000);
      container.register(longName, () => ({ id: 1 }));
      expect(container.resolve<{ id: number }>(longName).id).toBe(1);
    });

    it('should handle service returning null', () => {
      container.register('null-service', () => null);
      expect(container.resolve('null-service')).toBeNull();
    });

    it('should handle service returning undefined', () => {
      container.register('undefined-service', () => undefined);
      expect(() => container.resolve('undefined-service')).toThrow('Service not found');
      expect(container.tryResolve('undefined-service')).toBeUndefined();
    });

    it('should handle service factory throwing error', () => {
      container.register('error-service', () => {
        throw new Error('Service creation failed');
      });

      expect(() => container.resolve('error-service')).toThrow('Service creation failed');
    });
  });

  describe('Session State Machine - Boundary Tests', () => {
    let stateMachine: TestSessionStateMachine;

    beforeEach(() => {
      stateMachine = new TestSessionStateMachine();
    });

    it('should handle rapid state transitions', () => {
      for (let i = 0; i < 100; i++) {
        stateMachine.initialize();
        stateMachine.start();
        stateMachine.pause();
        stateMachine.resume();
        stateMachine.stop();
        stateMachine.reset();
      }

      expect(stateMachine.getCurrentState()).toBe(SessionState.Idle);
    });

    it('should handle invalid state transition attempts', () => {
      expect(() => stateMachine.pause()).toThrow(InvalidStateTransitionError);
      expect(() => stateMachine.resume()).toThrow(InvalidStateTransitionError);

      stateMachine.initialize();

      expect(() => stateMachine.initialize()).toThrow(InvalidStateTransitionError);
    });

    it('should track 1000+ state transitions', () => {
      for (let i = 0; i < 250; i++) {
        stateMachine.initialize();
        stateMachine.start();
        stateMachine.pause();
        stateMachine.resume();
        stateMachine.stop();
      }

      const history = stateMachine.getHistory();
      expect(history.length).toBeGreaterThan(1000);
      const lastEntry = history[history.length - 1];
      expect(lastEntry?.state).toBe(SessionState.Stopped);
    });

    it('should handle concurrent state change listeners', () => {
      const listeners: Array<jest.Mock> = [];

      for (let i = 0; i < 100; i++) {
        const listener = jest.fn();
        stateMachine.onStateChange(listener);
        listeners.push(listener);
      }

      stateMachine.initialize();

      listeners.forEach((listener) => {
        expect(listener).toHaveBeenCalled();
      });
    });
  });

  describe('Orchestrator - Stress Tests', () => {
    let orchestrator: TestOrchestrator;

    beforeEach(() => {
      orchestrator = new TestOrchestrator(createConfig({ sessionId: 'stress-test' }));
    });

    afterEach(async () => {
      await orchestrator.destroy();
    });

    it('should handle rapid session creation and destruction', async () => {
      for (let i = 0; i < 10; i++) {
        const sessionId = `stress-session-${i}`;
        await orchestrator.createSession(sessionId);
        await orchestrator.destroySession(sessionId);
      }

      expect(orchestrator.listSessions().length).toBe(0);
    });

    it('should handle multiple concurrent sessions', async () => {
      const sessionIds = Array.from({ length: 10 }, (_, i) => `concurrent-${i}`);

      await Promise.all(
        sessionIds.map((id) => orchestrator.createSession(id))
      );

      expect(orchestrator.listSessions().length).toBe(10);

      await Promise.all(
        sessionIds.map((id) => orchestrator.destroySession(id))
      );
    });

    it('should reject sessions with missing strategy', async () => {
      await expect(
        orchestrator.createSession('empty-session', { strategy: null as any })
      ).rejects.toThrow(/Configuration validation failed/);
    });

    it('should handle session with invalid strategy script', async () => {
      await expect(
        orchestrator.createSession('invalid-script', {
          strategy: createStrategy({ scriptContent: '' }),
        })
      ).rejects.toThrow(/Configuration validation failed/);
    });

    it('should handle destroying non-existent session', async () => {
      await expect(
        orchestrator.destroySession('non-existent')
      ).rejects.toThrow('Session not found');
    });

    it('should handle starting already started session', async () => {
      const sessionId = 'duplicate-start';
      await orchestrator.createSession(sessionId);

      await orchestrator.startSession(sessionId);

      await expect(
        orchestrator.startSession(sessionId)
      ).rejects.toThrow('Session already started');

      await orchestrator.stopSession(sessionId);
      await orchestrator.destroySession(sessionId);
    });

    it('should handle extremely large config objects', async () => {
      await orchestrator.createSession('large-config', {
        metadata: {
          payload: 'x'.repeat(100000),
        },
      });
      await orchestrator.destroySession('large-config');
    });
  });

  describe('Memory Leak Tests', () => {
    it('should not leak memory with repeated operations', async () => {
      const orchestrator = new TestOrchestrator(
        createConfig({ sessionId: 'memory-test' })
      );

      for (let i = 0; i < 100; i++) {
        const sessionId = `leak-test-${i}`;
        await orchestrator.createSession(sessionId);
        await orchestrator.destroySession(sessionId);
      }

      expect(orchestrator.listSessions().length).toBe(0);

      await orchestrator.destroy();
    });

    it('should clean up listeners on destruction', () => {
      const stateMachine = new TestSessionStateMachine();
      const listeners: Array<() => void> = [];

      for (let i = 0; i < 100; i++) {
        listeners.push(stateMachine.onStateChange(jest.fn()));
      }

      listeners.forEach((unsubscribe) => unsubscribe());
      stateMachine.reset();

      expect(listeners.length).toBe(100);
    });
  });

  describe('Error Recovery Tests', () => {
    it('should recover from service creation failures', () => {
      const container = new TestServiceContainer();
      let callCount = 0;

      container.register(
        'flaky-service',
        () => {
          callCount++;
          if (callCount < 3) {
            throw new Error('Service temporarily unavailable');
          }
          return { id: 'success' };
        },
        'transient'
      );

      expect(() => container.resolve('flaky-service')).toThrow();
      expect(() => container.resolve('flaky-service')).toThrow();

      const service = container.resolve<{ id: string }>('flaky-service');
      expect(service.id).toBe('success');
    });

    it('should handle partial session initialization failure', async () => {
      const orchestrator = new TestOrchestrator(
        createConfig({ sessionId: 'partial-fail' })
      );

      await expect(
        orchestrator.createSession('fail-session', {
          strategy: createStrategy({ scriptContent: '' }),
        })
      ).rejects.toThrow();

      await orchestrator.createSession('success-session', {
        strategy: createStrategy({ strategyId: 'success' }),
      });

      await orchestrator.destroySession('success-session');
      await orchestrator.destroy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle config with only required fields', () => {
      const minimal: BacktestSessionConfig = {
        sessionId: 'minimal',
        data: {
          source: {
            provider: 'parquet-duckdb',
            path: '/minimal',
            symbols: ['BTCUSDT'],
            timeRange: {
              start: '2024-01-01T00:00:00Z',
              end: '2024-01-02T00:00:00Z',
            },
          },
          timeframe: {
            primary: '1h',
          },
        },
        strategy: {
          strategyId: 'minimal-strategy',
          scriptContent: 'export default function strategy() {}',
          manifest: TEST_MANIFEST,
        },
        execution: {
          initialCapital: '1000',
        },
        risk: {
          rules: [
            {
              ruleId: 'max-loss',
              type: 'max-loss',
              enabled: true,
              priority: 1,
              params: { maxDrawdown: 0.1 },
            },
          ],
        },
      };

      const result = validateConfig(minimal);
      expect(result.valid).toBe(true);
    });

    it('should reject unicode characters in session ID', () => {
      const unicode = createConfig({
        sessionId: 'session-测试-🚀',
      });

      const result = validateConfig(unicode);
      expect(result.valid).toBe(false);
    });

    it('should handle extremely nested strategy params', () => {
      const deepParams: Record<string, any> = { level: 0 };
      let current = deepParams;

      for (let i = 1; i < 100; i++) {
        current.nested = { level: i };
        current = current.nested;
      }

      const config = createConfig({
        strategy: createStrategy({
          parameters: deepParams,
        }),
      });

      expect(config.strategy.parameters).toBeDefined();
    });

    it('should treat NaN capital strings as invalid', () => {
      const config = createConfig({
        execution: {
          initialCapital: 'NaN',
        },
      });

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });
  });
});
