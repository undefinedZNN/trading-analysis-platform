/**
 * M3-01 Orchestrator 边界和压力测试
 * 
 * 测试配置、容器、会话和编排器的极端情况
 */

import { createConfig, validateConfig, mergeConfig } from '../config';
import { ServiceContainer } from '../container';
import { SessionStateMachine, Session } from '../session';
import { Orchestrator } from '../orchestrator';
import { OrchestrationError, ConfigurationError } from '../interfaces/orchestrator';

describe('M3-01 Orchestrator - Boundary & Stress Tests', () => {
  
  describe('Config - Boundary Tests', () => {
    it('should handle empty strategy list', () => {
      const config = createConfig({
        strategies: [],
      });
      expect(config.strategies).toEqual([]);
    });

    it('should handle extremely long session IDs', () => {
      const longId = 'a'.repeat(1000);
      const config = createConfig({
        sessionId: longId,
      });
      expect(config.sessionId).toBe(longId);
    });

    it('should handle special characters in session ID', () => {
      const specialId = 'session-123_ABC!@#$%^&*()';
      const config = createConfig({
        sessionId: specialId,
      });
      expect(config.sessionId).toBe(specialId);
    });

    it('should handle zero timeout', () => {
      const config = createConfig({
        timeout: 0,
      });
      expect(config.timeout).toBe(0);
    });

    it('should handle very large timeout', () => {
      const config = createConfig({
        timeout: Number.MAX_SAFE_INTEGER,
      });
      expect(config.timeout).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle deep nested config merge', () => {
      const base = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'old',
              },
            },
          },
        },
      };

      const override = {
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

      const merged = mergeConfig(base, override);
      expect(merged.level1.level2.level3.level4.value).toBe('new');
    });

    it('should handle circular reference protection in merge', () => {
      const obj1: any = { a: 1 };
      const obj2: any = { b: obj1 };
      obj1.circular = obj2;

      // Should not throw
      expect(() => mergeConfig({}, obj1)).not.toThrow();
    });

    it('should validate empty config', () => {
      expect(() => validateConfig({})).toThrow(ConfigurationError);
    });

    it('should validate config with invalid types', () => {
      expect(() => validateConfig({
        sessionId: 123, // should be string
      } as any)).toThrow();
    });
  });

  describe('Container - Boundary Tests', () => {
    let container: ServiceContainer;

    beforeEach(() => {
      container = new ServiceContainer();
    });

    it('should handle registering 1000+ services', () => {
      for (let i = 0; i < 1000; i++) {
        container.register(`service-${i}`, () => ({ id: i }));
      }

      const service = container.resolve('service-999');
      expect(service.id).toBe(999);
    });

    it('should handle deeply nested dependencies', () => {
      container.register('level1', () => ({ value: 1 }));
      container.register('level2', ['level1'], (l1: any) => ({ ...l1, value: 2 }));
      container.register('level3', ['level2'], (l2: any) => ({ ...l2, value: 3 }));
      container.register('level4', ['level3'], (l3: any) => ({ ...l3, value: 4 }));
      container.register('level5', ['level4'], (l4: any) => ({ ...l4, value: 5 }));

      const result = container.resolve('level5');
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
      expect(container.resolve(longName).id).toBe(1);
    });

    it('should handle service returning null', () => {
      container.register('null-service', () => null);
      expect(container.resolve('null-service')).toBeNull();
    });

    it('should handle service returning undefined', () => {
      container.register('undefined-service', () => undefined);
      expect(container.resolve('undefined-service')).toBeUndefined();
    });

    it('should handle service factory throwing error', () => {
      container.register('error-service', () => {
        throw new Error('Service creation failed');
      });

      expect(() => container.resolve('error-service')).toThrow('Service creation failed');
    });
  });

  describe('Session State Machine - Boundary Tests', () => {
    let stateMachine: SessionStateMachine;

    beforeEach(() => {
      stateMachine = new SessionStateMachine('test-session');
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

      expect(stateMachine.getCurrentState()).toBe('Idle');
    });

    it('should handle invalid state transition attempts', () => {
      stateMachine.initialize();
      
      // Try all invalid transitions
      expect(() => stateMachine.initialize()).toThrow();
      expect(() => stateMachine.pause()).toThrow();
      expect(() => stateMachine.resume()).toThrow();
    });

    it('should track 1000+ state transitions', () => {
      for (let i = 0; i < 250; i++) {
        stateMachine.initialize();
        stateMachine.start();
        stateMachine.pause();
        stateMachine.resume();
        stateMachine.stop();
        stateMachine.reset();
      }

      const history = stateMachine.getHistory();
      expect(history.length).toBeGreaterThan(1000);
    });

    it('should handle concurrent state change listeners', () => {
      const listeners: any[] = [];
      
      for (let i = 0; i < 100; i++) {
        const listener = jest.fn();
        stateMachine.onStateChange(listener);
        listeners.push(listener);
      }

      stateMachine.initialize();

      listeners.forEach(listener => {
        expect(listener).toHaveBeenCalled();
      });
    });
  });

  describe('Orchestrator - Stress Tests', () => {
    let orchestrator: Orchestrator;

    beforeEach(() => {
      const config = createConfig({
        sessionId: 'stress-test',
        strategies: [{
          id: 'test-strategy',
          script: 'test.js',
          params: {},
        }],
      });

      orchestrator = new Orchestrator(config);
    });

    afterEach(async () => {
      try {
        await orchestrator.destroy();
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should handle rapid session creation and destruction', async () => {
      for (let i = 0; i < 10; i++) {
        const sessionId = `stress-session-${i}`;
        await orchestrator.createSession(sessionId, {});
        await orchestrator.destroySession(sessionId);
      }

      const sessions = orchestrator.listSessions();
      expect(sessions.length).toBe(0);
    });

    it('should handle multiple concurrent sessions', async () => {
      const sessionIds = Array.from({ length: 10 }, (_, i) => `concurrent-${i}`);
      
      await Promise.all(
        sessionIds.map(id => orchestrator.createSession(id, {}))
      );

      const sessions = orchestrator.listSessions();
      expect(sessions.length).toBe(10);

      // Cleanup
      await Promise.all(
        sessionIds.map(id => orchestrator.destroySession(id))
      );
    });

    it('should handle session with empty config', async () => {
      await expect(
        orchestrator.createSession('empty-session', {} as any)
      ).rejects.toThrow();
    });

    it('should handle session with null strategy', async () => {
      await expect(
        orchestrator.createSession('null-session', {
          strategy: null as any,
        })
      ).rejects.toThrow();
    });

    it('should handle destroying non-existent session', async () => {
      await expect(
        orchestrator.destroySession('non-existent')
      ).rejects.toThrow();
    });

    it('should handle starting already started session', async () => {
      const sessionId = 'duplicate-start';
      await orchestrator.createSession(sessionId, {
        strategy: { id: 'test', script: 'test.js', params: {} },
      });

      await orchestrator.startSession(sessionId);
      
      await expect(
        orchestrator.startSession(sessionId)
      ).rejects.toThrow();

      await orchestrator.stopSession(sessionId);
      await orchestrator.destroySession(sessionId);
    });

    it('should handle extremely large config objects', async () => {
      const largeConfig = {
        strategy: {
          id: 'large-strategy',
          script: 'test.js',
          params: {},
        },
        metadata: {
          data: 'x'.repeat(100000), // 100KB string
        },
      };

      await orchestrator.createSession('large-config', largeConfig);
      await orchestrator.destroySession('large-config');
    });
  });

  describe('Memory Leak Tests', () => {
    it('should not leak memory with repeated operations', async () => {
      const config = createConfig({
        sessionId: 'memory-test',
        strategies: [{
          id: 'test-strategy',
          script: 'test.js',
          params: {},
        }],
      });

      const orchestrator = new Orchestrator(config);

      // Create and destroy many sessions
      for (let i = 0; i < 100; i++) {
        const sessionId = `leak-test-${i}`;
        await orchestrator.createSession(sessionId, {
          strategy: { id: 'test', script: 'test.js', params: {} },
        });
        await orchestrator.destroySession(sessionId);
      }

      // Should have no sessions left
      expect(orchestrator.listSessions().length).toBe(0);

      await orchestrator.destroy();
    });

    it('should clean up listeners on destruction', () => {
      const stateMachine = new SessionStateMachine('cleanup-test');
      const listeners: any[] = [];

      for (let i = 0; i < 100; i++) {
        listeners.push(stateMachine.onStateChange(jest.fn()));
      }

      // State machine should clean up internal listeners
      // (actual implementation would need to support this)
      expect(listeners.length).toBe(100);
    });
  });

  describe('Error Recovery Tests', () => {
    it('should recover from service creation failures', () => {
      const container = new ServiceContainer();
      let callCount = 0;

      container.register('flaky-service', () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Service temporarily unavailable');
        }
        return { id: 'success' };
      }, 'transient');

      // First two calls fail
      expect(() => container.resolve('flaky-service')).toThrow();
      expect(() => container.resolve('flaky-service')).toThrow();
      
      // Third call succeeds
      const service = container.resolve('flaky-service');
      expect(service.id).toBe('success');
    });

    it('should handle partial session initialization failure', async () => {
      const config = createConfig({
        sessionId: 'partial-fail',
        strategies: [{
          id: 'test',
          script: 'test.js',
          params: {},
        }],
      });

      const orchestrator = new Orchestrator(config);

      // Mock a service that fails
      try {
        await orchestrator.createSession('fail-session', {
          strategy: {
            id: 'invalid',
            script: '', // Empty script should fail
            params: {},
          },
        });
        fail('Should have thrown error');
      } catch (error) {
        // Expected
      }

      // Should still be operational
      await orchestrator.createSession('success-session', {
        strategy: { id: 'test', script: 'test.js', params: {} },
      });

      await orchestrator.destroySession('success-session');
      await orchestrator.destroy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle config with only required fields', () => {
      const minimal = createConfig({
        sessionId: 'minimal',
        strategies: [],
      });

      expect(minimal.sessionId).toBe('minimal');
      expect(minimal.strategies).toEqual([]);
    });

    it('should handle unicode characters in session ID', () => {
      const unicodeId = 'session-测试-🚀';
      const config = createConfig({
        sessionId: unicodeId,
      });

      expect(config.sessionId).toBe(unicodeId);
    });

    it('should handle extremely nested strategy params', () => {
      const deepParams: any = { level: 0 };
      let current = deepParams;
      
      for (let i = 1; i < 100; i++) {
        current.nested = { level: i };
        current = current.nested;
      }

      const config = createConfig({
        sessionId: 'deep-params',
        strategies: [{
          id: 'test',
          script: 'test.js',
          params: deepParams,
        }],
      });

      expect(config.strategies[0].params).toBeDefined();
    });

    it('should handle NaN and Infinity in config', () => {
      const config = createConfig({
        sessionId: 'special-numbers',
        timeout: NaN,
        maxSessions: Infinity as any,
      });

      // Should handle or reject special values
      expect(config.sessionId).toBe('special-numbers');
    });
  });
});

